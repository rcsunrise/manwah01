import { describe, it, expect } from 'vitest';
import {
  computeLayoutTransform,
  validateNineScreenLayoutManifest,
  simplifyAspectRatio,
  DEFAULT_SUGGESTED_SLOT_HEIGHTS
} from '../src/lib/layoutGeometry';
import { NineScreenLayoutManifest, LayoutSlotSpec } from '../src/types/layoutManifest';

describe('C4B-4-R2: Layout Geometry Engine Tests', () => {
  it('should compute contain mode without cropping or stretching for 16:9 source in 2100x1500 slot', () => {
    const result = computeLayoutTransform({
      slotWidth: 2100,
      slotHeight: 1500,
      sourceWidth: 1920,
      sourceHeight: 1080, // 16:9
      fitMode: 'contain',
      focalPoint: { x: 0.5, y: 0.5 }
    });

    expect(result.scale).toBeCloseTo(2100 / 1920, 3);
    expect(result.displayWidth).toBe(2100);
    expect(result.displayHeight).toBeCloseTo(1181.25, 1);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBeCloseTo((1500 - 1181.25) / 2, 1);
    expect(result.isCropped).toBe(false);
    expect(result.cropRect).toBeNull();
  });

  it('should compute cover mode with focalPoint crop for 16:9 source in 2100x2400 slot', () => {
    const result = computeLayoutTransform({
      slotWidth: 2100,
      slotHeight: 2400,
      sourceWidth: 1920,
      sourceHeight: 1080,
      fitMode: 'cover',
      focalPoint: { x: 0.5, y: 0.5 }
    });

    // Scale is governed by height (2400 / 1080)
    expect(result.scale).toBeCloseTo(2400 / 1080, 3);
    expect(result.displayHeight).toBe(2400);
    expect(result.displayWidth).toBeCloseTo(1920 * (2400 / 1080), 1);
    expect(result.isCropped).toBe(true);
    expect(result.cropRect).not.toBeNull();
  });

  it('should simplify aspect ratios correctly', () => {
    expect(simplifyAspectRatio(1920, 1080)).toBe('16:9');
    expect(simplifyAspectRatio(1080, 1440)).toBe('3:4');
    expect(simplifyAspectRatio(1080, 1080)).toBe('1:1');
    expect(simplifyAspectRatio(2100, 14800)).toBe('21:148');
  });

  it('should validate a valid 9-screen layout manifest matching 14800px', () => {
    const slots: LayoutSlotSpec[] = DEFAULT_SUGGESTED_SLOT_HEIGHTS.map((s, idx) => ({
      sceneKey: `scene-${String(idx + 1).padStart(2, '0')}` as any,
      assetVersionId: `asset-ver-${idx + 1}-v001`,
      sourceWidth: 1920,
      sourceHeight: 1080,
      sourceAspectRatio: '16:9',
      targetWidth: 2100,
      slotHeight: s.slotHeight,
      layoutSlotRatio: simplifyAspectRatio(2100, s.slotHeight),
      fitMode: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
      safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
      reservedZones: [],
      subjectBounds: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
      backgroundColor: '#F7F4EF',
      validationStatus: 'valid',
      warnings: []
    }));

    const totalHeight = slots.reduce((sum, s) => sum + s.slotHeight, 0);
    expect(totalHeight).toBe(14800);

    const manifest: NineScreenLayoutManifest = {
      schemaVersion: 'layout-manifest/v1',
      manifestId: 'manifest_test_01',
      projectId: 'proj_test',
      canvasId: 'canvas_test',
      versionNumber: 1,
      versionCode: 'V001',
      widthPx: 2100,
      targetHeightPx: 14800,
      slots,
      totalComputedHeightPx: totalHeight,
      status: 'draft',
      checksum: 'test_chk',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const val = validateNineScreenLayoutManifest(manifest);
    expect(val.valid).toBe(true);
    expect(val.canApprove).toBe(true);
    expect(val.globalErrors).toHaveLength(0);
  });

  it('should report error if total height does not match 14800px', () => {
    const slots: LayoutSlotSpec[] = Array.from({ length: 9 }).map((_, idx) => ({
      sceneKey: `scene-${String(idx + 1).padStart(2, '0')}` as any,
      assetVersionId: `asset-ver-${idx + 1}`,
      sourceWidth: 1080,
      sourceHeight: 1440,
      sourceAspectRatio: '3:4',
      targetWidth: 2100,
      slotHeight: 1000, // total 9000 != 14800
      layoutSlotRatio: '21:10',
      fitMode: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
      safeArea: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
      reservedZones: [],
      backgroundColor: '#F7F4EF',
      validationStatus: 'valid',
      warnings: []
    }));

    const manifest: NineScreenLayoutManifest = {
      schemaVersion: 'layout-manifest/v1',
      manifestId: 'manifest_test_err',
      projectId: 'proj_test',
      canvasId: 'canvas_test',
      versionNumber: 1,
      versionCode: 'V001',
      widthPx: 2100,
      targetHeightPx: 14800,
      slots,
      totalComputedHeightPx: 9000,
      status: 'draft',
      checksum: 'test_chk',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const val = validateNineScreenLayoutManifest(manifest);
    expect(val.valid).toBe(false);
    expect(val.canApprove).toBe(false);
    expect(val.globalErrors.some(e => e.includes('14800'))).toBe(true);
  });
});
