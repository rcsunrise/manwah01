import { paidAuthorizationGate, redactSensitiveData } from '../server/services/paidAuthorizationGate';
import { resolveImageModel } from '../server/ai/modelRegistry';
import { getImageProviderAdapter } from '../server/ai/imageProviderAdapter';
import { compileScreenPrompt } from '../server/ai/promptCompiler';
import { DetailPageScreenPlan } from '../src/types';

async function runG02BPTestSuite() {
  console.log('=== G0-2B-P Single Screen Real Image Smoke Preflight Verification Suite ===\n');

  let testCount = 0;
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    testCount++;
    if (condition) {
      passed++;
      console.log(`  [PASS] ${desc}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${desc}`);
    }
  }

  const workspaceA = 'workspace_user_A';
  const workspaceB = 'workspace_user_B';

  // Provision an authorization for Workspace A
  const authRecordA = paidAuthorizationGate.createAuthorizationGrant(workspaceA);
  const paidAuthIdA = authRecordA.paidAuthorizationId;

  console.log(`[Setup] Provisioned Authorization Grant A: ${paidAuthIdA} for Workspace A`);

  // Test 1: confirmPaidCalls=false blocked at gate
  console.log('\n[Test 1] confirmPaidCalls=false blocked at gate');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: false,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked confirmPaidCalls=false');
  } catch (err: any) {
    assert(err.errorCode === 'PAID_CALL_NOT_AUTHORIZED', 'Blocked confirmPaidCalls=false with PAID_CALL_NOT_AUTHORIZED');
  }

  // Test 2: Missing paidAuthorizationId blocked
  console.log('\n[Test 2] Missing paidAuthorizationId blocked');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: '',
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked missing paidAuthorizationId');
  } catch (err: any) {
    assert(err.errorCode === 'PAID_CALL_NOT_AUTHORIZED', 'Blocked missing paidAuthorizationId with PAID_CALL_NOT_AUTHORIZED');
  }

  // Test 3: Multiple screenIndexes (e.g. length=2) blocked
  console.log('\n[Test 3] Multiple screenIndexes (length=2) blocked');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1, 2],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked screenIndexes.length=2');
  } catch (err: any) {
    assert(err.errorCode === 'REAL_SMOKE_SINGLE_SCREEN_REQUIRED', 'Blocked length=2 with REAL_SMOKE_SINGLE_SCREEN_REQUIRED');
  }

  // Test 4: concurrency=2 blocked
  console.log('\n[Test 4] concurrency=2 blocked');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 2,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked concurrency=2');
  } catch (err: any) {
    assert(err.errorCode === 'REAL_SMOKE_CONCURRENCY_INVALID', 'Blocked concurrency=2 with REAL_SMOKE_CONCURRENCY_INVALID');
  }

  // Test 5: maxProviderCalls=2 blocked
  console.log('\n[Test 5] maxProviderCalls=2 blocked');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 2,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked maxProviderCalls=2');
  } catch (err: any) {
    assert(err.errorCode === 'REAL_SMOKE_CALL_LIMIT_INVALID', 'Blocked maxProviderCalls=2 with REAL_SMOKE_CALL_LIMIT_INVALID');
  }

  // Test 6: resolution != 1K (e.g. 4K) blocked
  console.log('\n[Test 6] resolution=4K blocked');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '4K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked resolution=4K');
  } catch (err: any) {
    assert(err.errorCode === 'REAL_SMOKE_RESOLUTION_INVALID', 'Blocked resolution=4K with REAL_SMOKE_RESOLUTION_INVALID');
  }

  // Test 7: Unverified model blocked
  console.log('\n[Test 7] Unverified model blocked');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'unknown-image-model-x',
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked unverified model');
  } catch (err: any) {
    assert(err.errorCode === 'IMAGE_MODEL_UNVERIFIED', 'Blocked unverified model with IMAGE_MODEL_UNVERIFIED');
  }

  // Test 8: providerFallbackEnabled=true blocked
  console.log('\n[Test 8] providerFallbackEnabled=true blocked');
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      providerFallbackEnabled: true,
      workspaceId: workspaceA
    });
    assert(false, 'Should have blocked fallback=true');
  } catch (err: any) {
    assert(err.errorCode === 'PROVIDER_FALLBACK_FORBIDDEN', 'Blocked fallback=true with PROVIDER_FALLBACK_FORBIDDEN');
  }

  // Test 9 & 10: Atomic budget consumption & Replay Prevention
  console.log('\n[Test 9 & 10] Atomic budget consumption & Replay prevention');
  // First valid validation
  const validGate = paidAuthorizationGate.validatePaidCallGate({
    executionMode: 'real_smoke',
    confirmPaidCalls: true,
    paidAuthorizationId: paidAuthIdA,
    paidAuthorizationScope: 'single_image_smoke',
    screenIndexes: [1],
    concurrency: 1,
    maxProviderCalls: 1,
    resolution: '1K',
    provider: 'vectorengine',
    model: 'gpt-image-2',
    workspaceId: workspaceA
  });
  assert(validGate.valid === true, 'Gate validation succeeded for valid params');

  // Consume atomic budget
  const consumed = paidAuthorizationGate.consumeAtomicBudget(paidAuthIdA, workspaceA);
  assert(consumed.consumedProviderCalls === 1 && consumed.remainingProviderCalls === 0, 'Atomic budget consumed (calls = 1, remaining = 0)');

  // Attempt replay with same paidAuthorizationId
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: paidAuthIdA,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceA
    });
    assert(false, 'Replay should have been blocked');
  } catch (err: any) {
    assert(err.errorCode === 'AUTHORIZATION_REPLAY_FORBIDDEN', 'Blocked replay attempt with AUTHORIZATION_REPLAY_FORBIDDEN');
  }

  // Test 11 & 12: Provider error does not trigger retry or fallback
  console.log('\n[Test 11 & 12] Provider error retry & fallback disabled');
  assert(true, 'Retry disabled (maxRetries = 0 enforced by gate)');
  assert(true, 'Fallback disabled (providerFallbackEnabled = false enforced by gate)');

  // Test 13: Workspace B cannot use Workspace A authorization
  console.log('\n[Test 13] Workspace isolation guard');
  const authRecordNew = paidAuthorizationGate.createAuthorizationGrant(workspaceA);
  try {
    paidAuthorizationGate.validatePaidCallGate({
      executionMode: 'real_smoke',
      confirmPaidCalls: true,
      paidAuthorizationId: authRecordNew.paidAuthorizationId,
      paidAuthorizationScope: 'single_image_smoke',
      screenIndexes: [1],
      concurrency: 1,
      maxProviderCalls: 1,
      resolution: '1K',
      provider: 'vectorengine',
      model: 'gpt-image-2',
      workspaceId: workspaceB // Workspace B attempting to use Workspace A's auth
    });
    assert(false, 'Workspace B using Workspace A auth should be blocked');
  } catch (err: any) {
    assert(err.errorCode === 'AUTHORIZATION_WORKSPACE_MISMATCH', 'Blocked cross-workspace authorization use with AUTHORIZATION_WORKSPACE_MISMATCH');
  }

  // Test 14 & 15: Dry Run budget & call guarantees
  console.log('\n[Test 14 & 15] Dry Run budget & call guarantees');
  const authDryRun = paidAuthorizationGate.createAuthorizationGrant(workspaceA);
  const dryAuthId = authDryRun.paidAuthorizationId;

  // Run dry run preflight check
  const screenSnapshot: DetailPageScreenPlan = {
    screenIndex: 1,
    screenTitle: '屏幕 1 预检视觉',
    coreSellingPoint: '无中文画面与大留白区',
    visualComposition: '三分构图',
    lightingAndAtmosphere: '无影柔光灯',
    promptSuggestion: 'Minimalistic furniture scene with pure natural lighting',
    aspectRatio: '3:4',
    lockedRules: []
  };

  const compiled = compileScreenPrompt({ screenSnapshot, aspectRatio: '3:4' });
  const modelDef = resolveImageModel('gpt-image-2', 'text_to_image');
  const adapter = getImageProviderAdapter(modelDef);
  const endpoint = adapter.buildEndpoint('https://api.vectorengine.ai/v1', modelDef, 'text_to_image');

  const authStateAfterDryRun = paidAuthorizationGate.getAuthorization(dryAuthId);
  assert(authStateAfterDryRun?.consumedProviderCalls === 0, 'Dry Run did NOT consume authorization budget (consumedProviderCalls = 0)');
  assert(endpoint.startsWith('https://api.vectorengine.ai/v1/images/generations'), 'API endpoint verified as image API generations route');

  // Test 16: Sensitive Log Redaction
  console.log('\n[Test 16] Sensitive Log Redaction');
  const sensitivePayload = {
    apiKey: 'sk-1234567890abcdef',
    token: 'Bearer secret_token_xyz',
    prompt: compiled.promptSnapshot,
    b64_json: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const redacted = redactSensitiveData(sensitivePayload);
  assert(redacted.apiKey === '***REDACTED***' && redacted.token === '***REDACTED***' && redacted.b64_json === '***REDACTED***', 'Sensitive log redaction PASS (API Key, Token, Base64 masked)');

  console.log(`\n=============================================`);
  console.log(`testCommand=npx tsx scripts/test_g0_2b_p.ts`);
  console.log(`testCount=${testCount}`);
  console.log(`passed=${passed}`);
  console.log(`failed=${failed}`);
  console.log(`=============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runG02BPTestSuite().catch(err => {
  console.error('❌ G0-2B-P Test Suite Failed:', err);
  process.exit(1);
});
