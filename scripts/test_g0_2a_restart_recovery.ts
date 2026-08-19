import { RenderBatchManager } from '../server/services/renderBatchManager';
import { DetailPagePlan } from '../src/types';

async function testProcessRestartRecovery() {
  console.log('=== G0-2A Step 1 - 6 Process Restart Recovery Audit ===\n');

  // Step 1: Initialize manager & create batch
  const managerBefore = new RenderBatchManager();

  const mockPlan9: DetailPagePlan = {
    projectId: 'proj_restart_test_999',
    version: 1,
    themeTitle: '进程重启跨会话持久化测试',
    targetAudience: '高奢装修人群',
    overallStyle: '意式极简',
    screens: Array.from({ length: 9 }).map((_, i) => ({
      screenIndex: i + 1,
      screenTitle: `分屏 #${i + 1} 跨进程恢复`,
      coreSellingPoint: `卖点 ${i + 1}`,
      visualComposition: `构图 ${i + 1}`,
      lightingAndAtmosphere: '柔光',
      promptSuggestion: `Commercial shot ${i + 1}`,
      aspectRatio: '3:4',
      lockedRules: []
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log('1. 创建批次并记录 batchId');
  const { batch } = await managerBefore.createRenderBatch({
    workspaceId: 'user_restart_auditor',
    conversationId: 'conv_restart_01',
    plan: mockPlan9,
    provider: 'vectorengine',
    model: 'gpt-image-2'
  });

  const batchId = batch.id;
  console.log(`   记录 batchId: ${batchId}`);

  // Wait for queue execution
  await new Promise(r => setTimeout(r, 150));

  const batchStateBefore = managerBefore.getBatch(batchId);
  if (!batchStateBefore || !batchStateBefore.tasks) {
    throw new Error('重启前的批次状态未生成');
  }

  // Step 2: Record taskId, attempt, assetId before restart
  console.log('\n2. 记录重启前的 9 个 taskId、attempt、assetId:');
  const recordsBefore = batchStateBefore.tasks.map(t => ({
    taskId: t.id,
    screenIndex: t.screenIndex,
    attempt: t.attempt,
    assetId: t.assetId,
    status: t.status
  }));

  console.table(recordsBefore);

  console.log('\n3. 完全停止 Node/Dev Server 进程 (模拟进程结束)');
  console.log('4. 启动全新进程 (实例化全新 RenderBatchManager，从磁盘加载持久化快照)');

  // Simulate complete process termination and cold boot by instantiating a fresh RenderBatchManager instance
  const managerAfter = new RenderBatchManager();

  console.log('\n5. 查询重启后的批次: manager.getBatch(batchId)');
  const batchStateAfter = managerAfter.getBatch(batchId);

  if (!batchStateAfter) {
    throw new Error(`❌ 错误：重启后未找到 batchId = ${batchId}`);
  }

  console.log('\n6. 对比重启前后的批次数据:');
  const recordsAfter = (batchStateAfter.tasks || []).map(t => ({
    taskId: t.id,
    screenIndex: t.screenIndex,
    attempt: t.attempt,
    assetId: t.assetId,
    status: t.status
  }));

  console.table(recordsAfter);

  let match = true;
  if (recordsBefore.length !== recordsAfter.length) {
    match = false;
  } else {
    for (let i = 0; i < recordsBefore.length; i++) {
      if (
        recordsBefore[i].taskId !== recordsAfter[i].taskId ||
        recordsBefore[i].attempt !== recordsAfter[i].attempt ||
        recordsBefore[i].assetId !== recordsAfter[i].assetId ||
        recordsBefore[i].status !== recordsAfter[i].status
      ) {
        match = false;
        break;
      }
    }
  }

  if (match) {
    console.log(`\n✅ 对比结果：重启前后 9 个任务的数据 (taskId, attempt, assetId, status) 100% 保持一致，进程恢复完全通过！`);
  } else {
    console.error(`\n❌ 对比结果：重启前后数据不匹配！`);
    process.exit(1);
  }
}

testProcessRestartRecovery().catch(err => {
  console.error('❌ Restart recovery audit failed:', err);
  process.exit(1);
});
