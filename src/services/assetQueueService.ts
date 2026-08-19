/**
 * Asset Upload Queue & Consolidation Service (C4A-4)
 * - IndexedDB-backed resilient job queue
 * - Concurrency limit: 2
 * - TUS resumable uploads for large files (>6MB)
 * - Standard upload for small files (<=6MB)
 * - Exponential backoff retry [0, 3s, 5s, 10s, 20s], max 5 attempts
 * - Page refresh & network disconnect auto-resume
 */

import * as tus from 'tus-js-client';
import { supabase, supabaseAdmin } from '../lib/supabase';

export type AssetJobStatus =
  | 'queued'
  | 'uploading'
  | 'verifying'
  | 'completed'
  | 'retry_wait'
  | 'failed';

export interface AssetUploadJob {
  jobId: string;
  assetVersionId: string;
  workspaceId: string;
  nodeId: string;
  blob?: Blob;
  dataUrl?: string;
  sourceUrl?: string;
  objectKey: string;
  previewObjectKey?: string;
  thumbnailObjectKey?: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceAspectRatio: string;
  status: AssetJobStatus;
  uploadUrl?: string;
  uploadedBytes: number;
  totalBytes: number;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: number;
  updatedAt: number;
  idempotencyKey: string;
  provider?: string;
  model?: string;
}

const DB_NAME = 'manwah_creative_canvas_db';
const DB_VERSION = 1;
const STORE_NAME = 'asset_upload_jobs';
const CONCURRENCY_LIMIT = 2;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];
const MAX_ATTEMPTS = 5;
const LARGE_FILE_THRESHOLD = 6 * 1024 * 1024; // 6MB
const SUPABASE_STORAGE_BUCKET = 'creative-canvas-assets';

// IndexedDB Helper
class AssetJobStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this environment'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
          store.createIndex('assetVersionId', 'assetVersionId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('workspaceId', 'workspaceId', { unique: false });
          store.createIndex('nodeId', 'nodeId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async saveJob(job: AssetUploadJob): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(job);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[AssetJobStore] Failed to save job in IndexedDB:', e);
    }
  }

  async getJob(jobId: string): Promise<AssetUploadJob | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(jobId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  async getJobsByWorkspace(workspaceId: string): Promise<AssetUploadJob[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []) as AssetUploadJob[];
          resolve(list.filter(j => j.workspaceId === workspaceId));
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return [];
    }
  }

  async getAllUnfinishedJobs(): Promise<AssetUploadJob[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []) as AssetUploadJob[];
          resolve(list.filter(j => j.status !== 'completed'));
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return [];
    }
  }

  async removeJobBlob(jobId: string): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (job) {
        delete job.blob;
        delete job.dataUrl;
        await this.saveJob(job);
      }
    } catch (e) {}
  }
}

export const assetJobStore = new AssetJobStore();

type QueueSubscriber = (jobs: AssetUploadJob[], stats: QueueStats) => void;

export interface QueueStats {
  total: number;
  queued: number;
  uploading: number;
  verifying: number;
  completed: number;
  retryWait: number;
  failed: number;
  progressPercent: number;
}

class AssetQueueManager {
  private inMemoryJobs = new Map<string, AssetUploadJob>();
  private activeUploads = new Set<string>();
  private subscribers = new Set<QueueSubscriber>();
  private isProcessing = false;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private initialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.handleNetworkResume();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const uncompleted = await assetJobStore.getAllUnfinishedJobs();
      for (const job of uncompleted) {
        // If it was in uploading or verifying state when page refreshed, reset to queued
        if (job.status === 'uploading' || job.status === 'verifying') {
          job.status = 'queued';
        }
        this.inMemoryJobs.set(job.jobId, job);
      }
      this.notifySubscribers();
      this.processQueue();
    } catch (e) {
      console.warn('[AssetQueueManager] Initialization notice:', e);
    }
  }

  subscribe(callback: QueueSubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getJobList(), this.getStats());
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    const list = this.getJobList();
    const stats = this.getStats();
    for (const sub of this.subscribers) {
      try {
        sub(list, stats);
      } catch (e) {}
    }
  }

  getJobList(): AssetUploadJob[] {
    return Array.from(this.inMemoryJobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getJobForNode(nodeId: string): AssetUploadJob | undefined {
    return Array.from(this.inMemoryJobs.values()).find(j => j.nodeId === nodeId);
  }

  getJobForAssetVersion(assetVersionId: string): AssetUploadJob | undefined {
    return Array.from(this.inMemoryJobs.values()).find(j => j.assetVersionId === assetVersionId);
  }

  getStats(): QueueStats {
    const jobs = Array.from(this.inMemoryJobs.values());
    const total = jobs.length;
    const queued = jobs.filter(j => j.status === 'queued').length;
    const uploading = jobs.filter(j => j.status === 'uploading').length;
    const verifying = jobs.filter(j => j.status === 'verifying').length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const retryWait = jobs.filter(j => j.status === 'retry_wait').length;
    const failed = jobs.filter(j => j.status === 'failed').length;

    let totalBytes = 0;
    let uploadedBytes = 0;
    for (const j of jobs) {
      totalBytes += j.totalBytes || 1;
      uploadedBytes += j.status === 'completed' ? (j.totalBytes || 1) : (j.uploadedBytes || 0);
    }
    const progressPercent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 100;

    return {
      total,
      queued,
      uploading,
      verifying,
      completed,
      retryWait,
      failed,
      progressPercent
    };
  }

  /**
   * Enqueue a new asset for background consolidation
   */
  async enqueueAsset(params: {
    assetVersionId: string;
    workspaceId: string;
    nodeId: string;
    blob?: Blob;
    dataUrl?: string;
    sourceUrl?: string;
    objectKey: string;
    previewObjectKey?: string;
    thumbnailObjectKey?: string;
    mimeType?: string;
    byteSize?: number;
    checksum?: string;
    sourceWidth?: number;
    sourceHeight?: number;
    sourceAspectRatio?: string;
    idempotencyKey?: string;
    provider?: string;
    model?: string;
  }): Promise<AssetUploadJob> {
    const mimeType = params.mimeType || 'image/png';
    let byteSize = params.byteSize || 0;
    if (!byteSize && params.blob) {
      byteSize = params.blob.size;
    } else if (!byteSize && params.dataUrl) {
      byteSize = Math.round((params.dataUrl.length * 3) / 4);
    }

    const checksum = params.checksum || `chk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const idempotencyKey = params.idempotencyKey || `idem_${params.assetVersionId}_${checksum}`;

    const jobId = `job_${params.assetVersionId}`;

    // Check if job already exists
    const existing = this.inMemoryJobs.get(jobId);
    if (existing && (existing.status === 'completed' || existing.status === 'uploading')) {
      return existing;
    }

    const job: AssetUploadJob = {
      jobId,
      assetVersionId: params.assetVersionId,
      workspaceId: params.workspaceId,
      nodeId: params.nodeId,
      blob: params.blob,
      dataUrl: params.dataUrl,
      sourceUrl: params.sourceUrl,
      objectKey: params.objectKey,
      previewObjectKey: params.previewObjectKey,
      thumbnailObjectKey: params.thumbnailObjectKey,
      mimeType,
      byteSize,
      checksum,
      sourceWidth: params.sourceWidth || 1024,
      sourceHeight: params.sourceHeight || 1024,
      sourceAspectRatio: params.sourceAspectRatio || '3:4',
      status: 'queued',
      uploadedBytes: 0,
      totalBytes: byteSize,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      idempotencyKey,
      provider: params.provider,
      model: params.model
    };

    this.inMemoryJobs.set(jobId, job);
    await assetJobStore.saveJob(job);
    this.notifySubscribers();

    // Trigger queue processing
    this.processQueue();

    return job;
  }

  /**
   * Retry a single failed or retry_wait job
   */
  async retryJob(jobId: string): Promise<void> {
    const job = this.inMemoryJobs.get(jobId);
    if (!job) return;

    job.status = 'queued';
    job.attempts = 0;
    job.nextRetryAt = undefined;
    job.lastErrorCode = undefined;
    job.lastErrorMessage = undefined;
    job.updatedAt = Date.now();

    await assetJobStore.saveJob(job);
    this.notifySubscribers();
    this.processQueue();
  }

  private handleNetworkResume() {
    for (const job of this.inMemoryJobs.values()) {
      if (job.status === 'retry_wait') {
        job.status = 'queued';
        job.nextRetryAt = undefined;
      }
    }
    this.notifySubscribers();
    this.processQueue();
  }

  /**
   * Main Queue Worker
   */
  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.activeUploads.size < CONCURRENCY_LIMIT) {
        if (!this.isOnline) break;

        const now = Date.now();
        const pendingJobs = Array.from(this.inMemoryJobs.values()).filter(
          j =>
            !this.activeUploads.has(j.jobId) &&
            (j.status === 'queued' || (j.status === 'retry_wait' && j.nextRetryAt && j.nextRetryAt <= now))
        );

        if (pendingJobs.length === 0) break;

        const nextJob = pendingJobs[0];
        this.activeUploads.add(nextJob.jobId);
        nextJob.status = 'uploading';
        nextJob.attempts += 1;
        nextJob.updatedAt = Date.now();
        this.notifySubscribers();

        // Process asynchronously with isolated error boundary
        this.executeJob(nextJob)
          .catch(err => {
            console.error(`[AssetQueueManager] Uncaught job error for ${nextJob.jobId}:`, err);
          })
          .finally(() => {
            this.activeUploads.delete(nextJob.jobId);
            this.notifySubscribers();
            setTimeout(() => this.processQueue(), 100);
          });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(job: AssetUploadJob): Promise<void> {
    try {
      // 1. Obtain binary payload (Blob / ArrayBuffer)
      let uploadBlob: Blob | null = job.blob || null;

      if (!uploadBlob && job.dataUrl) {
        uploadBlob = dataUrlToBlob(job.dataUrl, job.mimeType);
      } else if (!uploadBlob && job.sourceUrl) {
        const resp = await fetch(job.sourceUrl);
        if (!resp.ok) throw new Error(`Failed to fetch source image URL: ${resp.status}`);
        uploadBlob = await resp.blob();
      }

      if (!uploadBlob || uploadBlob.size === 0) {
        throw new Error('No valid image payload found for upload job');
      }

      job.totalBytes = uploadBlob.size;

      // 2. Choose upload transport based on size
      if (uploadBlob.size > LARGE_FILE_THRESHOLD) {
        await this.uploadViaTUS(job, uploadBlob);
      } else {
        await this.uploadViaStandard(job, uploadBlob);
      }

      // 3. Verification step
      job.status = 'verifying';
      this.notifySubscribers();

      // Register / update Asset Version on server
      await this.registerAssetVersionOnServer(job);

      // 4. Mark completed & clean heavy Blob from IndexedDB
      job.status = 'completed';
      job.uploadedBytes = job.totalBytes;
      job.updatedAt = Date.now();
      await assetJobStore.saveJob(job);
      await assetJobStore.removeJobBlob(job.jobId);
      this.notifySubscribers();
    } catch (err: any) {
      console.warn(`[AssetQueueManager] Upload attempt ${job.attempts}/${job.maxAttempts} failed for ${job.jobId}:`, err);

      const isAuthError = err?.status === 401 || err?.message?.includes('JWT') || err?.message?.includes('auth');
      const isRlsError = err?.status === 403;
      const isConflict = err?.status === 409 || err?.message?.includes('already exists');

      if (isConflict) {
        // Idempotent success
        job.status = 'completed';
        job.uploadedBytes = job.totalBytes;
        job.updatedAt = Date.now();
        await assetJobStore.saveJob(job);
        this.notifySubscribers();
        return;
      }

      job.lastErrorCode = isAuthError ? 'AUTH_EXPIRED' : isRlsError ? 'RLS_DENIED' : 'NETWORK_ERROR';
      job.lastErrorMessage = err?.message || 'Upload failed';

      if (job.attempts < job.maxAttempts && !isRlsError) {
        job.status = 'retry_wait';
        const delay = RETRY_DELAYS[Math.min(job.attempts, RETRY_DELAYS.length - 1)];
        job.nextRetryAt = Date.now() + delay;
        setTimeout(() => this.processQueue(), delay + 50);
      } else {
        job.status = 'failed';
      }

      job.updatedAt = Date.now();
      await assetJobStore.saveJob(job);
      this.notifySubscribers();
    }
  }

  /**
   * Standard Upload (<=6MB)
   */
  private async uploadViaStandard(job: AssetUploadJob, blob: Blob): Promise<void> {
    const objectKey = job.objectKey;

    // Direct Supabase storage upload or backend proxy upload
    let uploadSuccess = false;

    try {
      const { error } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(objectKey, blob, {
          contentType: job.mimeType,
          upsert: false
        });

      if (!error || error.message?.includes('already exists') || (error as any).statusCode === '409') {
        uploadSuccess = true;
      }
    } catch (e) {
      // Fallback via server API
    }

    if (!uploadSuccess) {
      // Proxy upload via server
      const formData = new FormData();
      formData.append('file', blob, 'image.png');
      formData.append('objectKey', objectKey);
      formData.append('assetVersionId', job.assetVersionId);
      formData.append('workspaceId', job.workspaceId);
      formData.append('mimeType', job.mimeType);
      formData.append('checksum', job.checksum);

      const res = await fetch('/api/asset-skus/upload-asset', {
        method: 'POST',
        body: formData
      });

      if (!res.ok && res.status !== 409) {
        throw new Error(`Server upload proxy failed: ${res.status}`);
      }
    }
  }

  /**
   * TUS Resumable Upload (>6MB)
   */
  private async uploadViaTUS(job: AssetUploadJob, blob: Blob): Promise<void> {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://qwxrqjofj5qy3ob7yuuy.supabase.co';
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

    // Extract project ref from URL
    const urlMatch = supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/);
    const projectRef = urlMatch ? urlMatch[1] : 'qwxrqjofj5qy3ob7yuuy';
    const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(blob, {
        endpoint,
        retryDelays: RETRY_DELAYS,
        chunkSize: 6 * 1024 * 1024, // 6MB Chunk size
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        headers: {
          authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          'x-upsert': 'false'
        },
        metadata: {
          bucketName: SUPABASE_STORAGE_BUCKET,
          objectName: job.objectKey,
          contentType: job.mimeType,
          cacheControl: '3600'
        },
        onError: error => {
          console.warn('[TUS] Upload error:', error);
          reject(error);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          job.uploadedBytes = bytesUploaded;
          job.totalBytes = bytesTotal;
          this.notifySubscribers();
        },
        onSuccess: () => {
          resolve();
        }
      });

      // Find previous upload to resume if available
      upload.findPreviousUploads().then(previousUploads => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      }).catch(() => {
        upload.start();
      });
    });
  }

  private async registerAssetVersionOnServer(job: AssetUploadJob): Promise<void> {
    try {
      await fetch('/api/asset-skus/register-version-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetVersionId: job.assetVersionId,
          workspaceId: job.workspaceId,
          nodeId: job.nodeId,
          objectKey: job.objectKey,
          checksum: job.checksum,
          mimeType: job.mimeType,
          byteSize: job.totalBytes,
          sourceWidth: job.sourceWidth,
          sourceHeight: job.sourceHeight,
          sourceAspectRatio: job.sourceAspectRatio,
          idempotencyKey: job.idempotencyKey,
          status: 'ready'
        })
      });
    } catch (e) {
      console.warn('[AssetQueueManager] Failed to notify server of asset ready status:', e);
    }
  }
}

export const assetQueueManager = new AssetQueueManager();

function dataUrlToBlob(dataUrl: string, fallbackMime = 'image/png'): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
