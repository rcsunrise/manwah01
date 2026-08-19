import { RenderTask } from '../../src/types';

export interface MockTransportResult {
  providerRequestId: string;
  actualModel: string;
  provider: string;
  resultImageUrl: string;
  actualWidth: number;
  actualHeight: number;
  billable: false;
  estimatedCostUsd: 0;
  finishReason: string;
}

/**
 * Mock Transport for G0-2A Infrastructure Validation.
 * Returns deterministic SVG image data and metadata without making any external API calls.
 * Guarantees zero cost (`realImageCalls = 0`, `billableImageCalls = 0`).
 */
export async function executeMockImageTransport(task: RenderTask): Promise<MockTransportResult> {
  const providerRequestId = `mock_req_${Date.now()}_s${task.screenIndex}_${Math.random().toString(36).substring(2, 7)}`;
  
  let width = 1024;
  let height = 1365; // Default 3:4

  if (task.aspectRatio) {
    const parts = task.aspectRatio.split(':');
    if (parts.length === 2) {
      const wRatio = parseFloat(parts[0]);
      const hRatio = parseFloat(parts[1]);
      if (!isNaN(wRatio) && !isNaN(hRatio) && hRatio > 0) {
        if (wRatio >= hRatio) {
          width = 1365;
          height = Math.round((1365 * hRatio) / wRatio);
        } else {
          height = 1365;
          width = Math.round((1365 * wRatio) / hRatio);
        }
      }
    }
  }

  const bgColors = [
    '#1e293b', '#0f172a', '#172554', '#1c1917', '#111827',
    '#030712', '#064e3b', '#4c1d95', '#701a75'
  ];
  const bg = bgColors[(task.screenIndex - 1) % bgColors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <circle cx="${width / 2}" cy="${height * 0.45}" r="${Math.min(width, height) * 0.25}" fill="#f59e0b" opacity="0.18"/>
    <rect x="${width * 0.2}" y="${height * 0.35}" width="${width * 0.6}" height="${height * 0.22}" rx="16" fill="#f59e0b" opacity="0.85"/>
    <text x="${width / 2}" y="${height * 0.68}" font-family="sans-serif" font-size="${Math.max(16, Math.round(width * 0.035))}" font-weight="bold" fill="#ffffff" text-anchor="middle">分屏 #${task.screenIndex}: ${encodeURIComponent(task.screenSnapshot.screenTitle)}</text>
    <text x="${width / 2}" y="${height * 0.73}" font-family="sans-serif" font-size="${Math.max(12, Math.round(width * 0.024))}" fill="#fcd34d" text-anchor="middle">画幅: ${encodeURIComponent(task.aspectRatio)} · 尺寸: ${width}x${height}</text>
    <text x="${width / 2}" y="${height * 0.78}" font-family="sans-serif" font-size="${Math.max(10, Math.round(width * 0.02))}" fill="#9ca3af" text-anchor="middle">Mock Transport (G0-2A 零计费测试 · Call Count = 0)</text>
  </svg>`;

  const resultImageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return {
    providerRequestId,
    actualModel: 'mock-transport-g0-2a',
    provider: 'mock_transport',
    resultImageUrl,
    actualWidth: width,
    actualHeight: height,
    billable: false,
    estimatedCostUsd: 0,
    finishReason: 'SUCCESS'
  };
}
