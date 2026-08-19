import { ApiProviderConfig } from './providerConfig';

export type AgentReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type AgentResponseStatus =
  | 'completed'
  | 'incomplete'
  | 'failed'
  | 'in_progress'
  | 'queued'
  | 'cancelled';

export interface ResponsesJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
}

export interface AgentResponsesPayloadInput {
  model: string;
  input: string;
  instructions: string;
  reasoningEffort: AgentReasoningEffort;
  previousResponseId?: string;
  maxOutputTokens?: number;
  schema?: ResponsesJsonSchema;
  metadata?: Record<string, string>;
}

export interface NormalizedAgentResponse {
  id: string;
  model: string;
  status: AgentResponseStatus;
  outputText: string;
  refusal?: string;
  incompleteReason?: 'max_output_tokens' | 'content_filter' | string;
  usage?: Record<string, unknown> | null;
  raw: Record<string, any>;
}

export class AgentResponsesError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    public readonly upstreamRequestId?: string
  ) {
    super(message);
    this.name = 'AgentResponsesError';
  }
}

const RESPONSE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ALLOWED_EFFORTS = new Set<AgentReasoningEffort>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh'
]);

export function parseAgentReasoningEffort(value: unknown): AgentReasoningEffort {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'medium';
  if (!ALLOWED_EFFORTS.has(normalized as AgentReasoningEffort)) {
    throw new AgentResponsesError(
      'reasoningEffort 必须为 none、minimal、low、medium、high 或 xhigh。',
      'INVALID_REASONING_EFFORT',
      400,
      false
    );
  }
  return normalized as AgentReasoningEffort;
}

export function assertSafeAgentModel(value: unknown, fallback = 'gpt-5.6-sol'): string {
  const model = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (!MODEL_ID_PATTERN.test(model)) {
    throw new AgentResponsesError('Agent 模型 ID 格式无效。', 'INVALID_MODEL_ID', 400, false);
  }
  return model;
}

export function assertSafePreviousResponseId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !RESPONSE_ID_PATTERN.test(value)) {
    throw new AgentResponsesError(
      'previousResponseId 格式无效。',
      'INVALID_PREVIOUS_RESPONSE_ID',
      400,
      false
    );
  }
  return value;
}

export function buildResponsesEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AgentResponsesError('Provider Base URL 无效。', 'INVALID_PROVIDER_URL', 500, false);
  }
  if (url.protocol !== 'https:') {
    throw new AgentResponsesError('Responses Provider 必须使用 HTTPS。', 'INSECURE_PROVIDER_URL', 500, false);
  }
  if (url.username || url.password) {
    throw new AgentResponsesError('Provider URL 不得包含内嵌凭据。', 'INVALID_PROVIDER_URL', 500, false);
  }

  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  if (/\/responses$/i.test(path)) {
    url.pathname = path;
  } else if (/\/v1(?:beta|alpha)?$/i.test(path)) {
    url.pathname = path.replace(/\/v1(?:beta|alpha)?$/i, '/v1/responses');
  } else {
    url.pathname = `${path}/v1/responses`.replace(/\/{2,}/g, '/');
  }
  return url.toString();
}

export function buildAgentResponsesPayload(input: AgentResponsesPayloadInput): Record<string, unknown> {
  const model = assertSafeAgentModel(input.model);
  const previousResponseId = assertSafePreviousResponseId(input.previousResponseId);
  const reasoningEffort = parseAgentReasoningEffort(input.reasoningEffort);
  if (!input.input.trim()) {
    throw new AgentResponsesError('Responses input 不能为空。', 'EMPTY_AGENT_INPUT', 400, false);
  }
  if (!input.instructions.trim()) {
    throw new AgentResponsesError('Responses instructions 不能为空。', 'EMPTY_AGENT_INSTRUCTIONS', 500, false);
  }

  const payload: Record<string, unknown> = {
    model,
    input: input.input,
    // Responses API does not inherit instructions through previous_response_id.
    instructions: input.instructions,
    store: true,
    reasoning: { effort: reasoningEffort },
    max_output_tokens: input.maxOutputTokens ?? 12000
  };

  if (previousResponseId) payload.previous_response_id = previousResponseId;
  if (input.metadata && Object.keys(input.metadata).length > 0) payload.metadata = input.metadata;
  if (input.schema) {
    payload.text = {
      format: {
        type: 'json_schema',
        name: input.schema.name,
        description: input.schema.description,
        strict: true,
        schema: input.schema.schema
      }
    };
  }
  return payload;
}

function extractOutputText(raw: Record<string, any>): { text: string; refusal?: string } {
  if (typeof raw.output_text === 'string' && raw.output_text.trim()) {
    return { text: raw.output_text.trim() };
  }

  const textParts: string[] = [];
  let refusal: string | undefined;
  for (const item of Array.isArray(raw.output) ? raw.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        textParts.push(content.text);
      } else if (content?.type === 'refusal' && typeof content.refusal === 'string') {
        refusal = content.refusal;
      }
    }
  }
  return { text: textParts.join('').trim(), refusal };
}

export function normalizeAgentResponse(rawValue: unknown): NormalizedAgentResponse {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, any> : {};
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!id) {
    throw new AgentResponsesError('上游 Responses 响应缺少 id。', 'INVALID_PROVIDER_RESPONSE', 502, true);
  }

  const allowedStatuses = new Set<AgentResponseStatus>([
    'completed', 'incomplete', 'failed', 'in_progress', 'queued', 'cancelled'
  ]);
  const status = allowedStatuses.has(raw.status) ? raw.status as AgentResponseStatus : 'failed';
  const extracted = extractOutputText(raw);
  return {
    id,
    model: typeof raw.model === 'string' ? raw.model : '',
    status,
    outputText: extracted.text,
    refusal: extracted.refusal,
    incompleteReason: typeof raw.incomplete_details?.reason === 'string'
      ? raw.incomplete_details.reason
      : undefined,
    usage: raw.usage && typeof raw.usage === 'object' ? raw.usage : null,
    raw
  };
}

export function isContinuableIncompleteReason(reason: string | undefined): boolean {
  return reason === 'max_output_tokens';
}

export async function createAgentResponse(
  config: ApiProviderConfig,
  input: AgentResponsesPayloadInput,
  fetchImpl: typeof fetch = fetch
): Promise<NormalizedAgentResponse> {
  if (config.provider === 'google') {
    throw new AgentResponsesError(
      'Google Native Provider 不支持 OpenAI Responses transport。',
      'MODEL_CAPABILITY_UNSUPPORTED',
      400,
      false
    );
  }
  if (!config.apiKey) {
    throw new AgentResponsesError('Provider API Key 未配置。', 'PROVIDER_NOT_CONFIGURED', 500, false);
  }

  const endpoint = buildResponsesEndpoint(config.baseUrl);
  const payload = buildAgentResponsesPayload(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360000);
  let response: globalThis.Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError';
    throw new AgentResponsesError(
      timedOut ? 'Responses Provider 请求超时。' : 'Responses Provider 网络请求失败。',
      timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR',
      502,
      true
    );
  } finally {
    clearTimeout(timeout);
  }

  const requestId = response.headers.get('x-request-id') || undefined;
  const rawText = await response.text();
  let raw: any = {};
  try {
    raw = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new AgentResponsesError(
      'Responses Provider 返回了非 JSON 响应。',
      'INVALID_PROVIDER_RESPONSE',
      502,
      response.status >= 500,
      requestId
    );
  }

  if (!response.ok) {
    const message = raw?.error?.message || raw?.message || `Responses Provider HTTP ${response.status}`;
    throw new AgentResponsesError(
      message,
      raw?.error?.code || 'PROVIDER_ERROR',
      response.status >= 500 ? 502 : response.status,
      response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
      requestId
    );
  }
  return normalizeAgentResponse(raw);
}
