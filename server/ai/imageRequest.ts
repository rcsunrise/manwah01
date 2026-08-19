import { ProviderError } from './providerError';

export type GenerationIntent = 'text_to_image' | 'image_edit';

export type ImageRole =
  | 'primary_product'
  | 'scene_reference'
  | 'material_reference'
  | 'person_reference'
  | 'composition_reference'
  | 'style_reference';

export interface ImageReferenceInput {
  data?: string;
  base64Data?: string;
  url?: string;
  mimeType?: string;
  role?: ImageRole;
  referenceAssetId?: string;
  order?: number;
}

export interface NormalizedImageReference {
  source: string;
  declaredMimeType?: string;
  role: ImageRole;
  referenceAssetId?: string;
  order: number;
}

const IMAGE_ROLES = new Set<ImageRole>([
  'primary_product',
  'scene_reference',
  'material_reference',
  'person_reference',
  'composition_reference',
  'style_reference'
]);

export const IMAGE_ROLE_LABELS: Record<ImageRole, string> = {
  primary_product: '主产品参考',
  scene_reference: '场景参考',
  material_reference: '材质参考',
  person_reference: '人物参考',
  composition_reference: '构图参考',
  style_reference: '风格参考'
};

export function parseGenerationIntent(value: unknown, imageCount: number): GenerationIntent {
  if (value === undefined || value === null || value === '') {
    return imageCount > 0 ? 'image_edit' : 'text_to_image';
  }
  if (value !== 'text_to_image' && value !== 'image_edit') {
    throw new ProviderError('generationIntent 必须为 text_to_image 或 image_edit。', 'invalid_request', 400, false);
  }
  if (value === 'text_to_image' && imageCount > 0) {
    throw new ProviderError('text_to_image 请求不得携带参考图；请显式使用 image_edit。', 'invalid_request', 400, false);
  }
  if (value === 'image_edit' && imageCount === 0) {
    throw new ProviderError('image_edit 请求必须携带至少一张参考图。', 'invalid_image_input', 400, false);
  }
  return value;
}

export function normalizeImageReferences(rawImages: unknown): NormalizedImageReference[] {
  const images = Array.isArray(rawImages) ? rawImages : [];
  return images.map((raw, index) => {
    const value = typeof raw === 'string' ? { data: raw } : (raw || {}) as ImageReferenceInput;
    const source = String(value.data || value.base64Data || value.url || '').trim();
    if (!source) {
      throw new ProviderError(`第 ${index + 1} 张参考图缺少 data、base64Data 或 url。`, 'invalid_image_input', 400, false);
    }
    const role = value.role || (index === 0 ? 'primary_product' : 'style_reference');
    if (!IMAGE_ROLES.has(role)) {
      throw new ProviderError(`第 ${index + 1} 张参考图的 ImageRole 无效。`, 'invalid_image_input', 400, false);
    }
    const order = Number.isInteger(value.order) && Number(value.order) >= 0 ? Number(value.order) : index;
    return {
      source,
      declaredMimeType: value.mimeType,
      role,
      referenceAssetId: value.referenceAssetId,
      order
    };
  }).sort((a, b) => a.order - b.order);
}

export function buildImageRoleManifest(images: Array<Pick<NormalizedImageReference, 'role' | 'referenceAssetId'>>): string {
  if (images.length === 0) return '';
  return images.map((image, index) => {
    const asset = image.referenceAssetId ? `，资产ID=${image.referenceAssetId}` : '';
    return `图${index + 1}：${IMAGE_ROLE_LABELS[image.role]}${asset}`;
  }).join('；');
}
