import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../../src/lib/supabase';
import { NineScreenLayoutManifest } from '../../src/types/layoutManifest';

const MANIFESTS_DIR = path.join(process.cwd(), '.data', 'layout_manifests');

function ensureManifestsDir() {
  try {
    if (!fs.existsSync(MANIFESTS_DIR)) {
      fs.mkdirSync(MANIFESTS_DIR, { recursive: true });
    }
  } catch (e) {}
}

// In-memory store
const inMemoryManifests = new Map<string, NineScreenLayoutManifest>();
// Map canvasId -> manifestIds[]
const canvasManifestIndex = new Map<string, string[]>();

function persistToDiskAtomic(manifest: NineScreenLayoutManifest) {
  ensureManifestsDir();
  try {
    const finalPath = path.join(MANIFESTS_DIR, `${manifest.manifestId}.json`);
    const tempPath = path.join(MANIFESTS_DIR, `${manifest.manifestId}.tmp.${Date.now()}`);
    fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), 'utf-8');
    fs.renameSync(tempPath, finalPath);
  } catch (e) {
    console.error('Failed to write layout manifest to disk:', e);
  }
}

function loadFromDisk() {
  ensureManifestsDir();
  try {
    const files = fs.readdirSync(MANIFESTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(MANIFESTS_DIR, file), 'utf-8');
        const m = JSON.parse(raw);
        if (m?.manifestId) {
          inMemoryManifests.set(m.manifestId, m);
          if (m.canvasId) {
            const list = canvasManifestIndex.get(m.canvasId) || [];
            if (!list.includes(m.manifestId)) {
              list.push(m.manifestId);
              canvasManifestIndex.set(m.canvasId, list);
            }
          }
        }
      }
    }
  } catch (e) {}
}

loadFromDisk();

export class LayoutManifestRepository {
  static async saveManifest(manifest: NineScreenLayoutManifest, userId?: string): Promise<NineScreenLayoutManifest> {
    inMemoryManifests.set(manifest.manifestId, manifest);
    
    if (manifest.canvasId) {
      const list = canvasManifestIndex.get(manifest.canvasId) || [];
      if (!list.includes(manifest.manifestId)) {
        list.push(manifest.manifestId);
        canvasManifestIndex.set(manifest.canvasId, list);
      }
    }

    persistToDiskAtomic(manifest);

    // Sync to Supabase if table exists
    try {
      await supabaseAdmin
        .from('canvas_layout_manifests')
        .upsert({
          id: manifest.manifestId,
          user_id: userId || 'system',
          project_id: manifest.projectId,
          canvas_id: manifest.canvasId,
          version_number: manifest.versionNumber || 1,
          version_code: manifest.versionCode || `V${String(manifest.versionNumber || 1).padStart(3, '0')}`,
          status: manifest.status,
          width_px: manifest.widthPx,
          target_height_px: manifest.targetHeightPx,
          total_computed_height_px: manifest.totalComputedHeightPx,
          manifest_json: manifest,
          checksum: manifest.checksum,
          parent_manifest_id: manifest.parentManifestId || null,
          approved_by: manifest.approvedBy || null,
          approved_at: manifest.approvedAt || null,
          created_at: manifest.createdAt,
          updated_at: manifest.updatedAt
        });
    } catch (e) {
      // Graceful fallback to file
    }

    return manifest;
  }

  static async getManifestById(manifestId: string): Promise<NineScreenLayoutManifest | null> {
    if (inMemoryManifests.has(manifestId)) {
      return inMemoryManifests.get(manifestId)!;
    }

    // Check disk
    const filePath = path.join(MANIFESTS_DIR, `${manifestId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const m = JSON.parse(raw);
        if (m?.manifestId) {
          inMemoryManifests.set(m.manifestId, m);
          return m;
        }
      } catch (e) {}
    }

    // Check Supabase
    try {
      const { data, error } = await supabaseAdmin
        .from('canvas_layout_manifests')
        .select('*')
        .eq('id', manifestId)
        .single();
      if (!error && data?.manifest_json) {
        inMemoryManifests.set(manifestId, data.manifest_json);
        persistToDiskAtomic(data.manifest_json);
        return data.manifest_json;
      }
    } catch (e) {}

    return null;
  }

  static async getManifestsByCanvasId(canvasId: string): Promise<NineScreenLayoutManifest[]> {
    const list: NineScreenLayoutManifest[] = [];
    const ids = canvasManifestIndex.get(canvasId) || [];

    for (const id of ids) {
      const m = await this.getManifestById(id);
      if (m) list.push(m);
    }

    // Also scan all in-memory
    for (const m of inMemoryManifests.values()) {
      if (m.canvasId === canvasId && !list.find(x => x.manifestId === m.manifestId)) {
        list.push(m);
      }
    }

    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return list;
  }

  static async getCurrentManifest(canvasId: string): Promise<NineScreenLayoutManifest | null> {
    const all = await this.getManifestsByCanvasId(canvasId);
    if (all.length === 0) return null;
    
    // Prefer latest approved, or latest draft
    const approved = all.find(m => m.status === 'approved');
    if (approved) return approved;
    return all[0];
  }
}
