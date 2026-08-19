
export interface MaskRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface MaskStroke {
  points: Point[];
  width: number;
  tool?: 'brush' | 'eraser' | 'rect';
}

export type GenerationIntent = 'text_to_image' | 'image_edit';
export type ImageRole =
  | 'primary_product'
  | 'scene_reference'
  | 'material_reference'
  | 'person_reference'
  | 'composition_reference'
  | 'style_reference';

export interface ImageAttachment {
  id: string;
  file?: File;
  previewUrl: string;
  base64Data: string; // Raw base64 without prefix
  mimeType: string;
  width: number;
  height: number;
  isAiOptimized?: boolean;
  originalBackup?: ImageAttachment;
  maskRects?: MaskRect[];
  maskStrokes?: MaskStroke[];
  maskDataUrl?: string;
  maskOverlayUrl?: string;
  role?: ImageRole;
  referenceAssetId?: string;
  order?: number;
}

export type SupportedAspectRatio = '1:1' | '1:4' | '1:8' | '2:3' | '3:2' | '3:4' | '4:1' | '4:3' | '4:5' | '5:4' | '8:1' | '9:16' | '16:9' | '21:9'; 
export type UIAspRatioOption = SupportedAspectRatio | 'Auto' | 'Custom'; 

export type Resolution = '1K' | '2K' | '4K' | '512px';
export type ModelType = 'gemini-3-pro' | 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-3-flash' | 'gemini-3.1-flash-lite-preview' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview' | 'google/gemini-3-pro-image-preview' | 'gemini-3.1-flash-image' | 'gemini-3-pro-image' | 'google/gemini-3-pro-image' | 'gemini-2.5-flash-image' | 'gpt-image-2' | 'gpt-image-2-all' | 'openai/gpt-image-1' | 'openai/gpt-image-1.5' | 'openai/gpt-image-2' | 'openai/gpt-image-2-all' | 'routerhub/flux' | 'routerhub/midjourney';

export interface GenerationConfig {
  prompt: string;
  aspectRatio: UIAspRatioOption | string; 
  resolution: Resolution;
  model: ModelType;
  seed?: number;
}

export interface GeneratedResult {
  imageUrl: string;
  prompt: string;
  timestamp: number;
  cropRetentionRate?: number;
  finalFitModeUsed?: string;
}

export type ChannelStatus = 'idle' | 'waiting' | 'generating' | 'success' | 'error';

export interface GenerationTask {
  id: string;
  channelId: number;
  channelName: string;
  status: ChannelStatus;
  result: GeneratedResult | null;
  error?: string;
  startTime?: number;
  model?: ModelType;
  resolution?: Resolution;
  duration?: number;
  pointsUsed?: number;
  dimensions?: { width: number, depth: number, height: number };
  measurements?: {
    pixelWFront: number;
    pixelWSide: number;
    pixelHSide: number;
    calculatedD: number;
    calculatedH: number;
    mmPerPx: number;
  };
  labelAlignmentMode?: 'default' | 'locked';
  isBetaRedraw?: boolean;
  cropRetentionRate?: number;
  finalFitModeUsed?: string;
}

export interface ProcessingChannel {
  id: number;
  name: string;
  images: ImageAttachment[];
  isEnabled: boolean;
  status: ChannelStatus;
  result: GeneratedResult | null;
  error?: string;
  measurements?: {
    pixelWFront: number;
    pixelWSide: number;
    pixelHSide: number;
    calculatedD: number;
    calculatedH: number;
    mmPerPx: number;
  };
}

// New Types for Storage and Templates
export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  role?: string; // Saved role context
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  imageUrl: string; // Base64
  prompt: string;
  roleUsed?: string;
  model: ModelType;
  timestamp: number;
  size: number; // Size in bytes
}

export interface PHYAttribute {
  name: string;
  value: number; // 0-100
  label: string;
  description: string;
}

export interface LocalDimension {
  part: string;
  value: string;
  description?: string;
}

export interface AEPData {
  trendScore: number;
  style: string;
  l2_structure: string[];
  l3_material: string[];
  phy: {
    glossiness: number;
    roughness: number;
    visualWeight: number;
  };
  marketingCopy: string;
  marketingStory?: string; // New field for emotional narrative
  keywords: string[]; // Extracted keywords for prompt generation
  dimensionEstimate?: {
    estW: number;
    estD: number;
    estH: number;
    confidence: number;
    category: string;
  };
  localDimensions?: LocalDimension[];
}

export interface StorageStats {
  usedBytes: number;
  fileCount: number;
}

export interface Profile {
  id: string;
  username: string;
  role: 'admin' | 'user';
  employee_id?: string;
  quota_limit: number;
  quota_used: number;
}

export interface AdminNote {
  id: number;
  content: string;
  updated_at: string;
  updated_by_name: string;
}

export const MAX_HISTORY_TASKS = 20;

// ================= Phase 2: Creative Project & Product Visual DNA =================
export interface CreativeProject {
  id: string;
  owner_id: string;
  name: string;
  project_type: 'poster' | 'detail_page';
  status: 'active' | 'archived';
  settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ProjectAsset {
  id: string;
  project_id: string;
  owner_id: string;
  asset_type: 'product_photo' | 'reference_photo' | 'mask' | 'result';
  storage_path: string;
  mime_type: string;
  width?: number;
  height?: number;
  url?: string;
  storage_url?: string;
  objectKey?: string;
  file_name?: string;
  file_size?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface StructuralFeature {
  name: string;
  description: string;
  confidence: number;
}

export interface LockedFeature {
  name: string;
  rule: string;
  priority: 'critical' | 'high' | 'normal';
}

export interface ProductVisualDNA {
  id?: string;
  project_id: string;
  schema_version: number;
  category: string;
  subcategory?: string;
  style: string[];
  primaryColor: string;
  secondaryColors: string[];
  materials: string[];
  structuralFeatures: StructuralFeature[];
  functionalFeatures: string[];
  lockedFeatures: LockedFeature[];
  logo?: {
    visible: boolean;
    position?: string;
    description?: string;
  };
  sourceAssetIds?: string[];
  user_corrections?: Record<string, any>;
  version?: number;
  confirmed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ================= Phase 3: Detail Page Agent & Plan Confirmation =================
export type AgentRunStatus =
  | 'dna_confirmed'
  | 'plan_generating'
  | 'plan_review'
  | 'plan_approved'
  | 'tasks_generating'
  | 'completed'
  | 'failed'
  | 'canceled';

export const ALLOWED_STATUS_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  dna_confirmed: ['plan_generating', 'canceled'],
  plan_generating: ['plan_review', 'plan_generating', 'failed', 'canceled'],
  plan_review: ['plan_approved', 'plan_generating', 'canceled'],
  plan_approved: ['tasks_generating', 'canceled'],
  tasks_generating: ['completed', 'failed', 'canceled'],
  completed: [],
  failed: ['plan_generating', 'tasks_generating'],
  canceled: []
};

export interface DetailPageScreenPlan {
  screenIndex: number;
  screenTitle: string;
  coreSellingPoint: string;
  visualComposition: string;
  lightingAndAtmosphere: string;
  promptSuggestion: string;
  aspectRatio: string;
  lockedRules: string[];
}

export interface DetailPagePlan {
  projectId: string;
  version: number;
  themeTitle: string;
  targetAudience: string;
  overallStyle: string;
  screens: DetailPageScreenPlan[];
  userModifications?: string;
  confirmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  projectId: string;
  ownerId: string;
  status: AgentRunStatus;
  currentStep: number;
  totalSteps: number;
  plan: DetailPagePlan | null;
  planVersion: number;
  planGeneration?: {
    transport: 'gemini_native' | 'openai_responses';
    model: string;
    reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    responseId?: string;
    previousResponseId?: string;
    responseStatus?: 'completed' | 'incomplete' | 'failed' | 'in_progress' | 'queued' | 'cancelled';
    incompleteReason?: string;
    continuationRequired?: boolean;
    usage?: Record<string, unknown> | null;
  };
  dna?: ProductVisualDNA;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ================= Phase 4: Image Generation Task & Rendering Queue (G0-2 Core Domain Types) =================
export type RenderBatchStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'partial_failed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RenderTaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export interface RenderBatch {
  id: string;
  workspaceId: string;
  conversationId: string;
  planId: string;
  planVersion: number;
  screenCount: 9;
  status: RenderBatchStatus;
  requestedModel: string;
  requestedProvider: string;
  concurrency: number;
  estimatedMaxCalls: number;
  actualCalls: number;
  billableCalls: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  tasks?: RenderTask[];
}

export interface RenderTask {
  id: string;
  batchId: string;
  screenIndex: number;
  screenSnapshot: DetailPageScreenPlan;
  promptSnapshot: string;
  promptHash?: string;
  aspectRatio: string;
  resolution: string;
  expectedSize: string;
  status: RenderTaskStatus;
  attempt: number;
  idempotencyKey: string;
  providerRequestId?: string;
  assetId?: string;
  errorCode?: string;
  errorMessage?: string;
  actualWidth?: number;
  actualHeight?: number;
  billable?: boolean;
  estimatedCostUsd?: number;
  resultImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageBillingRecord {
  taskId: string;
  batchId: string;
  provider: string;
  model: string;
  attemptedCalls: number;
  billableCalls: number;
  pricingSource: string;
  unitPrice?: number;
  estimatedCostUsd?: number;
  currency: 'USD';
  recordedAt: string;
}

export type DetailPageTaskStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface DetailPageRenderTask {
  id: string;
  agentRunId: string;
  projectId: string;
  screenIndex: number;
  screenTitle: string;
  coreSellingPoint: string;
  prompt: string;
  aspectRatio: string;
  lockedRules: string[];
  referenceImageUrl?: string | null;
  status: DetailPageTaskStatus;
  resultImageUrl?: string | null;
  retryCount: number;
  errorMessage?: string | null;
  costTokens?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DetailPageTaskBatch {
  agentRunId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  tasks: DetailPageRenderTask[];
}

// ================= Phase 5: Long Image Stitching, Typography & Export =================
export interface DetailPageCanvasConfig {
  widthPx: number; // 750, 800, 1200
  showBrandHeader: boolean;
  showFooterGuarantee: boolean;
  showSellingPointOverlay: boolean;
  watermarkText?: string;
  themeColor: string; // '#f59e0b', '#000000', '#1c1917'
  screenSpacingPx: number;
}

export interface DetailPageSliceAsset {
  screenIndex: number;
  title: string;
  sliceImageUrl: string;
  width: number;
  height: number;
  aspectRatio?: string;
  version?: number;
  sourceTaskId?: string;
  providerRequestId?: string;
}

export interface DetailPageExportResult {
  runId: string;
  longImageUrl: string;
  totalHeightPx: number;
  slices: DetailPageSliceAsset[];
  config: DetailPageCanvasConfig;
  exportedAt: string;
}
