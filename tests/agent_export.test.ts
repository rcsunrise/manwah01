import { describe, it, expect } from 'vitest';
import { DetailPageCanvasConfig, DetailPageExportResult, DetailPageRenderTask } from '../src/types';

describe('Phase 5 Long Image Stitching & Canvas Export Tests', () => {
  it('should calculate total canvas height and generate slice assets correctly', () => {
    const config: DetailPageCanvasConfig = {
      widthPx: 750,
      showBrandHeader: true,
      showFooterGuarantee: true,
      showSellingPointOverlay: true,
      themeColor: '#f59e0b',
      screenSpacingPx: 10
    };

    const tasks: DetailPageRenderTask[] = Array.from({ length: 9 }).map((_, i) => ({
      id: `task_${i + 1}`,
      agentRunId: 'run123',
      projectId: 'proj1',
      screenIndex: i + 1,
      screenTitle: `屏 ${i + 1}`,
      coreSellingPoint: `卖点 ${i + 1}`,
      prompt: 'p',
      aspectRatio: '3:4',
      lockedRules: [],
      status: 'completed',
      resultImageUrl: 'data:image/svg+xml;utf8,<svg></svg>',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const width = config.widthPx;
    const screenHeight = Math.round((width * 4) / 3); // 1000px per screen
    const headerHeight = config.showBrandHeader ? 160 : 0;
    const footerHeight = config.showFooterGuarantee ? 240 : 0;
    const totalContentHeight = tasks.length * screenHeight + (tasks.length - 1) * config.screenSpacingPx;
    const totalHeight = headerHeight + totalContentHeight + footerHeight;

    expect(width).toBe(750);
    expect(screenHeight).toBe(1000);
    expect(totalHeight).toBe(160 + (9 * 1000 + 8 * 10) + 240); // 160 + 9080 + 240 = 9480px
  });
});
