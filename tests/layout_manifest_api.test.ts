import { describe, it, expect } from 'vitest';
import { LayoutManifestService } from '../server/services/layoutManifestService';
import { DEFAULT_SUGGESTED_SLOT_HEIGHTS, simplifyAspectRatio } from '../src/lib/layoutGeometry';

describe('C4B-4-R2: Layout Manifest Service & Immutability Tests', () => {
  const canvasId = `test_canvas_service_${Date.now()}`;
  const projectId = `test_proj_service_${Date.now()}`;
  let manifestId = '';

  const slots = DEFAULT_SUGGESTED_SLOT_HEIGHTS.map((s, idx) => ({
    sceneKey: `scene-${String(idx + 1).padStart(2, '0')}` as any,
    assetVersionId: `asset-ver-${idx + 1}-v001`,
    sourceWidth: 1920,
    sourceHeight: 1080,
    sourceAspectRatio: '16:9',
    targetWidth: 2100,
    slotHeight: s.slotHeight,
    layoutSlotRatio: simplifyAspectRatio(2100, s.slotHeight),
    fitMode: 'contain' as const,
    focalPoint: { x: 0.5, y: 0.5 },
    safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
    reservedZones: [],
    backgroundColor: '#F7F4EF'
  }));

  it('1. createDraftManifest - should create draft manifest with V001 and totalHeight 14800', async () => {
    const manifest = await LayoutManifestService.createDraftManifest({
      canvasId,
      projectId,
      slots,
      widthPx: 2100,
      targetHeightPx: 14800
    });

    expect(manifest).toBeDefined();
    expect(manifest.status).toBe('draft');
    expect(manifest.versionCode).toBe('V001');
    expect(manifest.versionNumber).toBe(1);
    expect(manifest.totalComputedHeightPx).toBe(14800);
    expect(manifest.slots).toHaveLength(9);

    manifestId = manifest.manifestId;
  });

  it('2. validateManifest - should validate draft manifest successfully', async () => {
    const val = await LayoutManifestService.validateManifest(manifestId);

    expect(val.validation.valid).toBe(true);
    expect(val.validation.canApprove).toBe(true);
    expect(val.validation.globalErrors).toHaveLength(0);
  });

  it('3. approveManifest - should lock manifest, set approved status and checksum', async () => {
    const approved = await LayoutManifestService.approveManifest(manifestId);

    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeDefined();
    expect(approved.checksum).toBeDefined();
    expect(approved.checksum.length).toBeGreaterThan(10);
  });

  it('4. deriveNewManifestVersion - should create new draft V002 from approved V001', async () => {
    const derived = await LayoutManifestService.deriveNewManifestVersion(manifestId);

    expect(derived.versionCode).toBe('V002');
    expect(derived.versionNumber).toBe(2);
    expect(derived.parentManifestId).toBe(manifestId);
    expect(derived.status).toBe('draft');
  });

  it('5. getCurrentManifest & getManifestVersions - should list all versions with latest active', async () => {
    const current = await LayoutManifestService.getCurrentManifest(canvasId);
    expect(current?.versionCode).toBe('V002');

    const versions = await LayoutManifestService.getManifestVersions(canvasId);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions.some(v => v.versionCode === 'V001' && v.status === 'approved')).toBe(true);
    expect(versions.some(v => v.versionCode === 'V002' && v.status === 'draft')).toBe(true);
  });
});
