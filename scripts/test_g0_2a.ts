import { renderBatchManager } from '../server/services/renderBatchManager';
import { DetailPagePlan, RenderTask } from '../src/types';

async function runTests() {
  console.log('=== G0-2A Automated Verification Test Suite ===\n');

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

  // 1. Create mock DetailPagePlan with 9 screens
  const mockPlan9: DetailPagePlan = {
    projectId: 'proj_test_123',
    version: 1,
    themeTitle: '测试意式极简家具 9 屏策划',
    targetAudience: '都市新中产',
    overallStyle: '极简影棚风',
    screens: Array.from({ length: 9 }).map((_, i) => ({
      screenIndex: i + 1,
      screenTitle: `分屏 #${i + 1} 视觉卖点`,
      coreSellingPoint: `核心卖点 ${i + 1}`,
      visualComposition: `三分法构图 ${i + 1}`,
      lightingAndAtmosphere: '柔和无影聚光灯',
      promptSuggestion: `Modern minimalistic sofa shot ${i + 1}`,
      aspectRatio: i % 3 === 0 ? '1:1' : i % 3 === 1 ? '4:5' : '16:9',
      lockedRules: ['保持真皮材质纹理一致']
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Test 1: Legal State Transitions & Batch Creation
  console.log('\n[Suite 1] Batch Creation & Legal State Transitions');
  const { batch: batch1, reusedTaskCount: reused1 } = await renderBatchManager.createRenderBatch({
    workspaceId: 'user_test_owner',
    conversationId: 'conv_123',
    plan: mockPlan9,
    provider: 'vectorengine',
    model: 'gpt-image-2',
    confirmPaidCalls: false
  });

  assert(batch1.tasks?.length === 9, 'Batch created with 9 screen tasks');
  assert(reused1 === 0, 'First batch creation reused 0 tasks');

  // Wait briefly for background execution
  await new Promise(r => setTimeout(r, 150));

  const fetched1 = renderBatchManager.getBatch(batch1.id);
  assert(fetched1?.status === 'completed', 'Batch transitioned legally from queued -> running -> completed');

  // Test 2: Illegal State Transitions
  console.log('\n[Suite 2] Illegal State Transitions');
  try {
    renderBatchManager.validateTaskStatusTransition('pending', 'succeeded');
    assert(false, 'Illegal transition pending -> succeeded should be blocked');
  } catch (e: any) {
    assert(e.errorCode === 'INVALID_TASK_TRANSITION', 'Blocked illegal transition pending -> succeeded');
  }

  // Test 3: Idempotency & Reuse
  console.log('\n[Suite 3] Idempotency & Deduplication');
  const { batch: batch2, reusedTaskCount: reused2 } = await renderBatchManager.createRenderBatch({
    workspaceId: 'user_test_owner',
    conversationId: 'conv_123',
    plan: mockPlan9,
    provider: 'vectorengine',
    model: 'gpt-image-2',
    confirmPaidCalls: false
  });
  assert(reused2 === 9, 'Identical plan submission reuses all 9 succeeded tasks without calling provider');

  // Test 4: Single Task Retry & Attempt History
  console.log('\n[Suite 4] Single Task Retry & Attempt History');
  const taskToRetry = batch1.tasks![0];
  const retriedTask = await renderBatchManager.retryTask(taskToRetry.id, 'Updated prompt for retry');
  assert(retriedTask.attempt === 2, 'Task attempt counter incremented to 2');
  assert(retriedTask.status === 'succeeded', 'Retried task status is succeeded');

  // Test 5: Refresh Recovery
  console.log('\n[Suite 5] Refresh Recovery');
  const recoveredBatch = renderBatchManager.getBatch(batch1.id);
  assert(recoveredBatch !== null && recoveredBatch.tasks?.length === 9, 'Batch status & tasks fully recovered from batchId');

  // Test 6: Aspect Ratios Validation
  console.log('\n[Suite 6] Aspect Ratio Mapping');
  const t1 = recoveredBatch?.tasks?.find(t => t.aspectRatio === '1:1');
  const t2 = recoveredBatch?.tasks?.find(t => t.aspectRatio === '4:5');
  const t3 = recoveredBatch?.tasks?.find(t => t.aspectRatio === '16:9');
  assert(!!t1 && t1.actualWidth === 1365 && t1.actualHeight === 1365, 'Aspect ratio 1:1 mapped to 1365x1365');
  assert(!!t2 && t2.actualWidth === 1092 && t2.actualHeight === 1365, 'Aspect ratio 4:5 mapped to 1092x1365');
  assert(!!t3 && t3.actualWidth === 1365 && t3.actualHeight === 768, 'Aspect ratio 16:9 mapped to 1365x768');

  // Test 7: Batch Cancel
  console.log('\n[Suite 7] Batch Cancellation');
  const { batch: cancelBatch } = await renderBatchManager.createRenderBatch({
    workspaceId: 'user_cancel_owner',
    conversationId: 'conv_cancel',
    plan: mockPlan9,
    provider: 'vectorengine',
    model: 'gpt-image-2'
  });
  const cancelled = renderBatchManager.cancelBatch(cancelBatch.id);
  assert(cancelled.status === 'cancelled', 'Batch cancelled successfully');

  // Summary
  console.log(`\n=============================================`);
  console.log(`testCommand=npx tsx scripts/test_g0_2a.ts`);
  console.log(`testCount=${testCount}`);
  console.log(`passed=${passed}`);
  console.log(`failed=${failed}`);
  console.log(`=============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ G0-2A Test Failed:', err);
  process.exit(1);
});
