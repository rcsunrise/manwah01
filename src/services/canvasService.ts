import {
  CanvasRecord,
  CanvasRevisionRecord,
  SerializableNode,
  SerializableEdge,
  ViewportState
} from '../types/creativeCanvas';
import { logCanvasDiagnostic } from '../utils/canvasDiagnostic';

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const token = localStorage.getItem('token') || localStorage.getItem('supabase.auth.token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
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

    const res = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders()
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
    return json.canvas;
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

    const res = await fetch(url, {
      method: 'PATCH',
      headers: getAuthHeaders(),
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

  // Create immutable revision
  async createCanvasRevision(
    canvasId: string,
    payload: {
      versionName: string;
      changeSummary?: string;
      versionTag?: string;
      nodesSnapshot: SerializableNode[];
      edgesSnapshot: SerializableEdge[];
      viewportSnapshot: ViewportState;
    }
  ): Promise<CanvasRevisionRecord & { storageMedium?: 'cloud' | 'local' | 'memory' }> {
    logCanvasDiagnostic({
      canvasId,
      source: 'create_revision_request',
      nodesCount: payload.nodesSnapshot.length,
      edgesCount: payload.edgesSnapshot.length,
      versionName: payload.versionName
    });

    const res = await fetch(`/api/canvases/${canvasId}/revisions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    logCanvasDiagnostic({
      canvasId,
      source: 'create_revision_response',
      statusCode: res.status,
      success: Boolean(json.success),
      revisionId: json.revision?.id
    });

    if (!res.ok || !json.success) {
      const err: any = new Error(json.error || json.message || '创建正式版本存档失败');
      err.code = json.code;
      err.httpStatus = res.status;
      throw err;
    }
    return {
      ...json.revision,
      storageMedium: json.storageMedium || 'cloud'
    };
  },

  // Get revision history list
  async getCanvasRevisions(canvasId: string): Promise<CanvasRevisionRecord[]> {
    const res = await fetch(`/api/canvases/${canvasId}/revisions`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || json.message || '获取版本历史失败');
    }
    return json.revisions || [];
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

    const res = await fetch(`/api/canvases/${canvasId}/restore/${revisionId}`, {
      method: 'POST',
      headers: getAuthHeaders()
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

    if (!res.ok || !json.success) {
      const err: any = new Error(json.error || json.message || '恢复历史版本失败');
      err.code = json.code;
      err.httpStatus = res.status;
      throw err;
    }
    return {
      nodes: json.nodes,
      edges: json.edges,
      viewport: json.viewport,
      storageMedium: json.storageMedium || 'cloud',
      sourceRevisionId: json.sourceRevisionId || revisionId,
      snapshotChecksum: json.snapshotChecksum
    };
  }
};
