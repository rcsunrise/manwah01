export interface NormalizedImage {
  mimeType: string;
  data: string;
}

export interface NormalizedImageResponse {
  success: true;
  images: NormalizedImage[];
  actualModel: string;
  provider: string;
  providerRequestId?: string;
  finishReasons?: string[];
  usage?: unknown;
  candidates: Array<{
    content: { parts: Array<{ inlineData: NormalizedImage }> };
    finishReason?: string;
  }>;
}

const isValidImage = (image: NormalizedImage) =>
  typeof image.data === 'string' && image.data.length > 100 && image.mimeType.startsWith('image/');

export function buildNormalizedImageResponse(
  images: NormalizedImage[],
  context: {
    actualModel: string;
    provider: string;
    providerRequestId?: string;
    finishReasons?: string[];
    usage?: unknown;
  }
): NormalizedImageResponse {
  const validImages = images.filter(isValidImage);
  if (validImages.length === 0) throw new Error('上游接口未返回有效图像数据。');
  return {
    success: true,
    images: validImages,
    actualModel: context.actualModel,
    provider: context.provider,
    providerRequestId: context.providerRequestId,
    finishReasons: context.finishReasons,
    usage: context.usage,
    candidates: validImages.map((image, index) => ({
      content: { parts: [{ inlineData: image }] },
      finishReason: context.finishReasons?.[index]
    }))
  };
}

export function normalizeGeminiImageResponse(
  raw: any,
  context: { actualModel: string; provider: string }
): NormalizedImageResponse {
  const images: NormalizedImage[] = [];
  const finishReasons: string[] = [];
  for (const candidate of Array.isArray(raw?.candidates) ? raw.candidates : []) {
    if (candidate?.finishReason) finishReasons.push(String(candidate.finishReason));
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      const inlineData = part?.inlineData || part?.inline_data;
      if (inlineData?.data) {
        images.push({
          mimeType: inlineData.mimeType || inlineData.mime_type || 'image/png',
          data: inlineData.data
        });
      }
    }
  }
  return buildNormalizedImageResponse(images, {
    ...context,
    providerRequestId: raw?.responseId || raw?.id,
    finishReasons,
    usage: raw?.usageMetadata || raw?.usage
  });
}

export function normalizeOpenAiImageResponse(
  raw: any,
  context: { actualModel: string; provider: string }
): NormalizedImageResponse {
  const images: NormalizedImage[] = [];
  const finishReasons: string[] = [];

  for (const item of Array.isArray(raw?.data) ? raw.data : []) {
    if (item?.b64_json) {
      images.push({
        mimeType: 'image/png',
        data: item.b64_json
      });
      if (item?.revised_prompt) {
        finishReasons.push(`revised_prompt:${item.revised_prompt.substring(0, 50)}`);
      }
    } else if (item?.url) {
      images.push({
        mimeType: 'image/png',
        data: item.url
      });
    }
  }

  return buildNormalizedImageResponse(images, {
    ...context,
    providerRequestId: raw?.created ? String(raw.created) : undefined,
    finishReasons: finishReasons.length > 0 ? finishReasons : ['STOP'],
    usage: raw?.usage
  });
}

export function hasValidImages(value: any): boolean {
  if (Array.isArray(value?.images) && value.images.some(isValidImage)) return true;
  return Array.isArray(value?.candidates) && value.candidates.some((candidate: any) =>
    Array.isArray(candidate?.content?.parts) && candidate.content.parts.some((part: any) =>
      isValidImage(part?.inlineData || part?.inline_data || { mimeType: '', data: '' })
    )
  );
}
