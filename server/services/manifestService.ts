/**
 * Server-side Manifest Purification & Assertion Service
 */

export interface RevisionManifestNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, any>;
}

export interface RevisionManifest {
  schemaVersion: string;
  workspaceId: string;
  nodes: RevisionManifestNode[];
  edges: any[];
  viewport: { x: number; y: number; zoom: number };
  layoutManifest?: Record<string, any>;
  createdAt: string;
}

export function cleanNodeDataForManifest(data: Record<string, any> | undefined): Record<string, any> {
  if (!data || typeof data !== 'object') return {};

  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('on') || typeof value === 'function') {
      continue;
    }

    if (value && typeof value === 'object' && ((value as any).$$typeof || (value as any).nodeType)) {
      continue;
    }

    if (typeof value === 'string') {
      if (value.startsWith('data:image/')) {
        continue;
      }
      if (value.startsWith('blob:')) {
        continue;
      }
      if (
        value.includes('/storage/v1/object/sign/') ||
        value.includes('X-Amz-Signature=') ||
        (value.includes('token=') && value.includes('supabase.co'))
      ) {
        continue;
      }
      if (value.length > 500 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        continue;
      }
    }

    if (key === 'errorStack' || key === 'rawSseStream' || key === 'uploadProgressObj') {
      continue;
    }

    cleaned[key] = value;
  }

  if (typeof cleaned.imageUrl === 'string') {
    if (cleaned.imageUrl.startsWith('data:image/') || cleaned.imageUrl.startsWith('blob:')) {
      delete cleaned.imageUrl;
    }
  }

  return cleaned;
}

export function sanitizeManifest(manifest: any): RevisionManifest {
  if (!manifest || typeof manifest !== 'object') {
    return {
      schemaVersion: '2026.08.c4a4',
      workspaceId: 'workspace_default',
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: new Date().toISOString()
    };
  }

  const nodes = Array.isArray(manifest.nodes)
    ? manifest.nodes.map((n: any) => ({
        id: String(n.id || ''),
        type: String(n.type || 'default'),
        position: {
          x: Number(n.position?.x || 0),
          y: Number(n.position?.y || 0)
        },
        width: n.width ? Number(n.width) : undefined,
        height: n.height ? Number(n.height) : undefined,
        data: cleanNodeDataForManifest(n.data)
      }))
    : [];

  const edges = Array.isArray(manifest.edges)
    ? manifest.edges.map((e: any) => ({
        id: String(e.id || ''),
        source: String(e.source || ''),
        target: String(e.target || ''),
        sourceHandle: e.sourceHandle ? String(e.sourceHandle) : null,
        targetHandle: e.targetHandle ? String(e.targetHandle) : null,
        type: e.type ? String(e.type) : undefined,
        animated: Boolean(e.animated),
        style: e.style
      }))
    : [];

  const viewport = {
    x: Number(manifest.viewport?.x || 0),
    y: Number(manifest.viewport?.y || 0),
    zoom: Number(manifest.viewport?.zoom || 1)
  };

  const purified: RevisionManifest = {
    schemaVersion: manifest.schemaVersion || '2026.08.c4a4',
    workspaceId: manifest.workspaceId || 'workspace_default',
    nodes,
    edges,
    viewport,
    layoutManifest: manifest.layoutManifest,
    createdAt: manifest.createdAt || new Date().toISOString()
  };

  assertNoBase64(purified);
  assertNoBlobUrl(purified);
  assertNoSignedUrl(purified);
  assertManifestSize(purified);

  return purified;
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
  const byteSize = Buffer.byteLength(jsonStr, 'utf-8');
  if (byteSize > maxBytes) {
    throw new Error(`[ManifestPurification] Manifest size (${byteSize} bytes) exceeds limit (${maxBytes} bytes)`);
  }
}
