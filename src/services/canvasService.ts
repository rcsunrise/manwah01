import {
  CanvasRecord,
  CanvasRevisionRecord,
  SerializableNode,
  SerializableEdge,
  ViewportState
} from '../types/creativeCanvas';
import { logCanvasDiagnostic } from '../utils/canvasDiagnostic';
import { supabase } from '../lib/supabase';
import { buildRevisionManifest, cleanNodeDataForManifest, RevisionManifest } from './manifestService';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (e) {}
  return headers;
}

export interface PersistenceHealthResult {
  ready: boolean;
  schemaVersion: string;
  storageMedium: string;
  checks: {
    creativeProjects: string;
    creativeCanvases: string;
    agentConversations: string;
    agentMessages: string;
  };
}

export const canvasService = {
  // Get existing canvas or create placeholder
  async getCanvas(canvasIdOrProjectId: string): Promise<CanvasRecord> {
    const url = `/api/canvases/${canvasIdOrProjectId}`;
    logCanvasDiagnostic({
      canvasId: canvasIdOrProjectId,
      source: 'get_canvas_request',
      url
    });

    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      method: 'GET',
      headers
    });
    const json = await res.json();

    logCanvasDiagnostic({
      canvasId: canvasIdOrProjectId,
      source: 'get_canvas_response',
      statusCode: res.status,
      success: Boolean(json.success),
      storageMode: json.storageMedium || 'cloud',
      nodesCount: (json.canvas?.nodes_draft || json.canvas?.nodesDraft || []).length,
      edgesCount: (json.canvas?.edges_draft || json.canvas?.edgesDraft || []).length,
      snapshotChecksum: json.canvas?.snapshotChecksum
    });

    if (!res.ok || !json.success) {
      const err: any = new Error(json.error || json.message || '获取画布数据失败');
      err.code = json.code;
      err.httpStatus = res.status;
      throw err;
    }
    const canvas = json.canvas;
    if (canvas) {
      canvas.storageMedium = json.storageMedium || 'cloud';
    }
    return canvas;
  },

  // Save current working draft with auto-save
  async saveCanvasDraft(
    canvasId: string,
    payload: {
      nodesDraft: SerializableNode[];
      edgesDraft: SerializableEdge[];
      viewportDraft: ViewportState;
      canvasName?: string;
      hasExplicitUserClear?: boolean;
      expectedUpdatedAt?: string;
      checksum?: string;
    }
  ): Promise<{ lastSavedAt: string; canvas: CanvasRecord; storageMedium: 'cloud' | 'local' | 'memory' }> {
    const url = `/api/canvases/${canvasId}/draft`;
    logCanvasDiagnostic({
      canvasId,
      source: 'save_draft_request',
      nodesCount: payload.nodesDraft.length,
      edgesCount: payload.edgesDraft.length,
      hasExplicitUserClear: Boolean(payload.hasExplicitUserClear)
    });

    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    logCanvasDiagnostic({
      canvasId,
      source: 'save_draft_response',
      statusCode: res.status,
      success: Boolean(json.success),
      storageMode: json.storageMedium,
      nodesCount: (json.canvas?.nodes_draft || json.canvas?.nodesDraft || []).length,
      edgesCount: (json.canvas?.edges_draft || json.canvas?.edgesDraft || []).length
    });

    if (!res.ok || !json.success) {
      const err: any = new Error(json.error || json.message || '保存画布草稿失败');
      err.code = json.code;
      err.httpStatus = res.status;
      throw err;
    }
    return {
      lastSavedAt: json.lastSavedAt,
      canvas: json.canvas,
      storageMedium: json.storageMedium || 'cloud'
    };
  },

  // Helper to persist revision to localStorage
  _saveRevisionToLocal(rev: any, canvasId: string) {
    if (typeof localStorage === 'undefined' || !rev) return;
    try {
      const safeNodes = (rev.nodes_snapshot || []).map((n: any) => ({
        id: String(n.id || ''),
        type: String(n.type || 'default'),
        position: n.position || { x: 0, y: 0 },
        width: n.width,
        height: n.height,
        data: cleanNodeDataForManifest(n.data)
      }));

      const safeRev = {
        ...rev,
        nodes_snapshot: safeNodes
      };

      const keys = [
        'manwah_canvas_revisions_all',
        `manwah_canvas_revisions_${canvasId}`,
        'manwah_canvas_revisions_latest'
      ];
      for (const k of keys) {
        let existing: any[] = [];
        try {
          const raw = localStorage.getItem(k);
          if (raw) existing = JSON.parse(raw);
        } catch (e) {}
        if (!Array.isArray(existing)) existing = [];
        
        const filtered = existing.filter(item => item && item.id !== safeRev.id && item.revision_number !== safeRev.revision_number);
        filtered.unshift(safeRev);
        localStorage.setItem(k, JSON.stringify(filtered.slice(0, 50)));
      }
    } catch (e) {
      console.warn('Failed to save revision to localStorage:', e);
    }
  },

  // Helper to load revisions from localStorage
  _getRevisionsFromLocal(canvasId: string): CanvasRevisionRecord[] {
    if (typeof localStorage === 'undefined') return [];
    const revMap = new Map<string, any>();
    const keys = [
      `manwah_canvas_revisions_${canvasId}`,
      'manwah_canvas_revisions_latest',
      'manwah_canvas_revisions_all',
      'manwah_sb_mock_canvas_revisions'
    ];

    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && (item.id || item.revision_number || item.revisionNumber)) {
                const key = item.id || `rev_${item.revision_number || item.revisionNumber}`;
                if (!revMap.has(key)) {
                  revMap.set(key, item);
                }
              }
            }
          }
        }
      } catch (e) {}
    }

    const list = Array.from(revMap.values());
    list.sort((a, b) => (b.revision_number || b.revisionNumber || 0) - (a.revision_number || a.revisionNumber || 0));
    return list.map(rev => ({
      id: rev.id || `rev_${Date.now()}`,
      canvas_id: rev.canvas_id || canvasId,
      revision_number: rev.revision_number || rev.revisionNumber || 1,
      version_name: rev.version_name || rev.versionName || '存档版本',
      change_summary: rev.change_summary || rev.changeSummary || '',
      version_tag: rev.version_tag || rev.versionTag || '正式版',
      nodes_snapshot: rev.nodes_snapshot || rev.nodesSnapshot || [],
      edges_snapshot: rev.edges_snapshot || rev.edgesSnapshot || [],
      viewport_snapshot: rev.viewport_snapshot || rev.viewportSnapshot || { x: 0, y: 0, zoom: 1 },
      created_at: rev.created_at || rev.createdAt || new Date().toISOString()
    }));
  },

  // Create immutable revision (C4A-4: Decoupled snapshot creation)
  async createCanvasRevision(
    canvasId: string,
    payload: {
      versionName: string;
      changeSummary?: string;
      versionTag?: string;
      manifest?: RevisionManifest;
      nodesSnapshot?: SerializableNode[];
      edgesSnapshot?: SerializableEdge[];
      viewportSnapshot?: ViewportState;
      assetVersionIds?: string[];
    }
  ): Promise<CanvasRevisionRecord & { storageMedium?: 'cloud' | 'local' | 'memory'; status?: string; assetTotal?: number; assetReadyCount?: number; pendingAssetCount?: number }> {
    const manifest = payload.manifest || buildRevisionManifest({
      workspaceId: canvasId,
      nodes: payload.nodesSnapshot || [],
      edges: payload.edgesSnapshot || [],
      viewport: payload.viewportSnapshot
    });

    const sanitizedNodes = manifest.nodes;
    const sanitizedEdges = manifest.edges;
    const sanitizedViewport = manifest.viewport;

    logCanvasDiagnostic({
      canvasId,
      source: 'create_revision_request',
      nodesCount: sanitizedNodes.length,
      edgesCount: sanitizedEdges.length,
      versionName: payload.versionName
    });

    let resultRev: any = null;
    let storageMedium: 'cloud' | 'local' | 'memory' = 'local';
    let status = 'ready';
    let assetTotal = 0;
    let assetReadyCount = 0;
    let pendingAssetCount = 0;

    const requestBody = {
      versionName: payload.versionName,
      changeSummary: payload.changeSummary || '',
      versionTag: payload.versionTag || '正式版',
      manifest,
      nodesSnapshot: sanitizedNodes,
      edgesSnapshot: sanitizedEdges,
      viewportSnapshot: sanitizedViewport,
      assetVersionIds: payload.assetVersionIds
    };

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/canvases/${canvasId}/revisions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      const json = await res.json();

      logCanvasDiagnostic({
        canvasId,
        source: 'create_revision_response',
        statusCode: res.status,
        success: Boolean(json.success),
        revisionId: json.revision?.id
      });

      if (res.ok && json.success && json.revision) {
        resultRev = json.revision;
        storageMedium = json.storageMedium || 'cloud';
        status = json.status || json.revision.status || 'ready';
        assetTotal = json.assetTotal || 0;
        assetReadyCount = json.assetReadyCount || 0;
        pendingAssetCount = json.pendingAssetCount || 0;
      }
    } catch (err) {
      console.warn('Network or server error during revision create, falling back to local storage:', err);
    }

    if (!resultRev) {
      const existingLocals = this._getRevisionsFromLocal(canvasId);
      const nextRevNum = existingLocals.length > 0 ? (existingLocals[0].revision_number + 1) : 1;
      resultRev = {
        id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        canvas_id: canvasId,
        revision_number: nextRevNum,
        version_name: payload.versionName,
        change_summary: payload.changeSummary || '',
        version_tag: payload.versionTag || '正式版',
        status: 'ready',
        manifest,
        nodes_snapshot: sanitizedNodes,
        edges_snapshot: sanitizedEdges,
        viewport_snapshot: sanitizedViewport,
        created_at: new Date().toISOString()
      };
      storageMedium = 'local';
    }

    this._saveRevisionToLocal(resultRev, canvasId);

    return {
      ...resultRev,
      storageMedium,
      status,
      assetTotal,
      assetReadyCount,
      pendingAssetCount
    };
  },

  // Get revision history list
  async getCanvasRevisions(canvasId: string): Promise<CanvasRevisionRecord[]> {
    let serverRevisions: CanvasRevisionRecord[] = [];
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/canvases/${canvasId}/revisions`, {
        method: 'GET',
        headers
      });
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.revisions)) {
        serverRevisions = json.revisions;
        for (const rev of serverRevisions) {
          this._saveRevisionToLocal(rev, canvasId);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch revisions from server, reading local cache:', e);
    }

    const localRevisions = this._getRevisionsFromLocal(canvasId);

    const combinedMap = new Map<string, CanvasRevisionRecord>();
    for (const r of [...serverRevisions, ...localRevisions]) {
      const key = r.id || `rev_${r.revision_number}`;
      if (!combinedMap.has(key)) {
        combinedMap.set(key, r);
      }
    }

    const merged = Array.from(combinedMap.values());
    merged.sort((a, b) => b.revision_number - a.revision_number);
    return merged;
  },

  // Restore working draft from an immutable revision
  async restoreCanvasFromRevision(
    canvasId: string,
    revisionId: string
  ): Promise<{
    nodes: SerializableNode[];
    edges: SerializableEdge[];
    viewport: ViewportState;
    storageMedium: 'cloud' | 'local' | 'memory';
    sourceRevisionId: string;
    snapshotChecksum?: string;
  }> {
    logCanvasDiagnostic({
      canvasId,
      revisionId,
      source: 'restore_revision_request'
    });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/canvases/${canvasId}/restore/${revisionId}`, {
        method: 'POST',
        headers
      });
      const json = await res.json();

      logCanvasDiagnostic({
        canvasId,
        revisionId,
        source: 'restore_revision_response',
        statusCode: res.status,
        success: Boolean(json.success),
        nodesCount: (json.nodes || []).length,
        edgesCount: (json.edges || []).length,
        snapshotChecksum: json.snapshotChecksum
      });

      if (res.ok && json.success) {
        return {
          nodes: json.nodes,
          edges: json.edges,
          viewport: json.viewport,
          storageMedium: json.storageMedium || 'cloud',
          sourceRevisionId: json.sourceRevisionId || revisionId,
          snapshotChecksum: json.snapshotChecksum
        };
      }
    } catch (e) {
      console.warn('Server restore failed, falling back to local revision snapshot:', e);
    }

    const locals = this._getRevisionsFromLocal(canvasId);
    const targetRev = locals.find(r => r.id === revisionId || String(r.revision_number) === String(revisionId));
    if (!targetRev) {
      throw new Error('未找到该版本的快照记录，无法恢复');
    }

    const restoredNodes = targetRev.nodes_snapshot || [];
    const restoredEdges = targetRev.edges_snapshot || [];
    const restoredViewport = targetRev.viewport_snapshot || { x: 0, y: 0, zoom: 1 };

    if (typeof localStorage !== 'undefined') {
      try {
        const localSnapshot = {
          nodes: restoredNodes,
          edges: restoredEdges,
          viewport: restoredViewport,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('manwah_canvas_latest', JSON.stringify(localSnapshot));
        localStorage.setItem(`manwah_canvas_draft_${canvasId}`, JSON.stringify(localSnapshot));
      } catch (e) {}
    }

    return {
      nodes: restoredNodes,
      edges: restoredEdges,
      viewport: restoredViewport,
      storageMedium: 'local',
      sourceRevisionId: targetRev.id
    };
  },

  // Verify Supabase persistence health across required tables
  async getPersistenceHealth(): Promise<PersistenceHealthResult> {
    const url = '/api/health/persistence';
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(url, {
        method: 'GET',
        headers
      });
      const json = await res.json();
      return {
        ready: Boolean(json.ready),
        schemaVersion: json.schemaVersion || 'BASELINE-M1-R1',
        storageMedium: json.storageMedium || 'unknown',
        checks: {
          creativeProjects: json.checks?.creativeProjects || 'unknown',
          creativeCanvases: json.checks?.creativeCanvases || 'unknown',
          agentConversations: json.checks?.agentConversations || 'unknown',
          agentMessages: json.checks?.agentMessages || 'unknown'
        }
      };
    } catch (err: any) {
      return {
        ready: false,
        schemaVersion: 'BASELINE-M1-R1',
        storageMedium: 'unreachable',
        checks: {
          creativeProjects: 'error',
          creativeCanvases: 'error',
          agentConversations: 'error',
          agentMessages: 'error'
        }
      };
    }
  }
};
