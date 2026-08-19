/**
 * Manifest Purification Service
 * Handles building pure Revision Manifests stripped of Base64, Blob, Signed URLs and ephemeral states.
 */

import { ViewportState, SerializableEdge, SerializableNode } from '../types/creativeCanvas';

export interface RevisionManifestNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: {
    assetVersionId?: string;
    assetSkuId?: string;
    assetSkuCode?: string;
    assetVersionCode?: string;
    objectKey?: string;
    checksum?: string;
    sourceWidth?: number;
    sourceHeight?: number;
    sourceAspectRatio?: string;
    fitMode?: string;
    focalPoint?: { x: number; y: number };
    safeArea?: { top: number; right: number; bottom: number; left: number };
    copyVersionId?: string;
    dnaVersionId?: string;
    productDnaVersionId?: string;
    productDnaVersionCode?: string;
    generationParameters?: Record<string, any>;
    prompt?: string;
    screenIndex?: number;
    screenTitle?: string;
    reviewStatus?: string;
    model?: string;
    provider?: string;
    version?: number;
    dimensions?: string;
    [key: string]: any;
  };
}

export interface RevisionManifest {
  schemaVersion: string;
  workspaceId: string;
  nodes: RevisionManifestNode[];
  edges: SerializableEdge[];
  viewport: ViewportState;
  layoutManifest?: Record<string, any>;
  createdAt: string;
}

export interface CanvasStateForManifest {
  workspaceId: string;
  nodes: any[];
  edges: any[];
  viewport?: ViewportState;
  layoutManifest?: Record<string, any>;
}

// Strip forbidden ephemeral data from node.data
export function cleanNodeDataForManifest(data: Record<string, any> | undefined): Record<string, any> {
  if (!data || typeof data !== 'object') return {};

  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    // 1. Strip callback functions
    if (key.startsWith('on') || typeof value === 'function') {
      continue;
    }

    // 2. Strip React elements / Fiber / DOM nodes / AbortController / Progress objects
    if (
      value &&
      typeof value === 'object' &&
      ((value as any).$$typeof ||
        (value as any).nodeType ||
        value instanceof AbortController ||
        (value as any)._fiber)
    ) {
      continue;
    }

    // 3. Strip Base64 data URLs
    if (typeof value === 'string') {
      if (value.startsWith('data:image/')) {
        continue;
      }
      // 4. Strip blob URLs
      if (value.startsWith('blob:')) {
        continue;
      }
      // 5. Strip short-lived signed URLs (contain ?token= or signature tokens)
      if (
        value.includes('/storage/v1/object/sign/') ||
        value.includes('X-Amz-Signature=') ||
        (value.includes('token=') && value.includes('supabase.co'))
      ) {
        continue;
      }
      // 6. Strip raw Base64 image payload strings (>500 chars looking like base64)
      if (value.length > 500 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        continue;
      }
    }

    // 7. Strip error stack traces or transient SSE chunks
    if (key === 'errorStack' || key === 'rawSseStream' || key === 'uploadProgressObj') {
      continue;
    }

    cleaned[key] = value;
  }

  // Ensure imageUrl does NOT contain Base64 or Blob in manifest.
  // If imageUrl was a Base64 or Blob, but we have objectKey or assetVersionId, retain objectKey instead.
  if (typeof cleaned.imageUrl === 'string') {
    if (cleaned.imageUrl.startsWith('data:image/') || cleaned.imageUrl.startsWith('blob:')) {
      delete cleaned.imageUrl;
    }
  }

  return cleaned;
}

export function buildRevisionManifest(canvasState: CanvasStateForManifest): RevisionManifest {
  const schemaVersion = '2026.08.c4a4';
  const createdAt = new Date().toISOString();
  const workspaceId = canvasState.workspaceId || 'workspace_default';

  const nodes: RevisionManifestNode[] = (canvasState.nodes || []).map((node: any) => ({
    id: String(node.id || ''),
    type: String(node.type || 'default'),
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0)
    },
    width: node.width ? Number(node.width) : undefined,
    height: node.height ? Number(node.height) : undefined,
    data: cleanNodeDataForManifest(node.data)
  }));

  const edges: SerializableEdge[] = (canvasState.edges || []).map((edge: any) => ({
    id: String(edge.id || ''),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle: edge.sourceHandle ? String(edge.sourceHandle) : null,
    targetHandle: edge.targetHandle ? String(edge.targetHandle) : null,
    type: edge.type ? String(edge.type) : undefined,
    animated: Boolean(edge.animated),
    style: edge.style
  }));

  const viewport: ViewportState = {
    x: Number(canvasState.viewport?.x || 0),
    y: Number(canvasState.viewport?.y || 0),
    zoom: Number(canvasState.viewport?.zoom || 1)
  };

  const manifest: RevisionManifest = {
    schemaVersion,
    workspaceId,
    nodes,
    edges,
    viewport,
    layoutManifest: canvasState.layoutManifest,
    createdAt
  };

  // Run assertion checks
  assertNoBase64(manifest);
  assertNoBlobUrl(manifest);
  assertNoSignedUrl(manifest);
  assertManifestSize(manifest);

  return manifest;
}

export function assertNoBase64(obj: any, path = 'manifest'): void {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/')) {
      throw new Error(`[ManifestPurification] Base64 image detected at ${path}`);
    }
    if (obj.length > 500 && /^[A-Za-z0-9+/=]+$/.test(obj)) {
      throw new Error(`[ManifestPurification] Raw Base64 string payload detected at ${path}`);
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoBase64(item, `${path}[${idx}]`));
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assertNoBase64(v, `${path}.${k}`);
    }
  }
}

export function assertNoBlobUrl(obj: any, path = 'manifest'): void {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.startsWith('blob:')) {
      throw new Error(`[ManifestPurification] Blob URL detected at ${path}: ${obj}`);
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoBlobUrl(item, `${path}[${idx}]`));
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assertNoBlobUrl(v, `${path}.${k}`);
    }
  }
}

export function assertNoSignedUrl(obj: any, path = 'manifest'): void {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (
      obj.includes('/storage/v1/object/sign/') ||
      obj.includes('X-Amz-Signature=') ||
      (obj.includes('token=') && obj.includes('supabase.co'))
    ) {
      throw new Error(`[ManifestPurification] Short-lived signed URL detected at ${path}: ${obj.slice(0, 50)}...`);
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoSignedUrl(item, `${path}[${idx}]`));
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assertNoSignedUrl(v, `${path}.${k}`);
    }
  }
}

export function assertManifestSize(manifest: any, maxBytes = 1048576): void {
  const jsonStr = JSON.stringify(manifest);
  const byteSize = new TextEncoder().encode(jsonStr).length;
  if (byteSize > maxBytes) {
    throw new Error(`[ManifestPurification] Manifest size (${byteSize} bytes) exceeds limit (${maxBytes} bytes)`);
  }
}
