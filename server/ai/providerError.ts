import { ModelRegistryError } from './modelRegistry';

export type ProviderErrorCategory =
  | 'invalid_request'
  | 'invalid_image_input'
  | 'authentication'
  | 'permission_denied'
  | 'model_not_found'
  | 'capability_unsupported'
  | 'payload_too_large'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_unavailable'
  | 'invalid_upstream_response'
  | 'internal_error';

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly category: ProviderErrorCategory,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    public readonly provider?: string,
    public readonly model?: string,
    public readonly upstreamStatus?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function providerErrorFromStatus(
  status: number,
  message: string,
  provider?: string,
  model?: string
): ProviderError {
  if (status === 400) return new ProviderError(message, 'invalid_request', 400, false, provider, model, status);
  if (status === 401) return new ProviderError(message, 'authentication', 502, false, provider, model, status);
  if (status === 403) return new ProviderError(message, 'permission_denied', 502, false, provider, model, status);
  if (status === 404) return new ProviderError(message, 'model_not_found', 502, false, provider, model, status);
  if (status === 413) return new ProviderError(message, 'payload_too_large', 413, false, provider, model, status);
  if (status === 429) return new ProviderError(message, 'rate_limited', 429, true, provider, model, status);
  if (status >= 500) return new ProviderError(message, 'upstream_unavailable', 502, true, provider, model, status);
  return new ProviderError(message, 'invalid_upstream_response', 502, false, provider, model, status);
}

export function normalizeProviderError(
  error: unknown,
  context: { provider?: string; model?: string } = {}
): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof ModelRegistryError) {
    return new ProviderError(
      error.message,
      error.code === 'MODEL_NOT_REGISTERED' ? 'model_not_found' : 'capability_unsupported',
      400,
      false,
      context.provider,
      error.requestedModel
    );
  }
  const candidate = error as any;
  if (typeof candidate?.statusCode === 'number' && candidate.statusCode >= 400 && candidate.statusCode < 600) {
    const cat: ProviderErrorCategory =
      candidate.statusCode === 404 ? 'model_not_found' :
      candidate.statusCode === 401 ? 'authentication' :
      candidate.statusCode === 403 ? 'permission_denied' : 'invalid_request';
    return new ProviderError(
      candidate.message || '请求处理失败。',
      cat,
      candidate.statusCode,
      false,
      context.provider,
      context.model
    );
  }
  if (candidate?.name === 'AbortError' || String(candidate?.message || '').toLowerCase().includes('timeout')) {
    return new ProviderError(
      candidate?.message || '上游请求超时。',
      'timeout',
      504,
      true,
      context.provider,
      context.model
    );
  }
  return new ProviderError(
    candidate?.message || 'AI Provider 请求失败。',
    'internal_error',
    500,
    false,
    context.provider,
    context.model
  );
}

export function serializeProviderError(error: unknown, requestId?: string) {
  const normalized = normalizeProviderError(error);
  return {
    error: {
      code: normalized.category.toUpperCase(),
      category: normalized.category,
      message: normalized.message,
      retryable: normalized.retryable,
      provider: normalized.provider,
      model: normalized.model,
      upstreamStatus: normalized.upstreamStatus,
      requestId
    }
  };
}
