export type FitMode = 'contain' | 'cover' | 'smart_crop';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  id?: string;
  label?: string;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RenderTransform {
  scale: number;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  cropRect: NormalizedRect;
  isCropped: boolean;
  warnings: string[];
}

export interface LayoutSlotSpec {
  sceneKey: `scene-${string}`;
  assetVersionId: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceAspectRatio: string;
  targetWidth: number;
  slotHeight: number;
  layoutSlotRatio: string;
  fitMode: FitMode;
  focalPoint: NormalizedPoint;
  safeArea: SafeAreaInsets;
  reservedZones: NormalizedRect[];
  subjectBounds?: NormalizedRect | null;
  backgroundColor: string;
  validationStatus: 'valid' | 'warning' | 'invalid';
  warnings: string[];
  renderTransform?: RenderTransform;
}

export interface NineScreenLayoutManifest {
  schemaVersion: 'layout-manifest/v1';
  manifestId: string;
  projectId: string;
  canvasId: string;
  versionNumber?: number;
  versionCode?: string;
  widthPx: 2100;
  targetHeightPx: 14800;
  slots: LayoutSlotSpec[];
  totalComputedHeightPx: number;
  status: 'draft' | 'valid' | 'approved' | 'superseded';
  checksum: string;
  parentManifestId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LayoutErrorCode =
  | 'SOURCE_DIMENSIONS_MISSING'
  | 'SOURCE_RATIO_MISMATCH'
  | 'INVALID_FOCAL_POINT'
  | 'INVALID_SAFE_AREA'
  | 'SLOT_HEIGHT_INVALID'
  | 'TOTAL_HEIGHT_MISMATCH'
  | 'SCENE_SET_INCOMPLETE'
  | 'ASSET_NOT_PRODUCTION_READY'
  | 'ASSET_VERSION_STALE'
  | 'SMART_CROP_SUBJECT_MISSING'
  | 'SUBJECT_CROPPED'
  | 'SUBJECT_OUTSIDE_SAFE_CONTENT'
  | 'SAFE_ZONE_CONFLICT'
  | 'MANIFEST_IMMUTABLE';

export interface LayoutValidationResult {
  valid: boolean;
  canApprove: boolean;
  totalComputedHeightPx: number;
  targetHeightPx: number;
  heightDelta: number;
  slotResults: Array<{
    sceneKey: string;
    validationStatus: 'valid' | 'warning' | 'invalid';
    warnings: string[];
    errors: string[];
    renderTransform: RenderTransform;
  }>;
  globalErrors: string[];
  globalWarnings: string[];
}
