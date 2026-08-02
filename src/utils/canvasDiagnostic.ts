import { ViewportState } from '../types/creativeCanvas';

export interface CanvasDiagnosticPayload {
  projectId?: string;
  canvasId?: string;
  revisionId?: string;
  storageMode?: string;
  nodesCount?: number;
  edgesCount?: number;
  generatedImageNodeCount?: number;
  viewport?: ViewportState;
  updatedAt?: string;
  source: string;
  [key: string]: any;
}

export function logCanvasDiagnostic(data: CanvasDiagnosticPayload) {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (
      (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('auth')) &&
      !['canvasId', 'projectId', 'revisionId', 'objectKey', 'storageKey'].includes(k)
    ) {
      continue;
    }
    if (typeof v === 'string' && v.startsWith('data:image/')) {
      cleaned[k] = `[base64_image_len_${v.length}]`;
      continue;
    }
    cleaned[k] = v;
  }
  console.log('[CreativeCanvas:Diagnostic]', JSON.stringify(cleaned));
}
