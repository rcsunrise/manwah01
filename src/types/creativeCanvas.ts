import { ProductVisualDNA } from '../types';

export interface CanvasWorkspaceInfo {
  id: string;
  name: string;
  updatedAt: string;
  status: 'active' | 'archived';
}

export interface AgentMessage {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  timestamp: string;
  status?: 'pending' | 'streaming' | 'completed' | 'failed';
  error_code?: string;
  conversation_id?: string;
}

export interface WelcomeNodeData extends Record<string, unknown> {
  title: string;
  description: string;
  status: string;
}

export interface ProductImageNodeData extends Record<string, unknown> {
  imageUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: string;
  uploadedAt?: string;
  dimensions?: { width: number; height: number };
  status?: 'idle' | 'uploading' | 'analyzing' | 'completed' | 'error';
  errorMsg?: string;
  onReanalyze?: () => void;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
}

export interface ProductDnaNodeData extends Record<string, unknown> {
  dna?: ProductVisualDNA | null;
  status: 'analyzing' | 'completed' | 'error';
  errorMsg?: string;
  analyzedAt?: string;
  productDnaId?: string;
  dnaCode?: string;
  productDnaVersionId?: string;
  versionCode?: string;
  versions?: Array<{ id: string; version_code: string; version_number: number; created_at?: string }>;
  onViewFullDna?: () => void;
  onSelectDnaVersion?: (versionId: string) => void;
}

export interface SceneQueueItem {
  sceneId: string;
  sceneNumber: number;
  status: 'pending' | 'queued' | 'generating' | 'success' | 'failed' | 'paused' | 'cancelled';
  taskId?: string;
  requestId?: string;
  attempt: number;
  error?: {
    code?: string;
    httpStatus?: number;
    message: string;
  };
}

export interface GenerationBatch {
  batchId: string;
  sceneIds: string[];
  status: 'idle' | 'running' | 'paused' | 'completed' | 'partial_failed' | 'cancelled';
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface NineGridPlanNodeData extends Record<string, unknown> {
  runId: string;
  themeTitle: string;
  targetAudience: string;
  overallStyle: string;
  coreCreative: string;
  colorDirection: string;
  sceneDirection: string;
  screenCount: number;
  status: 'planning' | 'completed' | 'error';
  errorMsg?: string;
  generatedAt: string;
  onViewFullPlan?: () => void;
  onRegenerateAll?: () => void;
  onGenerateMissingImages?: () => void;
  batchProgress?: {
    completed: number;
    total: number;
    status: 'idle' | 'running' | 'paused' | 'completed' | 'partial_failed' | 'cancelled';
  };
}

export interface ScenePlanNodeData extends Record<string, unknown> {
  runId: string;
  screenIndex: number;
  screenTitle: string;
  coreSellingPoint: string;
  sceneDescription: string;
  visualComposition: string;
  lightingAndAtmosphere: string;
  productFocus: string;
  copySuggestion: string;
  promptSuggestion: string;
  aspectRatio: string;
  status: 'planning' | 'completed' | 'error';
  errorMsg?: string;
  assetSkuId?: string;
  assetSkuCode?: string;
  assetVersionId?: string;
  assetVersionCode?: string;
  parentVersionId?: string | null;
  productDnaVersionId?: string;
  productDnaVersionCode?: string;
  onViewDetail?: () => void;
  onReplanScene?: () => void;
  onGenerateImage?: () => void;
}

export interface ImageGenerationNodeData extends Record<string, unknown> {
  sceneIndex: number;
  screenTitle: string;
  model?: string;
  provider?: string;
  aspectRatio?: string;
  referenceCount?: number;
  status: 'queued' | 'preparing' | 'generating' | 'completed' | 'error' | 'cancelled';
  startTime?: string;
  taskId?: string;
  errorMsg?: string;
  onCancel?: () => void;
}

export interface GeneratedImageNodeData extends Record<string, unknown> {
  sceneIndex: number;
  screenTitle: string;
  imageUrl: string;
  dimensions?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceAspectRatio?: string;
  checksum?: string;
  aspectRatio?: string;
  model?: string;
  provider?: string;
  generatedAt?: string;
  version?: number;
  assetSkuId?: string;
  assetSkuCode?: string;
  assetVersionId?: string;
  assetVersionCode?: string;
  parentVersionId?: string | null;
  productDnaVersionId?: string;
  productDnaVersionCode?: string;
  reviewStatus: 'pendingReview' | 'approved' | 'rejected';
  reviewFeedback?: string;
  prompt: string;
  negativePrompt?: string;
  onViewDetail?: () => void;
  onRegenerate?: () => void;
  onApprove?: () => void;
  onReject?: (feedback: string) => void;
  onOpenAssetVersions?: () => void;
}

export type CreativeCanvasNodeType =
  | 'welcome'
  | 'productImage'
  | 'productDna'
  | 'nineGridPlan'
  | 'scenePlan'
  | 'imageGeneration'
  | 'generatedImage'
  | 'welcomeNode'
  | 'productImageNode'
  | 'productDnaNode'
  | 'nineGridPlanNode'
  | 'scenePlanNode'
  | 'imageGenerationNode'
  | 'generatedImageNode';

export type SaveStatus = 
  | 'saving' 
  | 'saved' 
  | 'error' 
  | 'unsynced' 
  | 'cloud_saved' 
  | 'cloud_loading'
  | 'local_saved' 
  | 'memory_only' 
  | 'save_failed' 
  | 'restore_failed'
  | 'version_conflict'
  | 'offline_pending'
  | 'syncing_assets';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface SerializableNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, any>;
}

export interface SerializableEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  style?: Record<string, any>;
}

export interface CanvasRecord {
  id?: string;
  canvasId?: string;
  projectId?: string;
  project_id?: string;
  canvasName?: string;
  canvas_name?: string;
  canvasStatus?: 'draft' | 'active' | 'archived';
  nodesDraft?: SerializableNode[];
  nodes_draft?: SerializableNode[];
  edgesDraft?: SerializableEdge[];
  edges_draft?: SerializableEdge[];
  viewportDraft?: ViewportState;
  viewport_draft?: ViewportState;
  currentRevision?: number;
  current_revision?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  lastSavedAt?: string;
  last_saved_at?: string;
  createdBy?: string;
  created_by?: string;
}

export interface CanvasRevisionRecord {
  id?: string;
  revisionId?: string;
  canvasId?: string;
  canvas_id?: string;
  revisionNumber?: number;
  revision_number?: number;
  versionName?: string;
  version_name?: string;
  changeSummary?: string;
  change_summary?: string;
  versionTag?: string;
  version_tag?: string;
  nodesSnapshot?: SerializableNode[];
  nodes_snapshot?: SerializableNode[];
  edgesSnapshot?: SerializableEdge[];
  edges_snapshot?: SerializableEdge[];
  viewportSnapshot?: ViewportState;
  viewport_snapshot?: ViewportState;
  createdAt?: string;
  created_at?: string;
  createdBy?: string;
  created_by?: string;
}

export interface StructuredCopyContent {
  eyebrow: string;
  headline: string;
  subheadline: string;
  body: string;
  sellingPoints: string[];
  featureLabels: string[];
  specs: Array<{ label: string; value: string }>;
  cta: string;
  disclaimer: string;
}

export interface CopySkuRecord {
  id: string;
  user_id?: string;
  project_id: string;
  canvas_id: string;
  scene_key: string;
  sku_code: string;
  name: string;
  status: 'active' | 'archived';
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CopyVersionRecord {
  id: string;
  copy_sku_id: string;
  version_number: number;
  version_code: string;
  parent_version_id: string | null;
  source_type: 'ai_generated' | 'manual_edit';
  product_dna_version_id?: string | null;
  asset_version_id?: string | null;
  content_json: StructuredCopyContent;
  content_hash?: string | null;
  contentHash?: string | null;
  generation_provider?: string | null;
  generation_model?: string | null;
  prompt_snapshot?: string | null;
  status: 'active' | 'archived';
  created_by?: string;
  created_at: string;
  isCurrent?: boolean;
}

// C4B-3: Typography Spec Data Types
export type TypographySemanticRole =
  | 'eyebrow'
  | 'headline'
  | 'subheadline'
  | 'body'
  | 'selling_point'
  | 'feature_label'
  | 'spec'
  | 'cta'
  | 'disclaimer';

export type TypographyOverflowPolicy =
  | 'truncate'
  | 'shrink'
  | 'hide_low_priority'
  | 'manual_review';

export interface TypographySlotSpec {
  slotKey: string;
  semanticRole: TypographySemanticRole;
  sourceField: string;
  content: string;
  enabled: boolean;
  priority: number; // 1 = highest priority
  maxCharacters: number;
  maxLines: number;
  overflowPolicy: TypographyOverflowPolicy;
}

export interface TypographySpecV1 {
  id: string;
  userId?: string;
  user_id?: string;
  projectId: string;
  project_id?: string;
  canvasId: string;
  canvas_id?: string;
  sceneKey: string;
  scene_key?: string;
  copySkuId: string;
  copy_sku_id?: string;
  copyVersionId: string;
  copy_version_id?: string;
  productDnaVersionId?: string | null;
  product_dna_version_id?: string | null;
  assetVersionId?: string | null;
  asset_version_id?: string | null;
  slots: TypographySlotSpec[];
  status: 'valid' | 'overflow_warning' | 'manual_review' | 'archived';
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

// ==============================================================================
// G0-1: Agent Continuous Dialogue & Conversation Persistence Types
// ==============================================================================
export interface AgentContextSnapshot {
  projectId: string;
  canvasId: string;
  activeSceneKey?: string;
  selectedNodeIds?: string[];
  productDnaVersionId?: string | null;
  assetVersionId?: string | null;
  copyVersionId?: string | null;
  typographySpecId?: string | null;
}

export interface AgentConversationRecord {
  id: string;
  user_id: string;
  project_id: string;
  canvas_id: string;
  title: string | null;
  status: 'active' | 'archived';
  provider: string;
  model: string;
  provider_conversation_id?: string | null;
  previous_response_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentChatMessageRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: {
    text: string;
    [key: string]: any;
  };
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  provider_response_id?: string | null;
  parent_message_id?: string | null;
  context_snapshot?: AgentContextSnapshot | null;
  error_code?: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentErrorCode =
  | 'AGENT_AUTH_ERROR'
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_FORBIDDEN'
  | 'CANVAS_FORBIDDEN'
  | 'INVALID_AGENT_CONTEXT'
  | 'MESSAGE_TOO_LONG'
  | 'PROVIDER_CONFIGURATION_ERROR'
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_PROTOCOL_ERROR'
  | 'STREAM_INTERRUPTED'
  | 'MESSAGE_PERSISTENCE_ERROR'
  | 'CANVAS_PERSISTENCE_UNAVAILABLE'
  | 'API_ROUTE_NOT_FOUND'
  | 'AGENT_API_NON_JSON_RESPONSE'
  | 'UNKNOWN_AGENT_ERROR';


