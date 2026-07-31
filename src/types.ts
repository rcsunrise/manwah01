
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
}

export type SupportedAspectRatio = '1:1' | '1:4' | '1:8' | '2:3' | '3:2' | '3:4' | '4:1' | '4:3' | '4:5' | '5:4' | '8:1' | '9:16' | '16:9' | '21:9'; 
export type UIAspRatioOption = SupportedAspectRatio | 'Auto' | 'Custom'; 

export type Resolution = '1K' | '2K' | '4K' | '512px';
export type ModelType = 'gemini-3-pro' | 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-3-flash' | 'gemini-3.1-flash-lite-preview' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview' | 'google/gemini-3-pro-image-preview' | 'gemini-3.1-flash-image' | 'gemini-3-pro-image' | 'google/gemini-3-pro-image' | 'gemini-2.5-flash-image' | 'openai/gpt-image-1' | 'openai/gpt-image-1.5' | 'openai/gpt-image-2' | 'routerhub/flux' | 'routerhub/midjourney';

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