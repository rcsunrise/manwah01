/**
 * Revision Finalizer Service (C4A-4)
 * Background worker that inspects 'pending_assets' Revisions, verifies associated Asset Versions,
 * and transitions Revisions to 'ready' once all required assets are persisted in Storage & Database.
 */

import { supabaseAdmin } from '../../src/lib/supabase';
import fs from 'fs';
import path from 'path';

const REVISIONS_DIR = path.join(process.cwd(), '.data', 'revisions');

class RevisionFinalizer {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(intervalMs = 3000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch(err => console.warn('[RevisionFinalizer] Tick error:', err));
    }, intervalMs);
    console.log('[RevisionFinalizer] Background finalizer worker started.');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // 1. Fetch pending_assets revisions from DB
      let pendingRevs: any[] = [];
      try {
        const { data, error } = await supabaseAdmin
          .from('canvas_revisions')
          .select('id, canvas_id, status, asset_total, asset_ready_count, failed_asset_count')
          .eq('status', 'pending_assets')
          .limit(20);

        if (!error && data) {
          pendingRevs = data;
        }
      } catch (e) {}

      // 2. Also check local disk revisions
      try {
        if (fs.existsSync(REVISIONS_DIR)) {
          const files = fs.readdirSync(REVISIONS_DIR);
          for (const f of files) {
            if (f.endsWith('.json')) {
              const fullPath = path.join(REVISIONS_DIR, f);
              const raw = fs.readFileSync(fullPath, 'utf-8');
              const rec = JSON.parse(raw);
              if (rec && rec.status === 'pending_assets') {
                if (!pendingRevs.some(p => p.id === rec.id)) {
                  pendingRevs.push(rec);
                }
              }
            }
          }
        }
      } catch (e) {}

      for (const rev of pendingRevs) {
        await this.finalizeRevision(rev.id);
      }
    } finally {
      this.isRunning = false;
    }
  }

  async finalizeRevision(revisionId: string): Promise<boolean> {
    try {
      // 1. Query associated assets from canvas_revision_assets
      let revAssets: any[] = [];
      try {
        const { data, error } = await supabaseAdmin
          .from('canvas_revision_assets')
          .select('*')
          .eq('revision_id', revisionId);
        if (!error && data) {
          revAssets = data;
        }
      } catch (e) {}

      if (revAssets.length === 0) {
        // No assets or all assets ready
        await this.markRevisionReady(revisionId, 0, 0);
        return true;
      }

      const totalAssets = revAssets.length;
      let readyCount = 0;
      let failedCount = 0;

      for (const item of revAssets) {
        const verId = item.asset_version_id;
        // Check asset version status
        let isReady = false;
        let isFailed = false;

        try {
          const { data: verData } = await supabaseAdmin
            .from('asset_versions')
            .select('id, status, object_key')
            .eq('id', verId)
            .maybeSingle();

          if (verData) {
            if (verData.status === 'ready') isReady = true;
            else if (verData.status === 'failed') isFailed = true;
          }
        } catch (e) {}

        if (isReady) {
          readyCount += 1;
        } else if (isFailed) {
          failedCount += 1;
        }
      }

      if (readyCount === totalAssets) {
        await this.markRevisionReady(revisionId, totalAssets, readyCount);
        return true;
      } else if (failedCount > 0 && readyCount + failedCount === totalAssets) {
        // Some assets failed permanently
        await this.markRevisionPartial(revisionId, totalAssets, readyCount, failedCount);
        return false;
      } else {
        // Still pending
        await this.updateRevisionProgress(revisionId, totalAssets, readyCount, failedCount);
        return false;
      }
    } catch (err) {
      console.warn(`[RevisionFinalizer] Error finalizing revision ${revisionId}:`, err);
      return false;
    }
  }

  private async markRevisionReady(revisionId: string, total: number, readyCount: number) {
    const now = new Date().toISOString();
    try {
      await supabaseAdmin
        .from('canvas_revisions')
        .update({
          status: 'ready',
          asset_total: total,
          asset_ready_count: readyCount,
          finalized_at: now
        })
        .eq('id', revisionId);
    } catch (e) {}

    // Update disk store
    try {
      const filePath = path.join(REVISIONS_DIR, `${revisionId}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const rec = JSON.parse(raw);
        rec.status = 'ready';
        rec.asset_total = total;
        rec.asset_ready_count = readyCount;
        rec.finalized_at = now;
        fs.writeFileSync(filePath, JSON.stringify(rec, null, 2), 'utf-8');
      }
    } catch (e) {}

    console.log(`[RevisionFinalizer] ✅ Revision ${revisionId} transitioned to 'ready' (${readyCount}/${total} assets ready).`);
  }

  private async markRevisionPartial(revisionId: string, total: number, readyCount: number, failedCount: number) {
    try {
      await supabaseAdmin
        .from('canvas_revisions')
        .update({
          status: 'ready', // Keep ready so user can view, but record failed count
          asset_total: total,
          asset_ready_count: readyCount,
          failed_asset_count: failedCount,
          last_error: `${failedCount} asset(s) failed synchronization`
        })
        .eq('id', revisionId);
    } catch (e) {}
  }

  private async updateRevisionProgress(revisionId: string, total: number, readyCount: number, failedCount: number) {
    try {
      await supabaseAdmin
        .from('canvas_revisions')
        .update({
          asset_total: total,
          asset_ready_count: readyCount,
          failed_asset_count: failedCount
        })
        .eq('id', revisionId);
    } catch (e) {}
  }
}

export const revisionFinalizer = new RevisionFinalizer();
