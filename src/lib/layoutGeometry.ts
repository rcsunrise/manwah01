import {
  FitMode,
  NormalizedPoint,
  NormalizedRect,
  SafeAreaInsets,
  RenderTransform,
  LayoutSlotSpec,
  NineScreenLayoutManifest,
  LayoutValidationResult,
  LayoutErrorCode
} from '../types/layoutManifest';

/**
 * Helper to round floats to 6 decimal places for deterministic precision
 */
export function round6(val: number): number {
  return Math.round(val * 1000000) / 1000000;
}

/**
 * Greatest Common Divisor
 */
function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Simplify width & height into standard ratio string (e.g. "16:9", "3:4", "21:24")
 */
export function simplifyAspectRatio(w: number, h: number): string {
  if (!w || !h || w <= 0 || h <= 0) return '3:4';
  
  // Check common ratios with tolerance
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(ratio - 3 / 4) < 0.02) return '3:4';
  if (Math.abs(ratio - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(ratio - 1 / 1) < 0.02) return '1:1';
  if (Math.abs(ratio - 21 / 24) < 0.02) return '21:24';
  if (Math.abs(ratio - 21 / 14) < 0.02) return '21:14';
  if (Math.abs(ratio - 21 / 15) < 0.02) return '21:15';

  const g = gcd(w, h);
  const sw = Math.round(w / g);
  const sh = Math.round(h / g);
  
  // If numbers are too big, approximate to 2 decimal places
  if (sw > 100 || sh > 100) {
    return `${Math.round(ratio * 100)}:100`;
  }
  return `${sw}:${sh}`;
}

/**
 * Compute Contain Transform
 */
export function computeContainTransform(
  slotWidth: number,
  slotHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  focalPoint: NormalizedPoint = { x: 0.5, y: 0.5 }
): RenderTransform {
  const scale = Math.min(slotWidth / sourceWidth, slotHeight / sourceHeight);
  const displayWidth = round6(sourceWidth * scale);
  const displayHeight = round6(sourceHeight * scale);
  const offsetX = round6((slotWidth - displayWidth) * focalPoint.x);
  const offsetY = round6((slotHeight - displayHeight) * focalPoint.y);

  return {
    scale: round6(scale),
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    cropRect: { x: 0, y: 0, width: 1, height: 1 },
    isCropped: false,
    warnings: []
  };
}

/**
 * Compute Cover Transform
 */
export function computeCoverTransform(
  slotWidth: number,
  slotHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  focalPoint: NormalizedPoint = { x: 0.5, y: 0.5 },
  subjectBounds?: NormalizedRect | null
): RenderTransform {
  const scale = Math.max(slotWidth / sourceWidth, slotHeight / sourceHeight);
  const displayWidth = round6(sourceWidth * scale);
  const displayHeight = round6(sourceHeight * scale);
  const overflowX = displayWidth - slotWidth;
  const overflowY = displayHeight - slotHeight;
  const offsetX = round6(-overflowX * focalPoint.x);
  const offsetY = round6(-overflowY * focalPoint.y);

  let cropRect: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
  const isCropped = overflowX > 0.5 || overflowY > 0.5;
  const warnings: string[] = [];

  if (displayWidth > slotWidth) {
    const visibleWidthInSource = slotWidth / scale;
    const cropSourceX = (sourceWidth - visibleWidthInSource) * focalPoint.x;
    cropRect = {
      x: round6(cropSourceX / sourceWidth),
      y: 0,
      width: round6(visibleWidthInSource / sourceWidth),
      height: 1
    };
  } else if (displayHeight > slotHeight) {
    const visibleHeightInSource = slotHeight / scale;
    const cropSourceY = (sourceHeight - visibleHeightInSource) * focalPoint.y;
    cropRect = {
      x: 0,
      y: round6(cropSourceY / sourceHeight),
      width: 1,
      height: round6(visibleHeightInSource / sourceHeight)
    };
  }

  // Check if subjectBounds is cropped
  if (subjectBounds && isCropped) {
    const sbRight = subjectBounds.x + subjectBounds.width;
    const sbBottom = subjectBounds.y + subjectBounds.height;
    const cropRight = cropRect.x + cropRect.width;
    const cropBottom = cropRect.y + cropRect.height;

    if (
      subjectBounds.x < cropRect.x - 0.002 ||
      subjectBounds.y < cropRect.y - 0.002 ||
      sbRight > cropRight + 0.002 ||
      sbBottom > cropBottom + 0.002
    ) {
      warnings.push('SUBJECT_CROPPED');
    }
  }

  return {
    scale: round6(scale),
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    cropRect,
    isCropped,
    warnings
  };
}

/**
 * Compute Smart Crop Transform (Deterministic pure geometry, no AI model call)
 */
export function computeSmartCropTransform(
  slotWidth: number,
  slotHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  focalPoint: NormalizedPoint = { x: 0.5, y: 0.5 },
  subjectBounds?: NormalizedRect | null,
  reservedZones: NormalizedRect[] = []
): RenderTransform {
  if (!subjectBounds) {
    const contain = computeContainTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, focalPoint);
    return {
      ...contain,
      warnings: ['SMART_CROP_SUBJECT_MISSING']
    };
  }

  const slotRatio = slotWidth / slotHeight;
  const sourceRatio = sourceWidth / sourceHeight;

  let cropWidthInSource = sourceWidth;
  let cropHeightInSource = sourceHeight;

  if (slotRatio >= sourceRatio) {
    cropHeightInSource = sourceWidth / slotRatio;
    cropWidthInSource = sourceWidth;
  } else {
    cropWidthInSource = sourceHeight * slotRatio;
    cropHeightInSource = sourceHeight;
  }

  const sbX = subjectBounds.x * sourceWidth;
  const sbY = subjectBounds.y * sourceHeight;
  const sbW = subjectBounds.width * sourceWidth;
  const sbH = subjectBounds.height * sourceHeight;

  // If subject is physically wider or taller than the maximum aspect crop window in source
  if (sbW > cropWidthInSource + 2 || sbH > cropHeightInSource + 2) {
    // Subject doesn't fit in cover crop window -> fallback to contain
    const contain = computeContainTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, focalPoint);
    return {
      ...contain,
      warnings: ['SUBJECT_CROPPED', 'SMART_CROP_SUBJECT_TOO_LARGE']
    };
  }

  // Bounds for crop origin in source pixels
  const minCropX = Math.max(0, (sbX + sbW) - cropWidthInSource);
  const maxCropX = Math.min(sourceWidth - cropWidthInSource, sbX);
  const minCropY = Math.max(0, (sbY + sbH) - cropHeightInSource);
  const maxCropY = Math.min(sourceHeight - cropHeightInSource, sbY);

  const idealCropX = (sourceWidth - cropWidthInSource) * focalPoint.x;
  const idealCropY = (sourceHeight - cropHeightInSource) * focalPoint.y;

  let finalCropX = Math.min(Math.max(idealCropX, minCropX), maxCropX);
  let finalCropY = Math.min(Math.max(idealCropY, minCropY), maxCropY);

  const scale = slotWidth / cropWidthInSource;
  const displayWidth = round6(sourceWidth * scale);
  const displayHeight = round6(sourceHeight * scale);
  const offsetX = round6(-finalCropX * scale);
  const offsetY = round6(-finalCropY * scale);

  const cropRect: NormalizedRect = {
    x: round6(finalCropX / sourceWidth),
    y: round6(finalCropY / sourceHeight),
    width: round6(cropWidthInSource / sourceWidth),
    height: round6(cropHeightInSource / sourceHeight)
  };

  const warnings: string[] = [];

  // Check collision with reserved zones in slot coordinates
  const subjectInSlotNorm: NormalizedRect = {
    x: (offsetX + subjectBounds.x * displayWidth) / slotWidth,
    y: (offsetY + subjectBounds.y * displayHeight) / slotHeight,
    width: (subjectBounds.width * displayWidth) / slotWidth,
    height: (subjectBounds.height * displayHeight) / slotHeight
  };

  for (const zone of reservedZones) {
    const intersects = !(
      subjectInSlotNorm.x + subjectInSlotNorm.width <= zone.x + 0.002 ||
      zone.x + zone.width <= subjectInSlotNorm.x + 0.002 ||
      subjectInSlotNorm.y + subjectInSlotNorm.height <= zone.y + 0.002 ||
      zone.y + zone.height <= subjectInSlotNorm.y + 0.002
    );
    if (intersects) {
      warnings.push('SAFE_ZONE_CONFLICT');
      break;
    }
  }

  return {
    scale: round6(scale),
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    cropRect,
    isCropped: true,
    warnings
  };
}

/**
 * Universal Layout Transform Dispatcher
 */
export function computeLayoutTransform(params: {
  slotWidth: number;
  slotHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  fitMode: FitMode;
  focalPoint?: NormalizedPoint;
  subjectBounds?: NormalizedRect | null;
  reservedZones?: NormalizedRect[];
}): RenderTransform {
  const {
    slotWidth,
    slotHeight,
    sourceWidth,
    sourceHeight,
    fitMode,
    focalPoint = { x: 0.5, y: 0.5 },
    subjectBounds = null,
    reservedZones = []
  } = params;

  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      scale: 1,
      displayWidth: slotWidth,
      displayHeight: slotHeight,
      offsetX: 0,
      offsetY: 0,
      cropRect: { x: 0, y: 0, width: 1, height: 1 },
      isCropped: false,
      warnings: ['SOURCE_DIMENSIONS_MISSING']
    };
  }

  if (fitMode === 'cover') {
    return computeCoverTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, focalPoint, subjectBounds);
  } else if (fitMode === 'smart_crop') {
    return computeSmartCropTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, focalPoint, subjectBounds, reservedZones);
  } else {
    return computeContainTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, focalPoint);
  }
}

/**
 * Check collision between Subject in Slot and Safe Area / Reserved Zones
 */
export function checkSlotSafetyAndConflicts(params: {
  slotWidth: number;
  slotHeight: number;
  renderTransform: RenderTransform;
  safeArea: SafeAreaInsets;
  reservedZones: NormalizedRect[];
  subjectBounds?: NormalizedRect | null;
}): { warnings: string[]; errors: string[] } {
  const {
    slotWidth,
    slotHeight,
    renderTransform,
    safeArea,
    reservedZones,
    subjectBounds
  } = params;

  const warnings: string[] = [...renderTransform.warnings];
  const errors: string[] = [];

  // Validate focalPoint / safeArea bounds
  if (
    safeArea.top < 0 || safeArea.top > 0.45 ||
    safeArea.right < 0 || safeArea.right > 0.45 ||
    safeArea.bottom < 0 || safeArea.bottom > 0.45 ||
    safeArea.left < 0 || safeArea.left > 0.45 ||
    safeArea.top + safeArea.bottom >= 0.9 ||
    safeArea.left + safeArea.right >= 0.9
  ) {
    errors.push('INVALID_SAFE_AREA');
  }

  if (subjectBounds) {
    const subjectInSlotNorm: NormalizedRect = {
      x: (renderTransform.offsetX + subjectBounds.x * renderTransform.displayWidth) / slotWidth,
      y: (renderTransform.offsetY + subjectBounds.y * renderTransform.displayHeight) / slotHeight,
      width: (subjectBounds.width * renderTransform.displayWidth) / slotWidth,
      height: (subjectBounds.height * renderTransform.displayHeight) / slotHeight
    };

    const safeRect: NormalizedRect = {
      x: safeArea.left,
      y: safeArea.top,
      width: 1 - safeArea.left - safeArea.right,
      height: 1 - safeArea.top - safeArea.bottom
    };

    // Check outside safe content
    if (
      subjectInSlotNorm.x < safeRect.x - 0.005 ||
      subjectInSlotNorm.y < safeRect.y - 0.005 ||
      (subjectInSlotNorm.x + subjectInSlotNorm.width) > (safeRect.x + safeRect.width + 0.005) ||
      (subjectInSlotNorm.y + subjectInSlotNorm.height) > (safeRect.y + safeRect.height + 0.005)
    ) {
      if (!warnings.includes('SUBJECT_OUTSIDE_SAFE_CONTENT')) {
        warnings.push('SUBJECT_OUTSIDE_SAFE_CONTENT');
      }
    }

    // Check reserved zones conflict
    for (const zone of reservedZones) {
      const intersects = !(
        subjectInSlotNorm.x + subjectInSlotNorm.width <= zone.x + 0.002 ||
        zone.x + zone.width <= subjectInSlotNorm.x + 0.002 ||
        subjectInSlotNorm.y + subjectInSlotNorm.height <= zone.y + 0.002 ||
        zone.y + zone.height <= subjectInSlotNorm.y + 0.002
      );
      if (intersects) {
        if (!warnings.includes('SAFE_ZONE_CONFLICT')) {
          warnings.push('SAFE_ZONE_CONFLICT');
        }
      }
    }
  }

  return { warnings, errors };
}

/**
 * Validate an entire NineScreenLayoutManifest deterministically
 */
export function validateNineScreenLayoutManifest(
  manifest: NineScreenLayoutManifest,
  productionAssetsMap?: Map<string, { width: number; height: number; checksum?: string; status?: string }>
): LayoutValidationResult {
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];
  const slotResults: LayoutValidationResult['slotResults'] = [];

  const requiredScenes = ['scene-01', 'scene-02', 'scene-03', 'scene-04', 'scene-05', 'scene-06', 'scene-07', 'scene-08', 'scene-09'];
  const presentScenes = new Set<string>();

  let totalComputedHeight = 0;

  for (const slot of manifest.slots || []) {
    presentScenes.add(slot.sceneKey);
    const slotErrors: string[] = [];
    let slotWarnings: string[] = [];

    // Check height
    if (!slot.slotHeight || slot.slotHeight <= 0 || !Number.isInteger(slot.slotHeight)) {
      slotErrors.push('SLOT_HEIGHT_INVALID');
    } else {
      totalComputedHeight += slot.slotHeight;
    }

    // Check focalPoint
    if (
      slot.focalPoint.x < 0 || slot.focalPoint.x > 1 ||
      slot.focalPoint.y < 0 || slot.focalPoint.y > 1
    ) {
      slotErrors.push('INVALID_FOCAL_POINT');
    }

    // Check source dimensions
    if (!slot.sourceWidth || !slot.sourceHeight || slot.sourceWidth <= 0 || slot.sourceHeight <= 0) {
      slotErrors.push('SOURCE_DIMENSIONS_MISSING');
    }

    // Production asset check
    if (productionAssetsMap && slot.assetVersionId) {
      const prodAsset = productionAssetsMap.get(slot.assetVersionId);
      if (!prodAsset) {
        slotErrors.push('ASSET_VERSION_STALE');
      } else if (prodAsset.status && prodAsset.status !== 'production_ready' && prodAsset.status !== 'approved') {
        slotErrors.push('ASSET_NOT_PRODUCTION_READY');
      } else if (
        (prodAsset.width && prodAsset.width !== slot.sourceWidth) ||
        (prodAsset.height && prodAsset.height !== slot.sourceHeight)
      ) {
        slotErrors.push('SOURCE_RATIO_MISMATCH');
      }
    }

    // Compute transform
    const transform = computeLayoutTransform({
      slotWidth: slot.targetWidth || manifest.widthPx || 2100,
      slotHeight: slot.slotHeight,
      sourceWidth: slot.sourceWidth,
      sourceHeight: slot.sourceHeight,
      fitMode: slot.fitMode,
      focalPoint: slot.focalPoint,
      subjectBounds: slot.subjectBounds,
      reservedZones: slot.reservedZones
    });

    const safetyCheck = checkSlotSafetyAndConflicts({
      slotWidth: slot.targetWidth || manifest.widthPx || 2100,
      slotHeight: slot.slotHeight,
      renderTransform: transform,
      safeArea: slot.safeArea,
      reservedZones: slot.reservedZones,
      subjectBounds: slot.subjectBounds
    });

    slotWarnings = [...slotWarnings, ...safetyCheck.warnings];
    slotErrors.push(...safetyCheck.errors);

    let status: 'valid' | 'warning' | 'invalid' = 'valid';
    if (slotErrors.length > 0 || slotWarnings.includes('SUBJECT_CROPPED')) {
      status = 'invalid';
    } else if (slotWarnings.length > 0) {
      status = 'warning';
    }

    slotResults.push({
      sceneKey: slot.sceneKey,
      validationStatus: status,
      warnings: Array.from(new Set(slotWarnings)),
      errors: Array.from(new Set(slotErrors)),
      renderTransform: transform
    });
  }

  // Check all 9 scenes present
  for (const s of requiredScenes) {
    if (!presentScenes.has(s)) {
      globalErrors.push(`SCENE_SET_INCOMPLETE: missing ${s}`);
    }
  }
  if (manifest.slots?.length !== 9) {
    globalErrors.push('SCENE_SET_INCOMPLETE: expected exactly 9 slots');
  }

  // Height Check
  const targetHeight = manifest.targetHeightPx || 14800;
  const heightDelta = totalComputedHeight - targetHeight;
  if (totalComputedHeight !== targetHeight) {
    globalErrors.push(`TOTAL_HEIGHT_MISMATCH: computed ${totalComputedHeight}px != target ${targetHeight}px (delta: ${heightDelta > 0 ? `+${heightDelta}` : heightDelta}px)`);
  }

  const hasInvalidSlots = slotResults.some(r => r.validationStatus === 'invalid' || r.errors.length > 0);
  const isValid = globalErrors.length === 0 && !hasInvalidSlots;
  const canApprove = isValid;

  return {
    valid: isValid,
    canApprove,
    totalComputedHeightPx: totalComputedHeight,
    targetHeightPx: targetHeight,
    heightDelta,
    slotResults,
    globalErrors,
    globalWarnings
  };
}

/**
 * Compute canonical SHA-256 Checksum for Manifest
 * (Uses native Web Crypto or simple SHA-256 for browser/node compatibility)
 */
export async function calculateManifestChecksum(manifest: NineScreenLayoutManifest): Promise<string> {
  const sortedSlots = [...(manifest.slots || [])].sort((a, b) => a.sceneKey.localeCompare(b.sceneKey));

  const canonicalObj = {
    schemaVersion: manifest.schemaVersion || 'layout-manifest/v1',
    widthPx: manifest.widthPx || 2100,
    targetHeightPx: manifest.targetHeightPx || 14800,
    slots: sortedSlots.map(s => ({
      sceneKey: s.sceneKey,
      assetVersionId: s.assetVersionId,
      sourceWidth: Math.round(s.sourceWidth),
      sourceHeight: Math.round(s.sourceHeight),
      sourceAspectRatio: s.sourceAspectRatio,
      targetWidth: Math.round(s.targetWidth || 2100),
      slotHeight: Math.round(s.slotHeight),
      layoutSlotRatio: s.layoutSlotRatio,
      fitMode: s.fitMode,
      focalPoint: { x: round6(s.focalPoint.x), y: round6(s.focalPoint.y) },
      safeArea: {
        top: round6(s.safeArea.top),
        right: round6(s.safeArea.right),
        bottom: round6(s.safeArea.bottom),
        left: round6(s.safeArea.left)
      },
      reservedZones: (s.reservedZones || []).map(z => ({
        x: round6(z.x),
        y: round6(z.y),
        width: round6(z.width),
        height: round6(z.height)
      })),
      subjectBounds: s.subjectBounds
        ? {
            x: round6(s.subjectBounds.x),
            y: round6(s.subjectBounds.y),
            width: round6(s.subjectBounds.width),
            height: round6(s.subjectBounds.height)
          }
        : null,
      backgroundColor: s.backgroundColor || '#F7F4EF'
    }))
  };

  const jsonStr = JSON.stringify(canonicalObj);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback sync sha256 via crypto module in node
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(jsonStr).digest('hex');
  }
}

/**
 * Standard Suggested Initial Slot Heights for 2100x14800
 */
export const DEFAULT_SUGGESTED_SLOT_HEIGHTS: Array<{ sceneKey: `scene-${string}`; slotHeight: number; label: string }> = [
  { sceneKey: 'scene-01', slotHeight: 2400, label: '首屏主视觉与标题留白' },
  { sceneKey: 'scene-02', slotHeight: 1400, label: '核心设计理念' },
  { sceneKey: 'scene-03', slotHeight: 1400, label: '面料与触感细节' },
  { sceneKey: 'scene-04', slotHeight: 1500, label: '人体工学/坐姿演示' },
  { sceneKey: 'scene-05', slotHeight: 1500, label: '核心功能演示' },
  { sceneKey: 'scene-06', slotHeight: 1500, label: '内部材质与工艺' },
  { sceneKey: 'scene-07', slotHeight: 1500, label: '多角度或多户型适配' },
  { sceneKey: 'scene-08', slotHeight: 1500, label: '细节与配件' },
  { sceneKey: 'scene-09', slotHeight: 2100, label: '氛围收尾与品牌信息' }
];
