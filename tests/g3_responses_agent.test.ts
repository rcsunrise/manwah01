import { describe, expect, it, vi } from 'vitest';
import {
  AgentResponsesError,
  assertSafePreviousResponseId,
  buildAgentResponsesPayload,
  buildResponsesEndpoint,
  createAgentResponse,
  isContinuableIncompleteReason,
  normalizeAgentResponse,
  parseAgentReasoningEffort
} from '../server/ai/agentResponses';
import {
  DETAIL_PLAN_INSTRUCTIONS,
  DETAIL_PLAN_JSON_SCHEMA,
  parseStructuredDetailPlan
} from '../server/ai/detailPlanSchema';
import { assertAgentModelCompatibility, resolveAgentModel } from '../server/ai/agentModelRegistry';

const vectorConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://api.vectorengine.example/v1',
  deptId: 'dept-1',
  provider: 'vectorengine' as const,
  source: 'department' as const
};

function validPlan() {
  return {
    themeTitle: '云境舒适客厅',
    targetAudience: '重视舒适与品质的家庭用户',
    overallStyle: '明亮、现代、克制',
    screens: Array.from({ length: 9 }, (_, index) => ({
      screenIndex: index + 1,
      screenTitle: `第${index + 1}屏`,
      coreSellingPoint: '核心卖点',
      visualComposition: '中景构图',
      lightingAndAtmosphere: '自然柔光',
      promptSuggestion: 'product photography prompt',
      aspectRatio: '3:4',
      lockedRules: ['保持产品结构']
    }))
  };
}

describe('G3 Responses agent protocol', () => {
  it('normalizes Responses endpoints without retaining beta paths or query credentials', () => {
    expect(buildResponsesEndpoint('https://api.example.com/v1beta?key=secret')).toBe(
      'https://api.example.com/v1/responses'
    );
    expect(buildResponsesEndpoint('https://api.example.com/custom')).toBe(
      'https://api.example.com/custom/v1/responses'
    );
    expect(() => buildResponsesEndpoint('http://api.example.com/v1')).toThrow(/HTTPS/);
    expect(() => buildResponsesEndpoint('https://user:pass@api.example.com/v1')).toThrow(/凭据/);
  });

  it('builds a stateful structured payload and always repeats instructions', () => {
    const payload = buildAgentResponsesPayload({
      model: 'gpt-5.6',
      input: '继续生成完整计划',
      instructions: DETAIL_PLAN_INSTRUCTIONS,
      reasoningEffort: 'high',
      previousResponseId: 'resp_previous_123',
      schema: {
        name: 'detail_page_nine_screen_plan',
        schema: DETAIL_PLAN_JSON_SCHEMA as unknown as Record<string, unknown>
      }
    });
    expect(payload.previous_response_id).toBe('resp_previous_123');
    expect(payload.instructions).toBe(DETAIL_PLAN_INSTRUCTIONS);
    expect(payload.reasoning).toEqual({ effort: 'high' });
    expect(payload.store).toBe(true);
    expect((payload.text as any).format).toMatchObject({
      type: 'json_schema',
      strict: true,
      name: 'detail_page_nine_screen_plan'
    });
  });

  it('rejects malformed continuation IDs and unsupported reasoning levels', () => {
    expect(assertSafePreviousResponseId('resp_valid-1')).toBe('resp_valid-1');
    expect(() => assertSafePreviousResponseId('resp bad\nheader')).toThrow(/格式无效/);
    expect(parseAgentReasoningEffort(undefined)).toBe('medium');
    expect(() => parseAgentReasoningEffort('extreme')).toThrow(/reasoningEffort/);
  });

  it('uses an explicit Agent model registry instead of fuzzy model-name routing', () => {
    const responsesModel = resolveAgentModel('openai/gpt-5.6');
    expect(responsesModel.id).toBe('gpt-5.6-sol');
    expect(responsesModel.transport).toBe('openai_responses');
    expect(() => resolveAgentModel('gpt-made-up')).toThrow(/未注册/);
    expect(() => assertAgentModelCompatibility(responsesModel, 'google', 'medium', false))
      .toThrow(/不支持 Provider/);
    expect(() => assertAgentModelCompatibility(resolveAgentModel('gemini-2.5-flash'), 'google', 'medium', true))
      .toThrow(/previous_response_id/);
  });

  it('normalizes completed, incomplete and refusal output items', () => {
    const completed = normalizeAgentResponse({
      id: 'resp_1',
      model: 'gpt-5.6',
      status: 'completed',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(validPlan()) }]
      }]
    });
    expect(completed.outputText).toContain('云境舒适客厅');

    const incomplete = normalizeAgentResponse({
      id: 'resp_2',
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: []
    });
    expect(incomplete.incompleteReason).toBe('max_output_tokens');
    expect(isContinuableIncompleteReason(incomplete.incompleteReason)).toBe(true);
    expect(isContinuableIncompleteReason('content_filter')).toBe(false);

    const refused = normalizeAgentResponse({
      id: 'resp_3',
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'cannot comply' }] }]
    });
    expect(refused.refusal).toBe('cannot comply');
  });

  it('sends the JSON payload to /v1/responses and preserves request state', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.previous_response_id).toBe('resp_previous');
      expect(body.instructions).toBe(DETAIL_PLAN_INSTRUCTIONS);
      return new Response(JSON.stringify({
        id: 'resp_next',
        model: 'gpt-5.6',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
        usage: { total_tokens: 32000 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await createAgentResponse(vectorConfig, {
      model: 'gpt-5.6',
      input: '生成计划',
      instructions: DETAIL_PLAN_INSTRUCTIONS,
      reasoningEffort: 'medium',
      previousResponseId: 'resp_previous'
    }, fetchMock as typeof fetch);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vectorengine.example/v1/responses',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.status).toBe('incomplete');
    expect(result.id).toBe('resp_next');
  });

  it('blocks Responses transport on Google Native providers', async () => {
    await expect(createAgentResponse({
      ...vectorConfig,
      provider: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
    }, {
      model: 'gpt-5.6',
      input: '生成计划',
      instructions: DETAIL_PLAN_INSTRUCTIONS,
      reasoningEffort: 'medium'
    }, vi.fn() as unknown as typeof fetch)).rejects.toMatchObject({
      code: 'MODEL_CAPABILITY_UNSUPPORTED',
      retryable: false
    } satisfies Partial<AgentResponsesError>);
  });

  it('requires exactly nine unique, complete screens', () => {
    const parsed = parseStructuredDetailPlan(JSON.stringify(validPlan()));
    expect(parsed.screens).toHaveLength(9);
    const duplicate = validPlan();
    duplicate.screens[8].screenIndex = 8;
    expect(() => parseStructuredDetailPlan(JSON.stringify(duplicate))).toThrow(/不重复/);
    const short = validPlan();
    short.screens.pop();
    expect(() => parseStructuredDetailPlan(JSON.stringify(short))).toThrow(/恰好包含 9/);
  });
});
