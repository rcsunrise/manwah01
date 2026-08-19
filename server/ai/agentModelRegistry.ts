import { AgentReasoningEffort, AgentResponsesError, assertSafeAgentModel } from './agentResponses';
import { ProviderName } from './providerConfig';

export type AgentTransport = 'gemini_native' | 'openai_responses';

export interface AgentModelCapability {
  id: string;
  displayName: string;
  upstreamModel: string;
  providerGroup?: string;
  aliases: string[];
  transport: AgentTransport;
  providers: ProviderName[];
  structuredOutput: boolean;
  previousResponseId: boolean;
  reasoningEfforts: AgentReasoningEffort[];
  capabilities: {
    displayName: string;
    chatCompletions: boolean | 'pending_verification';
    responses: boolean | 'pending_verification';
    verificationStatus: 'verified' | 'pending_verification';
    providerGroup: string;
  };
  billing?: {
    billingSource: 'vectorengine_internal_reference';
    billingMode: 'blended_total_tokens';
    usdPerMillionTotalTokens: number;
    currency: string;
    unit: string;
    internalReferencePrice: number;
  };
}

export interface AgentModelResolutionResult {
  requestedModel: string;
  resolvedModel: string;
  resolutionType: 'canonical_id' | 'canonical_alias';
  model: AgentModelCapability;
}

export const AGENT_MODEL_REGISTRY: AgentModelCapability[] = [
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    upstreamModel: 'gemini-2.5-flash',
    providerGroup: 'google_default',
    aliases: ['google/gemini-2.5-flash'],
    transport: 'gemini_native',
    providers: ['google', 'routerhub', 'vectorengine'],
    structuredOutput: true,
    previousResponseId: false,
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high'],
    capabilities: {
      displayName: 'Gemini 2.5 Flash',
      chatCompletions: true,
      responses: false,
      verificationStatus: 'verified',
      providerGroup: 'google_default'
    }
  },
  {
    id: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    upstreamModel: 'gpt-5.6-sol',
    providerGroup: 'Codex专属',
    aliases: ['gpt-5.6', 'openai/gpt-5.6', 'openai/gpt-5.6-sol'],
    transport: 'openai_responses',
    providers: ['routerhub', 'vectorengine'],
    structuredOutput: true,
    previousResponseId: true,
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    capabilities: {
      displayName: 'GPT-5.6 Sol',
      chatCompletions: true,
      responses: true,
      verificationStatus: 'verified',
      providerGroup: 'Codex专属'
    },
    billing: {
      billingSource: 'vectorengine_internal_reference',
      billingMode: 'blended_total_tokens',
      usdPerMillionTotalTokens: 4,
      currency: 'USD',
      unit: 'per_1m_tokens',
      internalReferencePrice: 4
    }
  },
  {
    id: 'gpt-5.6-terra',
    displayName: 'GPT-5.6 Terra',
    upstreamModel: 'gpt-5.6-terra',
    providerGroup: 'Codex专属',
    aliases: ['openai/gpt-5.6-terra'],
    transport: 'openai_responses',
    providers: ['routerhub', 'vectorengine'],
    structuredOutput: true,
    previousResponseId: false,
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    capabilities: {
      displayName: 'GPT-5.6 Terra',
      chatCompletions: 'pending_verification',
      responses: 'pending_verification',
      verificationStatus: 'pending_verification',
      providerGroup: 'Codex专属'
    }
  },
  {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    upstreamModel: 'gpt-5.6-luna',
    providerGroup: 'Codex专属',
    aliases: ['openai/gpt-5.6-luna'],
    transport: 'openai_responses',
    providers: ['routerhub', 'vectorengine'],
    structuredOutput: true,
    previousResponseId: false,
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    capabilities: {
      displayName: 'GPT-5.6 Luna',
      chatCompletions: 'pending_verification',
      responses: 'pending_verification',
      verificationStatus: 'pending_verification',
      providerGroup: 'Codex专属'
    }
  },
  {
    id: 'gpt-5.5',
    displayName: 'GPT-5.5',
    upstreamModel: 'gpt-5.5',
    providerGroup: 'current_verified_group',
    aliases: ['openai/gpt-5.5'],
    transport: 'openai_responses',
    providers: ['routerhub', 'vectorengine'],
    structuredOutput: true,
    previousResponseId: true,
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    capabilities: {
      displayName: 'GPT-5.5',
      chatCompletions: true,
      responses: true,
      verificationStatus: 'verified',
      providerGroup: 'current_verified_group'
    },
    billing: {
      billingSource: 'vectorengine_internal_reference',
      billingMode: 'blended_total_tokens',
      usdPerMillionTotalTokens: 4,
      currency: 'USD',
      unit: 'per_1m_tokens',
      internalReferencePrice: 4
    }
  }
];

export function resolveAgentModelDetailed(value: unknown): AgentModelResolutionResult {
  const raw = typeof value === 'string' ? value.trim() : (value ? String(value).trim() : '');
  const target = raw || 'gpt-5.6-sol';

  // 1. Exact ID match
  const canonical = AGENT_MODEL_REGISTRY.find(e => e.id === target);
  if (canonical) {
    return {
      requestedModel: target,
      resolvedModel: canonical.id,
      resolutionType: 'canonical_id',
      model: canonical
    };
  }

  // 2. Alias or upstream match
  const aliasMatch = AGENT_MODEL_REGISTRY.find(
    e => e.upstreamModel === target || e.aliases.includes(target)
  );
  if (aliasMatch) {
    return {
      requestedModel: target,
      resolvedModel: aliasMatch.id,
      resolutionType: 'canonical_alias',
      model: aliasMatch
    };
  }

  // 3. Unknown model -> AGENT_MODEL_UNSUPPORTED
  throw new AgentResponsesError(
    `未注册或不支持的 Agent 模型：${target}`,
    'AGENT_MODEL_UNSUPPORTED',
    400,
    false
  );
}

export function resolveAgentModel(value: unknown, fallback = 'gpt-5.6-sol'): AgentModelCapability {
  const target = (value === undefined || value === null || value === '') ? fallback : value;
  return resolveAgentModelDetailed(target).model;
}

export function assertAgentModelCompatibility(
  model: AgentModelCapability,
  provider: ProviderName,
  reasoningEffort: AgentReasoningEffort,
  hasPreviousResponseId: boolean
): void {
  if (model.capabilities.verificationStatus === 'pending_verification') {
    throw new AgentResponsesError(
      `Agent 模型 ${model.displayName} 尚未获取真实 HTTP 200 验证，暂不可用于生产请求。`,
      'AGENT_MODEL_UNVERIFIED',
      400,
      false
    );
  }
  if (!model.providers.includes(provider)) {
    throw new AgentResponsesError(
      `Agent 模型 ${model.id} 不支持 Provider ${provider}。`,
      'MODEL_CAPABILITY_UNSUPPORTED',
      400,
      false
    );
  }
  if (!model.reasoningEfforts.includes(reasoningEffort)) {
    throw new AgentResponsesError(
      `Agent 模型 ${model.id} 不支持思考等级 ${reasoningEffort}。`,
      'MODEL_CAPABILITY_UNSUPPORTED',
      400,
      false
    );
  }
  if (hasPreviousResponseId && !model.previousResponseId) {
    throw new AgentResponsesError(
      `Agent 模型 ${model.id} 不支持 previous_response_id。`,
      'MODEL_CAPABILITY_UNSUPPORTED',
      400,
      false
    );
  }
}
