import crypto from 'crypto';
import { AppError } from '../types';
import {
  NineScreenLayoutManifest,
  LayoutSlotSpec,
  LayoutValidationResult
} from '../../src/types/layoutManifest';
import {
  computeLayoutTransform,
  validateNineScreenLayoutManifest,
  calculateManifestChecksum,
  simplifyAspectRatio,
  DEFAULT_SUGGESTED_SLOT_HEIGHTS
} from '../../src/lib/layoutGeometry';
import { LayoutManifestRepository } from '../repositories/layoutManifestRepository';
import { supabaseAdmin } from '../../src/lib/supabase';

export class LayoutManifestService {
  /**
   * Create or Save Draft Manifest for a Canvas
   */
  static async createDraftManifest(params: {
    canvasId: string;
    projectId: string;
    slots: (Partial<LayoutSlotSpec> & { sceneKey?: any })[];
    widthPx?: number;
    targetHeightPx?: number;
    userId?: string;
  }): Promise<NineScreenLayoutManifest> {
    const {
      canvasId,
      projectId,
      slots,
      widthPx = 2100,
      targetHeightPx = 14800,
      userId = 'system'
    } = params;

    if (!canvasId || !projectId) {
      throw new AppError('canvasId 和 projectId 不能为空', 400, 'PARAM_REQUIRED');
    }

    if (!Array.isArray(slots) || slots.length === 0) {
      throw new AppError('slots 数组不能为空，必须包含 9 屏分镜', 400, 'SLOTS_REQUIRED');
    }

    // Verify existing manifests to determine version number
    const existingList = await LayoutManifestRepository.getManifestsByCanvasId(canvasId);
    const versionNumber = existingList.length + 1;
    const versionCode = `V${String(versionNumber).padStart(3, '0')}`;
    const manifestId = `manifest_${canvasId}_${versionCode}_${Date.now()}`;

    // Process and enrich slots
    const enrichedSlots: LayoutSlotSpec[] = slots.map((slot, idx) => {
      const sceneIndex = idx + 1;
      const sceneKey: `scene-${string}` = slot.sceneKey || `scene-${String(sceneIndex).padStart(2, '0')}` as any;
      const sourceWidth = Number(slot.sourceWidth) || 1920;
      const sourceHeight = Number(slot.sourceHeight) || 1080;
      const sourceAspectRatio = slot.sourceAspectRatio || simplifyAspectRatio(sourceWidth, sourceHeight);
      
      const defaultHeight = DEFAULT_SUGGESTED_SLOT_HEIGHTS[idx]?.slotHeight || 1500;
      const slotHeight = Number(slot.slotHeight) || defaultHeight;
      const targetWidth = Number(slot.targetWidth) || widthPx;
      const layoutSlotRatio = slot.layoutSlotRatio || simplifyAspectRatio(targetWidth, slotHeight);
      
      const fitMode = slot.fitMode || 'contain';
      const focalPoint = slot.focalPoint || { x: 0.5, y: 0.5 };
      const safeArea = slot.safeArea || { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 };
      const reservedZones = slot.reservedZones || [];
      const subjectBounds = slot.subjectBounds || null;
      const backgroundColor = slot.backgroundColor || '#F7F4EF';

      const renderTransform = computeLayoutTransform({
        slotWidth: targetWidth,
        slotHeight,
        sourceWidth,
        sourceHeight,
        fitMode,
        focalPoint,
        subjectBounds,
        reservedZones
      });

      return {
        sceneKey,
        assetVersionId: slot.assetVersionId || `asset-ver-${sceneKey}-v001`,
        sourceWidth,
        sourceHeight,
        sourceAspectRatio,
        targetWidth,
        slotHeight,
        layoutSlotRatio,
        fitMode,
        focalPoint,
        safeArea,
        reservedZones,
        subjectBounds,
        backgroundColor,
        validationStatus: renderTransform.warnings.length > 0 ? 'warning' : 'valid',
        warnings: renderTransform.warnings,
        renderTransform
      };
    });

    let totalComputedHeightPx = 0;
    enrichedSlots.forEach(s => {
      totalComputedHeightPx += s.slotHeight;
    });

    const draftManifest: NineScreenLayoutManifest = {
      schemaVersion: 'layout-manifest/v1',
      manifestId,
      projectId,
      canvasId,
      versionNumber,
      versionCode,
      widthPx: widthPx as 2100,
      targetHeightPx: targetHeightPx as 14800,
      slots: enrichedSlots,
      totalComputedHeightPx,
      status: 'draft',
      checksum: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    draftManifest.checksum = await calculateManifestChecksum(draftManifest);

    await LayoutManifestRepository.saveManifest(draftManifest, userId);

    return draftManifest;
  }

  /**
   * Get Manifest by ID
   */
  static async getManifestById(manifestId: string): Promise<NineScreenLayoutManifest> {
    const manifest = await LayoutManifestRepository.getManifestById(manifestId);
    if (!manifest) {
      throw new AppError(`找不到 Manifest ID: ${manifestId}`, 404, 'MANIFEST_NOT_FOUND');
    }
    return manifest;
  }

  /**
   * Get Current Manifest for Canvas
   */
  static async getCurrentManifest(canvasId: string): Promise<NineScreenLayoutManifest | null> {
    return await LayoutManifestRepository.getCurrentManifest(canvasId);
  }

  /**
   * Run Deterministic Validation on a Manifest
   */
  static async validateManifest(manifestId: string): Promise<{
    manifest: NineScreenLayoutManifest;
    validation: LayoutValidationResult;
  }> {
    const manifest = await this.getManifestById(manifestId);
    const validation = validateNineScreenLayoutManifest(manifest);

    return {
      manifest,
      validation
    };
  }

  /**
   * Approve Manifest (Locks it immutably for downstream long-image synthesis)
   */
  static async approveManifest(manifestId: string, userId: string = 'system'): Promise<NineScreenLayoutManifest> {
    const manifest = await this.getManifestById(manifestId);

    if (manifest.status === 'approved') {
      return manifest; // Idempotent
    }

    const validation = validateNineScreenLayoutManifest(manifest);
    if (!validation.canApprove) {
      const errorMsg = validation.globalErrors.join('; ') || '存在未通过的非法分镜插槽';
      throw new AppError(`无法批准该 Manifest: ${errorMsg}`, 400, 'MANIFEST_VALIDATION_FAILED');
    }

    // Set status to approved and freeze
    manifest.status = 'approved';
    manifest.approvedBy = userId;
    manifest.approvedAt = new Date().toISOString();
    manifest.updatedAt = new Date().toISOString();

    // Recompute stable checksum
    manifest.checksum = await calculateManifestChecksum(manifest);

    await LayoutManifestRepository.saveManifest(manifest, userId);
    return manifest;
  }

  /**
   * Derive New Draft Manifest from an existing (approved or draft) Manifest
   */
  static async deriveDraftManifest(manifestId: string, userId: string = 'system'): Promise<NineScreenLayoutManifest> {
    const parentManifest = await this.getManifestById(manifestId);

    const existingList = await LayoutManifestRepository.getManifestsByCanvasId(parentManifest.canvasId);
    const nextVersionNumber = existingList.length + 1;
    const nextVersionCode = `V${String(nextVersionNumber).padStart(3, '0')}`;
    const newManifestId = `manifest_${parentManifest.canvasId}_${nextVersionCode}_${Date.now()}`;

    // Clone slots with clean state
    const clonedSlots: LayoutSlotSpec[] = parentManifest.slots.map(s => ({
      ...s,
      renderTransform: computeLayoutTransform({
        slotWidth: s.targetWidth || 2100,
        slotHeight: s.slotHeight,
        sourceWidth: s.sourceWidth,
        sourceHeight: s.sourceHeight,
        fitMode: s.fitMode,
        focalPoint: s.focalPoint,
        subjectBounds: s.subjectBounds,
        reservedZones: s.reservedZones
      })
    }));

    const newDraft: NineScreenLayoutManifest = {
      schemaVersion: 'layout-manifest/v1',
      manifestId: newManifestId,
      projectId: parentManifest.projectId,
      canvasId: parentManifest.canvasId,
      versionNumber: nextVersionNumber,
      versionCode: nextVersionCode,
      widthPx: parentManifest.widthPx,
      targetHeightPx: parentManifest.targetHeightPx,
      slots: clonedSlots,
      totalComputedHeightPx: parentManifest.totalComputedHeightPx,
      status: 'draft',
      checksum: '',
      parentManifestId: parentManifest.manifestId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    newDraft.checksum = await calculateManifestChecksum(newDraft);

    await LayoutManifestRepository.saveManifest(newDraft, userId);
    return newDraft;
  }

  /**
   * Alias for deriveDraftManifest
   */
  static async deriveNewManifestVersion(manifestId: string, userId: string = 'system'): Promise<NineScreenLayoutManifest> {
    return this.deriveDraftManifest(manifestId, userId);
  }

  /**
   * Get all manifest versions for a canvas
   */
  static async getManifestVersions(canvasId: string): Promise<NineScreenLayoutManifest[]> {
    return LayoutManifestRepository.getManifestsByCanvasId(canvasId);
  }
}
