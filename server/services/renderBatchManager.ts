import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  RenderBatch,
  RenderTask,
  RenderTaskStatus,
  RenderBatchStatus,
  ImageBillingRecord,
  DetailPagePlan,
  DetailPageScreenPlan,
  ProductVisualDNA
} from '../../src/types';
import { compileScreenPrompt } from '../ai/promptCompiler';
import { executeMockImageTransport } from '../ai/mockImageTransport';
import { AppError } from '../types';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORAGE_FILE = path.join(DATA_DIR, 'render_batches.json');

const ALLOWED_TASK_TRANSITIONS: Record<RenderTaskStatus, RenderTaskStatus[]> = {
  pending: ['queued', 'cancelled', 'blocked'],
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  failed: ['queued'], // Explicit retry required
  succeeded: ['queued'], // Allow explicit redo / re-render versioning
  cancelled: ['queued'],
  blocked: ['queued', 'cancelled']
};

export class RenderBatchManager {
  private static instance: RenderBatchManager;
  private batches = new Map<string, RenderBatch>();
  private tasks = new Map<string, RenderTask>();
  private idempotencyStore = new Map<string, RenderTask>();
  private billingLedger = new Map<string, ImageBillingRecord[]>();

  constructor() {
    this.loadFromDisk();
  }

  public static getInstance(): RenderBatchManager {
    if (!RenderBatchManager.instance) {
      RenderBatchManager.instance = new RenderBatchManager();
    }
    return RenderBatchManager.instance;
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        batches: Array.from(this.batches.entries()),
        tasks: Array.from(this.tasks.entries()),
        idempotencyStore: Array.from(this.idempotencyStore.entries()),
        billingLedger: Array.from(this.billingLedger.entries())
      };
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RenderBatchManager] Failed to persist data to disk:', err);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.batches) this.batches = new Map(parsed.batches);
        if (parsed.tasks) this.tasks = new Map(parsed.tasks);
        if (parsed.idempotencyStore) this.idempotencyStore = new Map(parsed.idempotencyStore);
        if (parsed.billingLedger) this.billingLedger = new Map(parsed.billingLedger);
        console.log(`[RenderBatchManager] Successfully restored ${this.batches.size} batches from disk persistence.`);
      }
    } catch (err) {
      console.error('[RenderBatchManager] Failed to load persisted data from disk:', err);
    }
  }

  public calculateIdempotencyKey(params: {
    workspaceId: string;
    planId: string;
    planVersion: number;
    screenIndex: number;
    provider: string;
    model: string;
    operation: string;
    promptHash: string;
    referenceAssetVersionIds: string[];
    size: string;
    attempt?: number;
  }): string {
    const raw = [
      params.workspaceId,
      params.planId,
      params.planVersion,
      params.screenIndex,
      params.provider,
      params.model,
      params.operation,
      params.promptHash,
      params.referenceAssetVersionIds.sort().join(','),
      params.size,
      params.attempt || 1
    ].join('::');

    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  public validateTaskStatusTransition(current: RenderTaskStatus, target: RenderTaskStatus): void {
    const allowed = ALLOWED_TASK_TRANSITIONS[current] || [];
    if (!allowed.includes(target)) {
      throw new AppError(
        `非法的任务状态转换: 不能从 ${current} 切换至 ${target}`,
        400,
        'INVALID_TASK_TRANSITION'
      );
    }
  }

  public async createRenderBatch(params: {
    workspaceId: string;
    conversationId: string;
    plan: DetailPagePlan;
    provider: string;
    model: string;
    screenIndexes?: number[];
    resolution?: string;
    concurrency?: number;
    confirmPaidCalls?: boolean;
    dna?: ProductVisualDNA | null;
  }): Promise<{ batch: RenderBatch; reusedTaskCount: number }> {
    const {
      workspaceId,
      conversationId,
      plan,
      provider,
      model,
      screenIndexes = [1, 2, 3, 4, 5, 6, 7, 8, 9],
      resolution = '1K',
      concurrency = 2,
      dna = null
    } = params;

    if (!plan || !Array.isArray(plan.screens) || plan.screens.length !== 9) {
      throw new AppError('九屏计划不满足 screens.length=9', 400, 'DETAIL_PLAN_SCREEN_COUNT_INVALID');
    }

    const validScreenIndexes = screenIndexes.filter(idx => idx >= 1 && idx <= 9);
    if (validScreenIndexes.length === 0) {
      throw new AppError('请求的屏幕编号列表无效', 400, 'INVALID_SCREEN_INDEXES');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const batch: RenderBatch = {
      id: batchId,
      workspaceId,
      conversationId,
      planId: plan.projectId,
      planVersion: plan.version,
      screenCount: 9,
      status: 'queued',
      requestedModel: model,
      requestedProvider: provider,
      concurrency: Math.min(Math.max(concurrency, 1), 4),
      estimatedMaxCalls: validScreenIndexes.length,
      actualCalls: 0,
      billableCalls: 0,
      createdAt: now,
      tasks: []
    };

    let reusedTaskCount = 0;
    const tasksForBatch: RenderTask[] = [];

    for (const screenIndex of validScreenIndexes) {
      const screenSnapshot = plan.screens.find(s => s.screenIndex === screenIndex);
      if (!screenSnapshot) continue;

      const compiled = compileScreenPrompt({
        screenSnapshot,
        dna,
        aspectRatio: screenSnapshot.aspectRatio || '3:4'
      });

      const sizeStr = resolution === '4K' ? '2048x2048' : resolution === '2K' ? '1536x1536' : '1024x1024';

      const idempotencyKey = this.calculateIdempotencyKey({
        workspaceId,
        planId: plan.projectId,
        planVersion: plan.version,
        screenIndex,
        provider,
        model,
        operation: 'generate',
        promptHash: compiled.promptHash,
        referenceAssetVersionIds: compiled.referenceAssetVersionIds,
        size: sizeStr,
        attempt: 1
      });

      // Check if task with identical idempotencyKey was already succeeded
      const existingSuccess = this.idempotencyStore.get(idempotencyKey);
      if (existingSuccess && existingSuccess.status === 'succeeded') {
        reusedTaskCount++;
        const reusedTask: RenderTask = {
          ...existingSuccess,
          id: `task_${batchId}_s${screenIndex}_reused`,
          batchId,
          updatedAt: new Date().toISOString()
        };
        tasksForBatch.push(reusedTask);
        this.tasks.set(reusedTask.id, reusedTask);
        continue;
      }

      const taskId = `task_${batchId}_s${screenIndex}_a1`;
      const task: RenderTask = {
        id: taskId,
        batchId,
        screenIndex,
        screenSnapshot,
        promptSnapshot: compiled.promptSnapshot,
        promptHash: compiled.promptHash,
        aspectRatio: screenSnapshot.aspectRatio || '3:4',
        resolution,
        expectedSize: sizeStr,
        status: 'pending',
        attempt: 1,
        idempotencyKey,
        createdAt: now,
        updatedAt: now
      };

      this.tasks.set(taskId, task);
      tasksForBatch.push(task);
    }

    batch.tasks = tasksForBatch;
    this.batches.set(batchId, batch);
    this.saveToDisk();

    // Auto-start queue execution in background using Mock Transport (G0-2A)
    this.processBatchQueue(batchId).catch(err => {
      console.error(`[RenderBatchManager] Batch ${batchId} processing error:`, err);
    });

    return { batch, reusedTaskCount };
  }

  private async processBatchQueue(batchId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch || batch.status === 'cancelled') return;

    batch.status = 'running';
    batch.startedAt = batch.startedAt || new Date().toISOString();

    const pendingTasks = batch.tasks?.filter(t => t.status === 'pending' || t.status === 'queued') || [];

    for (const task of pendingTasks) {
      const currentBatch = this.batches.get(batchId);
      if (!currentBatch || currentBatch.status === 'cancelled') break;

      try {
        this.validateTaskStatusTransition(task.status, 'queued');
        task.status = 'queued';
        task.updatedAt = new Date().toISOString();

        this.validateTaskStatusTransition(task.status, 'running');
        task.status = 'running';
        task.updatedAt = new Date().toISOString();

        // G0-2A: Always execute Mock Transport (Zero Cost, 0 real image calls, 0 billable calls)
        const mockResult = await executeMockImageTransport(task);

        this.validateTaskStatusTransition(task.status, 'succeeded');
        task.status = 'succeeded';
        task.providerRequestId = mockResult.providerRequestId;
        task.resultImageUrl = mockResult.resultImageUrl;
        task.actualWidth = mockResult.actualWidth;
        task.actualHeight = mockResult.actualHeight;
        task.billable = false;
        task.estimatedCostUsd = 0;
        task.assetId = `asset_${batch.planId}_s${task.screenIndex}_v1`;
        task.updatedAt = new Date().toISOString();

        batch.actualCalls += 0; // 0 real calls for mock
        batch.billableCalls += 0;

        // Store in idempotency store
        this.idempotencyStore.set(task.idempotencyKey, task);

        // Record zero-cost billing record
        const ledgerItem: ImageBillingRecord = {
          taskId: task.id,
          batchId: batch.id,
          provider: 'mock_transport',
          model: 'mock-transport-g0-2a',
          attemptedCalls: 0,
          billableCalls: 0,
          pricingSource: 'G0-2A Mock Transport (Zero Cost)',
          unitPrice: 0,
          estimatedCostUsd: 0,
          currency: 'USD',
          recordedAt: new Date().toISOString()
        };
        const existingRecords = this.billingLedger.get(batchId) || [];
        existingRecords.push(ledgerItem);
        this.billingLedger.set(batchId, existingRecords);

      } catch (err: any) {
        task.status = 'failed';
        task.errorCode = err?.code || 'RENDER_TASK_FAILED';
        task.errorMessage = err?.message || '渲染任务执行失败';
        task.updatedAt = new Date().toISOString();
      }
    }

    // Evaluate overall batch status
    const allTasks = batch.tasks || [];
    const succeededCount = allTasks.filter(t => t.status === 'succeeded').length;
    const failedCount = allTasks.filter(t => t.status === 'failed').length;

    if (succeededCount === allTasks.length) {
      batch.status = 'completed';
    } else if (failedCount > 0 && succeededCount > 0) {
      batch.status = 'partial_failed';
    } else if (failedCount === allTasks.length) {
      batch.status = 'failed';
    }
    batch.finishedAt = new Date().toISOString();
    this.saveToDisk();
  }

  public getBatch(batchId: string): RenderBatch | null {
    const batch = this.batches.get(batchId);
    if (!batch) return null;
    const batchTasks = (batch.tasks || []).map(t => this.tasks.get(t.id) || t);
    return {
      ...batch,
      tasks: batchTasks
    };
  }

  public async retryTask(taskId: string, customPrompt?: string): Promise<RenderTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new AppError('渲染任务不存在', 404, 'RENDER_TASK_NOT_FOUND');
    }

    if (task.status !== 'failed' && task.status !== 'cancelled' && task.status !== 'succeeded') {
      throw new AppError(`任务处于 ${task.status} 状态，不能重试或重构`, 400, 'RENDER_TASK_NOT_RETRYABLE');
    }

    const batch = this.batches.get(task.batchId);
    if (!batch) {
      throw new AppError('关联的批次不存在', 404, 'RENDER_BATCH_NOT_FOUND');
    }

    // Increment attempt and update idempotency key
    task.attempt += 1;
    if (customPrompt) {
      task.promptSnapshot = customPrompt;
      task.promptHash = crypto.createHash('sha256').update(customPrompt).digest('hex');
    }

    task.idempotencyKey = this.calculateIdempotencyKey({
      workspaceId: batch.workspaceId,
      planId: batch.planId,
      planVersion: batch.planVersion,
      screenIndex: task.screenIndex,
      provider: batch.requestedProvider,
      model: batch.requestedModel,
      operation: 'retry',
      promptHash: task.promptHash || '',
      referenceAssetVersionIds: [],
      size: task.expectedSize,
      attempt: task.attempt
    });

    this.validateTaskStatusTransition(task.status, 'queued');
    task.status = 'queued';
    task.errorCode = undefined;
    task.errorMessage = undefined;
    task.updatedAt = new Date().toISOString();

    this.validateTaskStatusTransition(task.status, 'running');
    task.status = 'running';
    task.updatedAt = new Date().toISOString();

    // Execute Mock Transport
    const mockResult = await executeMockImageTransport(task);

    this.validateTaskStatusTransition(task.status, 'succeeded');
    task.status = 'succeeded';
    task.providerRequestId = mockResult.providerRequestId;
    task.resultImageUrl = mockResult.resultImageUrl;
    task.actualWidth = mockResult.actualWidth;
    task.actualHeight = mockResult.actualHeight;
    task.billable = false;
    task.estimatedCostUsd = 0;
    task.assetId = `asset_${batch.planId}_s${task.screenIndex}_v${task.attempt}`;
    task.updatedAt = new Date().toISOString();

    this.idempotencyStore.set(task.idempotencyKey, task);

    // Update batch status if all succeed now
    const allTasks = batch.tasks || [];
    const succeededCount = allTasks.filter(t => (this.tasks.get(t.id)?.status || t.status) === 'succeeded').length;
    if (succeededCount === allTasks.length) {
      batch.status = 'completed';
    } else {
      batch.status = 'partial_failed';
    }

    this.saveToDisk();
    return task;
  }

  public cancelBatch(batchId: string): RenderBatch {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new AppError('渲染批次不存在', 404, 'RENDER_BATCH_NOT_FOUND');
    }

    batch.status = 'cancelled';
    batch.finishedAt = new Date().toISOString();

    if (batch.tasks) {
      for (const t of batch.tasks) {
        if (t.status === 'pending' || t.status === 'queued' || t.status === 'running') {
          t.status = 'cancelled';
          t.updatedAt = new Date().toISOString();
          this.tasks.set(t.id, t);
        }
      }
    }

    this.saveToDisk();
    return batch;
  }

  public getBillingLedger(batchId: string): ImageBillingRecord[] {
    return this.billingLedger.get(batchId) || [];
  }
}

export const renderBatchManager = RenderBatchManager.getInstance();
