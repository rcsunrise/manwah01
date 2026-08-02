import { Router, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply auth middleware
router.use(authenticateToken as any);

// In-memory Repositories
const inMemoryCanvases = new Map<string, any>();
const inMemoryRevisions = new Map<string, any[]>();
const canvasAssetStore = new Map<string, { objectKey: string; mimeType: string; dataUrl: string; createdAt: string }>();

function serverLogDiagnostic(data: any) {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (
      (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('auth')) &&
      !['canvasId', 'projectId', 'revisionId', 'objectKey'].includes(k)
    ) {
      continue;
    }
    if (typeof v === 'string' && v.startsWith('data:image/')) {
      cleaned[k] = `[base64_image_len_${v.length}]`;
      continue;
    }
    cleaned[k] = v;
  }
  console.log('[CreativeCanvas:ServerDiagnostic]', JSON.stringify(cleaned));
}

function calculateCanvasChecksum(nodes: any[], edges: any[], viewport: any): string {
  const nodeIds = (Array.isArray(nodes) ? nodes : []).map(n => String(n?.id || '')).sort().join(',');
  const edgeIds = (Array.isArray(edges) ? edges : []).map(e => String(e?.id || '')).sort().join(',');
  const vpStr = `${viewport?.x || 0}_${viewport?.y || 0}_${viewport?.zoom || 1}`;
  const str = `nodes:${nodeIds};edges:${edgeIds};vp:${vpStr}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `chk_${Math.abs(hash).toString(36)}_${(nodes || []).length}_${(edges || []).length}`;
}

function parseJsonIfNeeded<T>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch (e) {
      return fallback;
    }
  }
  return val as T;
}

// Helper: Clean node.data to strip non-serializable properties, functions, and persist images to Asset Store
function cleanNodeData(data: any): any {
  if (!data || typeof data !== 'object') return {};

  const cleaned: Record<string, any> = {};

  for (const key of Object.keys(data)) {
    // 1. Strip callback functions
    if (key.startsWith('on') && typeof data[key] === 'function') {
      continue;
    }

    const val = data[key];

    // 2. Strip functions or DOM/Fiber/React symbols
    if (typeof val === 'function' || (val && typeof val === 'object' && val.$$typeof)) {
      continue;
    }

    // 3. Handle Base64 / blob image strings
    if ((key === 'imageUrl' || key === 'base64' || key === 'cleanImageBase64') && typeof val === 'string') {
      if (val.startsWith('data:image/')) {
        let objectKey = data.objectKey;
        if (!objectKey || !canvasAssetStore.has(objectKey)) {
          objectKey = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          canvasAssetStore.set(objectKey, {
            objectKey,
            mimeType: 'image/png',
            dataUrl: val,
            createdAt: new Date().toISOString()
          });
        }
        cleaned.objectKey = objectKey;
        cleaned.storageProvider = 'canvas_storage';
        cleaned.bucket = 'canvas_images';
        cleaned.assetStatus = 'persisted';
        cleaned.storageUrl = `/api/canvases/assets/${objectKey}`;
        cleaned[key] = `/api/canvases/assets/${objectKey}`;
        continue;
      } else if (val.startsWith('blob:')) {
        cleaned.assetStatus = 'not_persisted';
        cleaned[key] = data.storageUrl || '';
        continue;
      }
    }

    cleaned[key] = val;
  }

  // Preserve object key, storage provider, assetStatus if present
  if (data.objectKey) cleaned.objectKey = data.objectKey;
  if (data.storageProvider) cleaned.storageProvider = data.storageProvider;
  if (data.bucket) cleaned.bucket = data.bucket;
  if (data.assetStatus) cleaned.assetStatus = data.assetStatus;

  return cleaned;
}

function cleanNodes(nodes: any[]): any[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map(node => ({
    id: String(node.id || ''),
    type: String(node.type || 'default'),
    position: node.position && typeof node.position === 'object' ? { x: Number(node.position.x || 0), y: Number(node.position.y || 0) } : { x: 0, y: 0 },
    width: node.width ? Number(node.width) : undefined,
    height: node.height ? Number(node.height) : undefined,
    data: cleanNodeData(node.data)
  }));
}

function cleanEdges(edges: any[]): any[] {
  if (!Array.isArray(edges)) return [];
  return edges.map(edge => ({
    id: String(edge.id || ''),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle: edge.sourceHandle ? String(edge.sourceHandle) : null,
    targetHandle: edge.targetHandle ? String(edge.targetHandle) : null,
    type: edge.type ? String(edge.type) : undefined,
    animated: Boolean(edge.animated),
    style: edge.style && typeof edge.style === 'object' ? edge.style : undefined
  }));
}

function cleanViewport(vp: any): { x: number; y: number; zoom: number } {
  if (!vp || typeof vp !== 'object') return { x: 0, y: 0, zoom: 1 };
  return {
    x: typeof vp.x === 'number' ? vp.x : 0,
    y: typeof vp.y === 'number' ? vp.y : 0,
    zoom: typeof vp.zoom === 'number' ? vp.zoom : 1
  };
}

// 0. Asset retrieval endpoint
router.get('/assets/:objectKey', (req: AuthenticatedRequest, res: Response) => {
  const { objectKey } = req.params;
  const asset = canvasAssetStore.get(objectKey);
  if (!asset) {
    return res.status(404).json({ success: false, error: '图片资源不存在或已过期' });
  }

  if (asset.dataUrl.startsWith('data:')) {
    const matches = asset.dataUrl.match(/^data:([a-zA-Z0-9-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const contentType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.send(buffer);
    }
  }
  return res.redirect(asset.dataUrl);
});

// 1. Create or Get Canvas by Project ID
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { projectId, canvasName = '主视觉九屏画布', nodesDraft = [], edgesDraft = [], viewportDraft = { x: 0, y: 0, zoom: 1 } } = req.body;

    if (!projectId) {
      throw new AppError('projectId 不能为空', 400, 'BAD_REQUEST');
    }

    const canvasId = `canvas_${projectId}`;
    const now = new Date().toISOString();

    const canvasRecord = {
      id: canvasId,
      project_id: projectId,
      canvas_name: canvasName,
      canvas_status: 'active',
      nodes_draft: cleanNodes(nodesDraft),
      edges_draft: cleanEdges(edgesDraft),
      viewport_draft: cleanViewport(viewportDraft),
      current_revision: 0,
      created_at: now,
      updated_at: now,
      last_saved_at: now,
      created_by: user.id
    };

    let storageMedium: 'cloud' | 'memory' = 'memory';

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_canvases')
        .upsert(canvasRecord, { onConflict: 'id' })
        .select()
        .single();

      if (!error && data) {
        return res.json({ success: true, storageMedium: 'cloud', canvas: data });
      }
    } catch (e) {
      // Fallback
    }

    inMemoryCanvases.set(canvasId, canvasRecord);
    return res.json({ success: true, storageMedium: 'memory', canvas: canvasRecord });
  } catch (err) {
    next(err);
  }
});

// 2. Get Canvas by ID or Project ID
router.get('/:canvasId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const rawId = String(req.params.canvasId);
    const canvasId = rawId.startsWith('canvas_') ? rawId : `canvas_${rawId}`;
    const projectId = rawId.startsWith('canvas_') ? rawId.replace('canvas_', '') : rawId;

    let canvas: any = null;
    let storageMedium: 'cloud' | 'memory' = 'memory';

    try {
      const { data } = await supabaseAdmin
        .from('creative_canvases')
        .select('*')
        .or(`id.eq.${canvasId},project_id.eq.${projectId}`)
        .single();

      if (data) {
        canvas = data;
        storageMedium = 'cloud';
      }
    } catch (e) {
      // Fallback
    }

    if (!canvas) {
      canvas = inMemoryCanvases.get(canvasId) || inMemoryCanvases.get(`canvas_${projectId}`);
    }

    if (!canvas) {
      const now = new Date().toISOString();
      canvas = {
        id: canvasId,
        project_id: projectId,
        canvas_name: '主视觉九屏画布',
        canvas_status: 'active',
        nodes_draft: [],
        edges_draft: [],
        viewport_draft: { x: 0, y: 0, zoom: 1 },
        current_revision: 0,
        created_at: now,
        updated_at: now,
        last_saved_at: now,
        created_by: user.id
      };
      inMemoryCanvases.set(canvasId, canvas);
    }

    const nodesDraft = parseJsonIfNeeded(canvas.nodes_draft || canvas.nodesDraft, []);
    const edgesDraft = parseJsonIfNeeded(canvas.edges_draft || canvas.edgesDraft, []);
    const viewportDraft = parseJsonIfNeeded(canvas.viewport_draft || canvas.viewportDraft, { x: 0, y: 0, zoom: 1 });

    if (!Array.isArray(nodesDraft) || !Array.isArray(edgesDraft)) {
      throw new AppError('草稿节点或连线格式异常', 500, 'DRAFT_VALIDATION_FAILED');
    }

    const snapshotChecksum = calculateCanvasChecksum(nodesDraft, edgesDraft, viewportDraft);
    const generatedImageNodeCount = nodesDraft.filter((n: any) => n.type === 'generatedImageNode' || n.id?.startsWith('gen-img-node-')).length;

    serverLogDiagnostic({
      projectId,
      canvasId,
      storageMode: storageMedium,
      nodesCount: nodesDraft.length,
      edgesCount: edgesDraft.length,
      generatedImageNodeCount,
      viewport: viewportDraft,
      updatedAt: canvas.updated_at || canvas.updatedAt,
      source: 'get_canvas_success'
    });

    const formattedCanvas = {
      ...canvas,
      nodesDraft,
      edgesDraft,
      viewportDraft,
      nodes_draft: nodesDraft,
      edges_draft: edgesDraft,
      viewport_draft: viewportDraft,
      snapshotChecksum,
      nodesCount: nodesDraft.length,
      edgesCount: edgesDraft.length,
      generatedImageNodeCount
    };

    return res.json({ success: true, storageMedium, canvas: formattedCanvas });
  } catch (err) {
    next(err);
  }
});

// 3. Auto-save Draft (PATCH /api/canvases/:canvasId/draft)
router.patch('/:canvasId/draft', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const rawId = String(req.params.canvasId);
    const canvasId = rawId.startsWith('canvas_') ? rawId : `canvas_${rawId}`;
    const projectId = rawId.startsWith('canvas_') ? rawId.replace('canvas_', '') : rawId;

    const { nodesDraft, edgesDraft, viewportDraft, canvasName, hasExplicitUserClear } = req.body;

    // Check existing draft for suspicious overwrite protection
    let existing: any = null;
    try {
      const { data } = await supabaseAdmin
        .from('creative_canvases')
        .select('*')
        .eq('id', canvasId)
        .single();
      if (data) existing = data;
    } catch (e) {}

    if (!existing) {
      existing = inMemoryCanvases.get(canvasId) || inMemoryCanvases.get(`canvas_${projectId}`);
    }

    const cleanedIncomingNodes = cleanNodes(nodesDraft || []);
    const cleanedIncomingEdges = cleanEdges(edgesDraft || []);
    const cleanedIncomingViewport = cleanViewport(viewportDraft || { x: 0, y: 0, zoom: 1 });

    if (existing) {
      const existingNodes = parseJsonIfNeeded(existing.nodes_draft || existing.nodesDraft, []);
      if (existingNodes.length > 1 && cleanedIncomingNodes.length <= 1 && !hasExplicitUserClear) {
        serverLogDiagnostic({
          projectId,
          canvasId,
          source: 'patch_draft_rejected_suspicious_overwrite',
          existingNodesCount: existingNodes.length,
          incomingNodesCount: cleanedIncomingNodes.length
        });
        return res.status(409).json({
          success: false,
          code: 'CANVAS_STALE_OR_SUSPICIOUS_OVERWRITE',
          message: '检测到版本冲突，可疑的单节点覆盖操作已阻止，原画布已被保留。'
        });
      }
    }

    const now = new Date().toISOString();
    const updatePayload: any = {
      updated_at: now,
      last_saved_at: now
    };

    if (nodesDraft) updatePayload.nodes_draft = cleanedIncomingNodes;
    if (edgesDraft) updatePayload.edges_draft = cleanedIncomingEdges;
    if (viewportDraft) updatePayload.viewport_draft = cleanedIncomingViewport;
    if (canvasName) updatePayload.canvas_name = canvasName;

    let savedCanvas: any = null;
    let storageMedium: 'cloud' | 'memory' = 'memory';

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_canvases')
        .update(updatePayload)
        .eq('id', canvasId)
        .select()
        .single();

      if (!error && data) {
        savedCanvas = data;
        storageMedium = 'cloud';
      }
    } catch (e) {
      // Fallback
    }

    if (!savedCanvas) {
      if (!existing) {
        existing = {
          id: canvasId,
          project_id: projectId,
          canvas_name: canvasName || '主视觉九屏画布',
          canvas_status: 'active',
          current_revision: 0,
          created_at: now,
          created_by: user.id
        };
      }
      savedCanvas = {
        ...existing,
        ...updatePayload
      };
      inMemoryCanvases.set(canvasId, savedCanvas);
      storageMedium = 'memory';
    }

    serverLogDiagnostic({
      projectId,
      canvasId,
      storageMode: storageMedium,
      nodesCount: cleanedIncomingNodes.length,
      edgesCount: cleanedIncomingEdges.length,
      source: 'patch_draft_success'
    });

    return res.json({
      success: true,
      storageMedium,
      lastSavedAt: now,
      canvas: savedCanvas
    });
  } catch (err) {
    next(err);
  }
});

// 4. Create Immutable Revision Archive (POST /api/canvases/:canvasId/revisions)
router.post('/:canvasId/revisions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const rawId = String(req.params.canvasId);
    const canvasId = rawId.startsWith('canvas_') ? rawId : `canvas_${rawId}`;

    const { versionName, changeSummary = '', versionTag = '正式版', nodesSnapshot, edgesSnapshot, viewportSnapshot } = req.body;

    if (!versionName || typeof versionName !== 'string' || !versionName.trim()) {
      throw new AppError('版本名称不能为空', 400, 'BAD_REQUEST');
    }

    const cleanedNodes = cleanNodes(nodesSnapshot || []);
    const cleanedEdges = cleanEdges(edgesSnapshot || []);
    const cleanedViewport = cleanViewport(viewportSnapshot || { x: 0, y: 0, zoom: 1 });

    // Check if any node has unpersisted images
    const hasUnpersisted = cleanedNodes.some(n => n.data?.assetStatus === 'not_persisted');
    if (hasUnpersisted) {
      throw new AppError('部分图片尚未持久化，请稍后重试', 400, 'UNPERSISTED_ASSETS');
    }

    let dbMaxRev = 0;
    try {
      const { data } = await supabaseAdmin
        .from('canvas_revisions')
        .select('revision_number')
        .eq('canvas_id', canvasId)
        .order('revision_number', { ascending: false })
        .limit(1);
      if (data && data.length > 0 && typeof data[0].revision_number === 'number') {
        dbMaxRev = data[0].revision_number;
      }
    } catch (e) {
      // Fallback
    }

    const memRevs = inMemoryRevisions.get(canvasId) || [];
    const memMaxRev = memRevs.length > 0 ? Math.max(...memRevs.map(r => r.revision_number || r.revisionNumber || 0)) : 0;

    const nextRevNum = Math.max(dbMaxRev, memMaxRev) + 1;
    const now = new Date().toISOString();
    const revisionId = `rev_${canvasId}_v${nextRevNum}_${Date.now()}`;

    const snapshotChecksum = calculateCanvasChecksum(cleanedNodes, cleanedEdges, cleanedViewport);

    const revisionRecord = {
      id: revisionId,
      canvas_id: canvasId,
      revision_number: nextRevNum,
      version_name: versionName.trim(),
      change_summary: changeSummary.trim(),
      version_tag: versionTag,
      nodes_snapshot: cleanedNodes,
      edges_snapshot: cleanedEdges,
      viewport_snapshot: cleanedViewport,
      created_at: now,
      created_by: user.id
    };

    let storageMedium: 'cloud' | 'memory' = 'memory';

    try {
      const { error } = await supabaseAdmin.from('canvas_revisions').insert(revisionRecord);
      if (!error) {
        storageMedium = 'cloud';
        await supabaseAdmin
          .from('creative_canvases')
          .update({ current_revision: nextRevNum, updated_at: now, last_saved_at: now })
          .eq('id', canvasId);
      }
    } catch (e) {
      // Fallback
    }

    const currentMemRevs = inMemoryRevisions.get(canvasId) || [];
    currentMemRevs.unshift(revisionRecord);
    currentMemRevs.sort((a, b) => (b.revision_number || 0) - (a.revision_number || 0));
    inMemoryRevisions.set(canvasId, currentMemRevs);

    const memCanvas = inMemoryCanvases.get(canvasId);
    if (memCanvas) {
      memCanvas.current_revision = nextRevNum;
      memCanvas.updated_at = now;
      memCanvas.last_saved_at = now;
    }

    serverLogDiagnostic({
      canvasId,
      revisionId,
      storageMode: storageMedium,
      nodesCount: cleanedNodes.length,
      edgesCount: cleanedEdges.length,
      snapshotChecksum,
      source: 'create_revision_success'
    });

    return res.json({
      success: true,
      storageMedium,
      revision: {
        ...revisionRecord,
        snapshotChecksum
      }
    });
  } catch (err) {
    next(err);
  }
});

// 5. Get Revisions List for Canvas
router.get('/:canvasId/revisions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rawId = String(req.params.canvasId);
    const canvasId = rawId.startsWith('canvas_') ? rawId : `canvas_${rawId}`;

    let revisions: any[] = [];
    let storageMedium: 'cloud' | 'memory' = 'memory';

    try {
      const { data, error } = await supabaseAdmin
        .from('canvas_revisions')
        .select('*')
        .eq('canvas_id', canvasId)
        .order('revision_number', { ascending: false });

      if (!error && data) {
        revisions = data;
        storageMedium = 'cloud';
      }
    } catch (e) {
      // Fallback
    }

    if (revisions.length === 0) {
      revisions = inMemoryRevisions.get(canvasId) || [];
    }

    const cleanRevisions = revisions.map(rev => ({
      ...rev,
      nodes_snapshot: parseJsonIfNeeded(rev.nodes_snapshot || rev.nodesSnapshot, []),
      edges_snapshot: parseJsonIfNeeded(rev.edges_snapshot || rev.edgesSnapshot, []),
      viewport_snapshot: parseJsonIfNeeded(rev.viewport_snapshot || rev.viewportSnapshot, { x: 0, y: 0, zoom: 1 })
    }));

    return res.json({
      success: true,
      storageMedium,
      revisions: cleanRevisions
    });
  } catch (err) {
    next(err);
  }
});

// 6. Restore Canvas from Immutable Revision as a new Working Draft
router.post('/:canvasId/restore/:revisionId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const rawId = String(req.params.canvasId);
    const canvasId = rawId.startsWith('canvas_') ? rawId : `canvas_${rawId}`;
    const projectId = rawId.startsWith('canvas_') ? rawId.replace('canvas_', '') : rawId;
    const revisionId = String(req.params.revisionId);

    let targetRevision: any = null;

    try {
      const { data } = await supabaseAdmin
        .from('canvas_revisions')
        .select('*')
        .eq('id', revisionId)
        .single();
      targetRevision = data;
    } catch (e) {
      // Fallback
    }

    if (!targetRevision) {
      const revList = inMemoryRevisions.get(canvasId) || [];
      targetRevision = revList.find((r: any) => r.id === revisionId);
    }

    if (!targetRevision) {
      throw new AppError('指定的历史版本不存在', 404, 'NOT_FOUND');
    }

    const restoredNodes = parseJsonIfNeeded(targetRevision.nodes_snapshot || targetRevision.nodesSnapshot, []);
    const restoredEdges = parseJsonIfNeeded(targetRevision.edges_snapshot || targetRevision.edgesSnapshot, []);
    const restoredViewport = parseJsonIfNeeded(targetRevision.viewport_snapshot || targetRevision.viewportSnapshot, { x: 0, y: 0, zoom: 1 });

    if (!Array.isArray(restoredNodes) || !Array.isArray(restoredEdges)) {
      throw new AppError('历史快照节点或连线格式损坏', 500, 'RESTORE_CORRUPTED_SNAPSHOT');
    }

    const now = new Date().toISOString();
    const snapshotChecksum = calculateCanvasChecksum(restoredNodes, restoredEdges, restoredViewport);
    const generatedImageNodeCount = restoredNodes.filter((n: any) => n.type === 'generatedImageNode' || n.id?.startsWith('gen-img-node-')).length;

    const updatePayload = {
      nodes_draft: restoredNodes,
      edges_draft: restoredEdges,
      viewport_draft: restoredViewport,
      source_revision_id: revisionId,
      updated_at: now,
      last_saved_at: now
    };

    let storageMedium: 'cloud' | 'memory' = 'memory';

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_canvases')
        .update(updatePayload)
        .eq('id', canvasId)
        .select()
        .single();
      if (!error && data) {
        storageMedium = 'cloud';
      }
    } catch (e) {
      // Fallback
    }

    const memCanvas = inMemoryCanvases.get(canvasId);
    if (memCanvas) {
      memCanvas.nodes_draft = restoredNodes;
      memCanvas.edges_draft = restoredEdges;
      memCanvas.viewport_draft = restoredViewport;
      memCanvas.source_revision_id = revisionId;
      memCanvas.updated_at = now;
      memCanvas.last_saved_at = now;
    }

    serverLogDiagnostic({
      projectId,
      canvasId,
      revisionId,
      storageMode: storageMedium,
      nodesCount: restoredNodes.length,
      edgesCount: restoredEdges.length,
      generatedImageNodeCount,
      snapshotChecksum,
      source: 'restore_revision_success'
    });

    return res.json({
      success: true,
      storageMedium,
      sourceRevisionId: revisionId,
      nodes: restoredNodes,
      edges: restoredEdges,
      viewport: restoredViewport,
      nodesDraft: restoredNodes,
      edgesDraft: restoredEdges,
      viewportDraft: restoredViewport,
      snapshotChecksum,
      nodesCount: restoredNodes.length,
      edgesCount: restoredEdges.length,
      generatedImageNodeCount
    });
  } catch (err) {
    next(err);
  }
});

export default router;
