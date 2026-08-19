import { 
  AGENT_MODEL_REGISTRY, 
  resolveAgentModelDetailed, 
  assertAgentModelCompatibility,
  AgentModelCapability
} from '../server/ai/agentModelRegistry';
import { AgentResponsesError } from '../server/ai/agentResponses';

async function runModelRegistryP1BTests() {
  console.log('=== P1B-R 模型注册表与冲突清理专项测试 ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
      failed++;
    }
  }

  // 测试 1：别名解析与正规化 ID 识别
  console.log('--- 测试 1：别名与 Canonical ID 解析 ---');
  
  const testCases = [
    { input: 'gpt-5.6', expectedResolved: 'gpt-5.6-sol', expectedType: 'canonical_alias' },
    { input: 'openai/gpt-5.6', expectedResolved: 'gpt-5.6-sol', expectedType: 'canonical_alias' },
    { input: 'openai/gpt-5.6-sol', expectedResolved: 'gpt-5.6-sol', expectedType: 'canonical_alias' },
    { input: 'gpt-5.6-sol', expectedResolved: 'gpt-5.6-sol', expectedType: 'canonical_id' },
    { input: 'openai/gpt-5.6-terra', expectedResolved: 'gpt-5.6-terra', expectedType: 'canonical_alias' },
    { input: 'openai/gpt-5.6-luna', expectedResolved: 'gpt-5.6-luna', expectedType: 'canonical_alias' },
    { input: 'openai/gpt-5.5', expectedResolved: 'gpt-5.5', expectedType: 'canonical_alias' },
    { input: 'gpt-5.5', expectedResolved: 'gpt-5.5', expectedType: 'canonical_id' },
    { input: 'google/gemini-2.5-flash', expectedResolved: 'gemini-2.5-flash', expectedType: 'canonical_alias' }
  ];

  for (const tc of testCases) {
    try {
      const res = resolveAgentModelDetailed(tc.input);
      assert(
        res.requestedModel === tc.input &&
        res.resolvedModel === tc.expectedResolved &&
        res.resolutionType === tc.expectedType,
        `解析 ${tc.input} -> resolvedModel=${res.resolvedModel}, resolutionType=${res.resolutionType}`
      );
    } catch (e: any) {
      assert(false, `解析 ${tc.input} 意外抛出错误: ${e.message}`);
    }
  }

  // 测试 2：未知模型与被删除模型严格拦截（绝不回退至默认模型）
  console.log('\n--- 测试 2：未知/已删除模型拦截测试 (无自动回退) ---');
  const unknownInputs = ['gpt-5.6-base', 'gpt-5.6-turbo', 'unknown-model-v99', 'openai/gpt-5.6-base'];

  for (const input of unknownInputs) {
    try {
      resolveAgentModelDetailed(input);
      assert(false, `模型 ${input} 应该被拒绝，但未抛出异常`);
    } catch (e: any) {
      const isExpectedError = e instanceof AgentResponsesError && e.code === 'AGENT_MODEL_UNSUPPORTED' && e.statusCode === 400;
      assert(
        isExpectedError,
        `模型 ${input} 被拦截，抛出 AGENT_MODEL_UNSUPPORTED (code=${e.code}, status=${e.statusCode})`
      );
    }
  }

  // 测试 3：未验收模型 (pending_verification) 拦截
  console.log('\n--- 测试 3：未验收模型 (pending_verification) 拦截测试 ---');
  const terra = AGENT_MODEL_REGISTRY.find(m => m.id === 'gpt-5.6-terra')!;
  const luna = AGENT_MODEL_REGISTRY.find(m => m.id === 'gpt-5.6-luna')!;

  try {
    assertAgentModelCompatibility(terra, 'routerhub', 'medium', false);
    assert(false, 'gpt-5.6-terra 应该因为 pending_verification 被拦截');
  } catch (e: any) {
    assert(
      e.code === 'AGENT_MODEL_UNVERIFIED',
      `gpt-5.6-terra 成功拦截 (code=${e.code}, message=${e.message})`
    );
  }

  try {
    assertAgentModelCompatibility(luna, 'routerhub', 'medium', false);
    assert(false, 'gpt-5.6-luna 应该因为 pending_verification 被拦截');
  } catch (e: any) {
    assert(
      e.code === 'AGENT_MODEL_UNVERIFIED',
      `gpt-5.6-luna 成功拦截 (code=${e.code}, message=${e.message})`
    );
  }

  // 测试 4：计费口径断言
  console.log('\n--- 测试 4：计费口径断言 ---');
  const sol = AGENT_MODEL_REGISTRY.find(m => m.id === 'gpt-5.6-sol')!;
  const gpt55 = AGENT_MODEL_REGISTRY.find(m => m.id === 'gpt-5.5')!;

  assert(
    sol.billing?.billingSource === 'vectorengine_internal_reference' &&
    sol.billing?.billingMode === 'blended_total_tokens' &&
    sol.billing?.usdPerMillionTotalTokens === 4,
    'gpt-5.6-sol 计费配置符合规范 (billingSource=vectorengine_internal_reference, blended_total_tokens, $4/1M tokens)'
  );

  assert(
    gpt55.billing?.billingSource === 'vectorengine_internal_reference' &&
    gpt55.billing?.billingMode === 'blended_total_tokens' &&
    gpt55.billing?.usdPerMillionTotalTokens === 4,
    'gpt-5.5 计费配置符合规范 (billingSource=vectorengine_internal_reference, blended_total_tokens, $4/1M tokens)'
  );

  // 测试 5：注册表最终模型列表断言
  console.log('\n--- 测试 5：注册表可用模型汇总 ---');
  const modelIds = AGENT_MODEL_REGISTRY.map(m => m.id);
  assert(
    !modelIds.includes('gpt-5.6-base') && !modelIds.includes('gpt-5.6-turbo'),
    '注册表不包含 gpt-5.6-base 和 gpt-5.6-turbo'
  );
  assert(
    modelIds.includes('gpt-5.6-sol') && modelIds.includes('gpt-5.6-terra') && modelIds.includes('gpt-5.6-luna') && modelIds.includes('gpt-5.5'),
    '注册表包含完整 4 个 GPT 系列模型 (sol, terra, luna, 5.5)'
  );

  console.log(`\n=== 测试结果：PASS ${passed} / FAIL ${failed} ===`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runModelRegistryP1BTests().catch(err => {
  console.error('测试脚本运行失败:', err);
  process.exit(1);
});
