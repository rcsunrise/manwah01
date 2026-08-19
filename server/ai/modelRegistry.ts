import type { GenerationIntent } from './imageRequest';

export type ImageIntent = GenerationIntent;
export type ImageTransport = 'gemini_native' | 'openai_images' | 'openai_images_json_multi';

export interface ImageModelCapabilities {
  textToImage: boolean;
  imageEdit: boolean;
  multiImage: boolean;
  mask: boolean;
  maxInputImages: number;
}

export interface ImageModelDefinition {
  id: string;
  aliases: readonly string[];
  transport: ImageTransport;
  supportedProviders: readonly string[];
  capabilities: ImageModelCapabilities;
}

const geminiCapabilities: ImageModelCapabilities = {
  textToImage: true,
  imageEdit: true,
  multiImage: true,
  mask: false,
  maxInputImages: 16
};

const openAiCapabilities: ImageModelCapabilities = {
  textToImage: true,
  imageEdit: true,
  multiImage: true,
  mask: true,
  maxInputImages: 16
};

export const IMAGE_MODEL_REGISTRY: readonly ImageModelDefinition[] = [
  {
    id: 'gemini-2.5-flash-image',
    aliases: ['google/gemini-2.5-flash-image', 'gemini-2.5-flash'],
    transport: 'gemini_native',
    supportedProviders: ['google', 'routerhub', 'vectorengine'],
    capabilities: geminiCapabilities
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    aliases: ['google/gemini-3.1-flash-image-preview'],
    transport: 'gemini_native',
    supportedProviders: ['google', 'routerhub', 'vectorengine'],
    capabilities: geminiCapabilities
  },
  {
    id: 'gemini-3.1-flash-image',
    aliases: ['google/gemini-3.1-flash-image'],
    transport: 'gemini_native',
    supportedProviders: ['google', 'routerhub', 'vectorengine'],
    capabilities: geminiCapabilities
  },
  {
    id: 'gemini-3-pro-image-preview',
    aliases: ['google/gemini-3-pro-image-preview'],
    transport: 'gemini_native',
    supportedProviders: ['google', 'routerhub', 'vectorengine'],
    capabilities: geminiCapabilities
  },
  {
    id: 'gemini-3-pro-image',
    aliases: ['google/gemini-3-pro-image'],
    transport: 'gemini_native',
    supportedProviders: ['google', 'routerhub', 'vectorengine'],
    capabilities: geminiCapabilities
  },
  {
    id: 'gpt-image-2',
    aliases: ['openai/gpt-image-2'],
    transport: 'openai_images',
    supportedProviders: ['routerhub', 'vectorengine'],
    capabilities: openAiCapabilities
  },
  {
    id: 'gpt-image-2-all',
    aliases: ['openai/gpt-image-2-all'],
    transport: 'openai_images_json_multi',
    supportedProviders: ['vectorengine'],
    capabilities: { ...openAiCapabilities, textToImage: false, mask: false }
  },
  {
    id: 'gpt-image-1.5',
    aliases: ['openai/gpt-image-1.5'],
    transport: 'openai_images',
    supportedProviders: ['routerhub', 'vectorengine'],
    capabilities: openAiCapabilities
  },
  {
    id: 'gpt-image-1',
    aliases: ['openai/gpt-image-1'],
    transport: 'openai_images',
    supportedProviders: ['routerhub', 'vectorengine'],
    capabilities: openAiCapabilities
  }
] as const;

const modelIndex = new Map<string, ImageModelDefinition>();
for (const definition of IMAGE_MODEL_REGISTRY) {
  modelIndex.set(definition.id.toLowerCase(), definition);
  for (const alias of definition.aliases) modelIndex.set(alias.toLowerCase(), definition);
}

export class ModelRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: 'MODEL_NOT_REGISTERED' | 'MODEL_CAPABILITY_UNSUPPORTED',
    public readonly requestedModel: string,
    public readonly intent: ImageIntent
  ) {
    super(message);
    this.name = 'ModelRegistryError';
  }
}

export function resolveImageModel(requestedModel: string, intent: ImageIntent): ImageModelDefinition {
  const requested = String(requestedModel || '').trim();
  const definition = modelIndex.get(requested.toLowerCase());
  if (!definition) {
    throw new ModelRegistryError(
      `模型“${requested || '(empty)'}”未在图像能力注册表中启用。`,
      'MODEL_NOT_REGISTERED',
      requested,
      intent
    );
  }

  const supported = intent === 'image_edit'
    ? definition.capabilities.imageEdit
    : definition.capabilities.textToImage;
  if (!supported) {
    throw new ModelRegistryError(
      `模型“${requested}”不支持${intent === 'image_edit' ? '图像编辑' : '文生图'}。`,
      'MODEL_CAPABILITY_UNSUPPORTED',
      requested,
      intent
    );
  }
  return definition;
}

export function assertProviderModelCompatibility(
  definition: ImageModelDefinition,
  provider: string,
  intent: ImageIntent
): void {
  if (!definition.supportedProviders.includes(provider)) {
    throw new ModelRegistryError(
      `Provider“${provider}”不支持模型“${definition.id}”的当前图像调用。`,
      'MODEL_CAPABILITY_UNSUPPORTED',
      definition.id,
      intent
    );
  }
}
