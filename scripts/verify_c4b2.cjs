const http = require('http');

const baseUrl = 'http://127.0.0.1:3000';
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer demo-token-123'
};

async function runC4B2Verification() {
  console.log('=== C4B-2 真实运行与完整验收逻辑 ===\n');

  const testProjectId = `proj_c4b2_${Date.now()}`;
  const testCanvasId = `canvas_c4b2_${Date.now()}`;
  const scene1Key = 'scene-01';
  const scene2Key = 'scene-02';

  // -------------------------------------------------------------------------
  // Case 1: 创建唯一的 Copy SKU (Scene 01)
  // -------------------------------------------------------------------------
  console.log('[Case 1] 创建 Copy SKU (Scene 01)...');
  const createSkuRes = await fetch(`${baseUrl}/api/copy-skus`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId: testProjectId,
      canvasId: testCanvasId,
      sceneKey: scene1Key,
      name: 'Scene 01 首屏营销文案'
    })
  });
  const sku1Json = await createSkuRes.json();
  if (!sku1Json.success || !sku1Json.copySku?.id) {
    throw new Error(`[Case 1 失败] 创建 SKU 1 响应异常: ${JSON.stringify(sku1Json)}`);
  }
  const sku1 = sku1Json.copySku;
  console.log(`  ✓ 成功创建 Copy SKU 1: ID=${sku1.id}, Code=${sku1.sku_code}, Storage=${sku1Json.storageMedium || 'ok'}`);

  // -------------------------------------------------------------------------
  // Case 2: 首次 AI 生成文案，创建 COPY-V001
  // -------------------------------------------------------------------------
  console.log('\n[Case 2] 首次 AI 生成文案，创建 COPY-V001...');
  const genV1Res = await fetch(`${baseUrl}/api/copy/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId: testProjectId,
      canvasId: testCanvasId,
      sceneKey: scene1Key,
      sceneTitle: '头层真皮奢享包覆屏',
      coreSellingPoint: '甄选意大利进口头层牛皮, 8档无级电动舒适靠背',
      productDnaVersionId: 'dna_v_101',
      assetVersionId: 'asset_v_101'
    })
  });
  const genV1Json = await genV1Res.json();
  if (!genV1Json.success || !genV1Json.currentVersion) {
    throw new Error(`[Case 2 失败] 生成 COPY-V001 异常: ${JSON.stringify(genV1Json)}`);
  }
  const v1 = genV1Json.currentVersion;
  console.log(`  ✓ 成功生成 COPY-V001: ID=${v1.id}, Code=${v1.version_code}, Parent=${v1.parent_version_id}`);
  console.log(`  ✓ 绑定的 DNA Version: ${v1.product_dna_version_id}, Asset Version: ${v1.asset_version_id}`);
  if (v1.version_code !== 'COPY-V001') throw new Error(`预期首个版本编码为 COPY-V001，实际为 ${v1.version_code}`);
  if (v1.parent_version_id !== null) throw new Error(`预期首个版本 parent_version_id 为 null，实际为 ${v1.parent_version_id}`);

  // -------------------------------------------------------------------------
  // Case 3: 人工编辑，保存为新版本 COPY-V002
  // -------------------------------------------------------------------------
  console.log('\n[Case 3] 人工编辑文案，保存为 COPY-V002...');
  const manualContent = {
    eyebrow: 'MANWAH LUXURY · LIMITED',
    headline: '头层真皮包裹 · 尊享云端坐感 (人工微调版)',
    subheadline: '110°-160°无级电动调节，沉浸式放松体验',
    body: '在忙碌的工作之余回归温馨家园。敏华重磅推出现代真皮沙发，甄选头层牛皮，触感细腻柔软。',
    sellingPoints: ['头层真皮触感', '8档电动调节', '高弹海绵包覆'],
    featureLabels: ['意式经典', '整机质保'],
    specs: [{ label: '材质', value: '头层牛皮 + 落叶松木' }],
    cta: '立即开启奢享体验',
    disclaimer: '*数据来源于敏华实验室研发测试'
  };

  const saveV2Res = await fetch(`${baseUrl}/api/copy-skus/${sku1.id}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parentVersionId: v1.id,
      productDnaVersionId: 'dna_v_101',
      assetVersionId: 'asset_v_101',
      contentJson: manualContent,
      sourceType: 'manual_edit'
    })
  });
  const saveV2Json = await saveV2Res.json();
  if (!saveV2Json.success || !saveV2Json.version) {
    throw new Error(`[Case 3 失败] 保存 COPY-V002 异常: ${JSON.stringify(saveV2Json)}`);
  }
  const v2 = saveV2Json.version;
  console.log(`  ✓ 成功创建 COPY-V002: ID=${v2.id}, Code=${v2.version_code}, Parent=${v2.parent_version_id}, Source=${v2.source_type}`);
  if (v2.version_code !== 'COPY-V002') throw new Error(`预期第二个版本编码为 COPY-V002，实际为 ${v2.version_code}`);
  if (v2.parent_version_id !== v1.id) throw new Error(`预期 COPY-V002 parent_version_id 为 ${v1.id}，实际为 ${v2.parent_version_id}`);

  // -------------------------------------------------------------------------
  // Case 4: 验证历史版本不可变性 (拒绝 PUT/PATCH/DELETE) 与 contentHash 计算
  // -------------------------------------------------------------------------
  console.log('\n[Case 4] 验证 contentHash 生成与历史版本不可变性 (拒绝 PUT/PATCH/DELETE)...');

  // Verify contentHash format (64-char hex)
  if (!v1.content_hash || !/^[a-f0-9]{64}$/.test(v1.content_hash)) {
    throw new Error(`[Case 4 失败] v1.content_hash 格式不合规: ${v1.content_hash}`);
  }
  console.log(`  ✓ v1 contentHash 合规 (64位 SHA-256): ${v1.content_hash}`);

  if (!v2.content_hash || !/^[a-f0-9]{64}$/.test(v2.content_hash)) {
    throw new Error(`[Case 4 失败] v2.content_hash 格式不合规: ${v2.content_hash}`);
  }
  console.log(`  ✓ v2 contentHash 合规 (64位 SHA-256): ${v2.content_hash}`);

  if (v1.content_hash === v2.content_hash) {
    throw new Error(`[Case 4 失败] v1 与 v2 内容不同但 contentHash 相同!`);
  }
  console.log(`  ✓ 内容变化导致 contentHash 正确更新`);

  // Test PATCH 403
  const patchRes = await fetch(`${baseUrl}/api/copy-versions/${v1.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ content_json: { headline: '篡改历史 headline' } })
  });
  if (patchRes.status !== 403) {
    throw new Error(`[Case 4 失败] 预期 PATCH 被拒绝 (403)，实际 HTTP 状态码: ${patchRes.status}`);
  }
  const patchJson = await patchRes.json();
  console.log(`  ✓ HTTP 403 成功拒绝 PATCH 篡改: Code=${patchJson.error?.code}, Msg=${patchJson.error?.message}`);

  // Test PUT 403
  const putRes = await fetch(`${baseUrl}/api/copy-versions/${v1.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ content_json: { headline: 'PUT 篡改历史' } })
  });
  if (putRes.status !== 403) {
    throw new Error(`[Case 4 失败] 预期 PUT 被拒绝 (403)，实际 HTTP 状态码: ${putRes.status}`);
  }
  console.log(`  ✓ HTTP 403 成功拒绝 PUT 篡改`);

  // Test DELETE 403
  const deleteRes = await fetch(`${baseUrl}/api/copy-versions/${v1.id}`, {
    method: 'DELETE',
    headers
  });
  if (deleteRes.status !== 403) {
    throw new Error(`[Case 4 失败] 预期 DELETE 被拒绝 (403)，实际 HTTP 状态码: ${deleteRes.status}`);
  }
  const deleteJson = await deleteRes.json();
  console.log(`  ✓ HTTP 403 成功拒绝 DELETE 历史版本: Code=${deleteJson.error?.code}`);

  // Test non-existent version 404
  const notFoundRes = await fetch(`${baseUrl}/api/copy-versions/ver_copy_non_existent_99999`, {
    method: 'DELETE',
    headers
  });
  if (notFoundRes.status !== 404) {
    throw new Error(`[Case 4 失败] 预期不存在的版本返回 404，实际: ${notFoundRes.status}`);
  }
  console.log(`  ✓ 不存在的版本按规范返回 HTTP 404`);

  // 验证 V1 详情依然保持原始状态
  const getV1Res = await fetch(`${baseUrl}/api/copy-versions/${v1.id}`, { headers });
  const getV1Json = await getV1Res.json();
  if (getV1Json.version.content_json.headline === '篡改历史 headline') {
    throw new Error('[Case 4 失败] 历史版本被非法修改!');
  }
  console.log(`  ✓ 确认 COPY-V001 历史正文未被任何更新侵蚀`);

  // -------------------------------------------------------------------------
  // Case 5: 场景隔绝 (Scene 01 vs Scene 02)
  // -------------------------------------------------------------------------
  console.log('\n[Case 5] 验证多场景数据隔离 (Scene 01 vs Scene 02)...');
  const genScene2Res = await fetch(`${baseUrl}/api/copy/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId: testProjectId,
      canvasId: testCanvasId,
      sceneKey: scene2Key,
      sceneTitle: '灵感美学材质特写屏',
      coreSellingPoint: '精柔双缝线工艺，透气毛孔呼吸层'
    })
  });
  const genScene2Json = await genScene2Res.json();
  const sku2 = genScene2Json.copySku;
  const v1Scene2 = genScene2Json.currentVersion;
  console.log(`  ✓ Scene 02 独立的 Copy SKU ID: ${sku2.id}`);
  console.log(`  ✓ Scene 02 独立的 COPY-V001 ID: ${v1Scene2.id}`);
  if (sku1.id === sku2.id) throw new Error('Scene 01 与 Scene 02 错误共享了同一个 Copy SKU');

  // -------------------------------------------------------------------------
  // Case 6: 切换当前激活版本 (select-version)
  // -------------------------------------------------------------------------
  console.log('\n[Case 6] 切换 Scene 01 的当前激活版本回 COPY-V001...');
  const selectRes = await fetch(`${baseUrl}/api/copy-skus/${sku1.id}/select-version`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ versionId: v1.id })
  });
  const selectJson = await selectRes.json();
  if (!selectJson.success || selectJson.copySku.current_version_id !== v1.id) {
    throw new Error('[Case 6 失败] 切换激活版本失败');
  }
  console.log(`  ✓ 成功切换 Scene 01 当前版本指针至 COPY-V001 (${v1.id})`);

  // -------------------------------------------------------------------------
  // Case 7: 严禁排版样式字段 (Forbidden Layout Fields Reject)
  // -------------------------------------------------------------------------
  console.log('\n[Case 7] 验证禁止包含排版/样式属性 (Layout attributes rejection)...');
  const invalidLayoutContent = {
    eyebrow: 'TEST',
    headline: 'TEST HEADLINE',
    fontSize: '24px', // 禁用字段
    color: '#FF0000', // 禁用字段
    position: 'absolute' // 禁用字段
  };

  const invalidRes = await fetch(`${baseUrl}/api/copy-skus/${sku1.id}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contentJson: invalidLayoutContent
    })
  });
  if (invalidRes.status !== 400) {
    throw new Error(`[Case 7 失败] 预期包含排版字段被拒绝 (400)，实际 HTTP 状态码: ${invalidRes.status}`);
  }
  const invalidJson = await invalidRes.json();
  console.log(`  ✓ HTTP 400 成功拒绝包含排版属性的 JSON: ${invalidJson.error?.message || invalidJson.error}`);

  // -------------------------------------------------------------------------
  // Case 8: DNA/Asset 版本历史绑定不可变性
  // -------------------------------------------------------------------------
  console.log('\n[Case 8] 验证 DNA/Asset 绑定的历史不可变性...');
  const saveV3Res = await fetch(`${baseUrl}/api/copy-skus/${sku1.id}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parentVersionId: v2.id,
      productDnaVersionId: 'dna_v_102_NEW',
      assetVersionId: 'asset_v_102_NEW',
      contentJson: manualContent,
      sourceType: 'manual_edit'
    })
  });
  const saveV3Json = await saveV3Res.json();
  const v3 = saveV3Json.version;
  console.log(`  ✓ COPY-V003 绑定了最新的 DNA Version: ${v3.product_dna_version_id}`);

  // 重新查验 V1 绑定的 DNA/Asset 依然是 V101
  const checkV1Res = await fetch(`${baseUrl}/api/copy-versions/${v1.id}`, { headers });
  const checkV1Data = (await checkV1Res.json()).version;
  if (checkV1Data.product_dna_version_id !== 'dna_v_101') {
    throw new Error(`[Case 8 失败] COPY-V001 的 DNA 绑定被非法破坏: ${checkV1Data.product_dna_version_id}`);
  }
  console.log(`  ✓ 确认 COPY-V001 的 DNA/Asset 绑定位保持原初值 (dna_v_101) 不变`);

  // -------------------------------------------------------------------------
  // Case 9: 画布 Scene 别名路由读取验证
  // -------------------------------------------------------------------------
  console.log('\n[Case 9] 验证 /api/canvases/:canvasId/scenes/:sceneId/copy 别名路由...');
  const aliasRes = await fetch(`${baseUrl}/api/canvases/${testCanvasId}/scenes/${scene1Key}/copy`, { headers });
  const aliasJson = await aliasRes.json();
  if (!aliasJson.success || !aliasJson.copySku) {
    throw new Error('[Case 9 失败] 画布场景别名路由读取失败');
  }
  console.log(`  ✓ 成功通过场景别名路由读取 Copy SKU: ID=${aliasJson.copySku.id}, CurrentVer=${aliasJson.currentVersion?.id}`);

  // -------------------------------------------------------------------------
  // Case 10: 并发版本创建与锁/唯一约束验证
  // -------------------------------------------------------------------------
  console.log('\n[Case 10] 验证并发版本创建锁与版本号无重复...');
  const concurrentCount = 5;
  const promises = [];
  for (let i = 0; i < concurrentCount; i++) {
    promises.push(
      fetch(`${baseUrl}/api/copy-skus/${sku1.id}/versions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parentVersionId: v3.id,
          contentJson: {
            ...manualContent,
            headline: `并发测试 Headline ${i + 1}`
          },
          sourceType: 'manual_edit'
        })
      }).then(r => r.json())
    );
  }

  const concurrentResults = await Promise.all(promises);
  const versionCodes = new Set();
  for (const res of concurrentResults) {
    if (!res.success || !res.version) {
      throw new Error(`[Case 10 失败] 并发请求失败: ${JSON.stringify(res)}`);
    }
    if (versionCodes.has(res.version.version_code)) {
      throw new Error(`[Case 10 失败] 检测到重复的版本号: ${res.version.version_code}`);
    }
    versionCodes.add(res.version.version_code);
  }
  console.log(`  ✓ 成功处理 ${concurrentCount} 个并发版本请求，生成无重复版本号:`, Array.from(versionCodes).join(', '));

  // -------------------------------------------------------------------------
  // Case 11: 跨 SKU 版本选择防护 (非法归属)
  // -------------------------------------------------------------------------
  console.log('\n[Case 11] 验证跨 SKU 归属阻断 (尝试将 Scene 02 的版本设置为 Scene 01 的 currentVersion)...');
  const crossSkuSelectRes = await fetch(`${baseUrl}/api/copy-skus/${sku1.id}/select-version`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ versionId: v1Scene2.id })
  });
  if (crossSkuSelectRes.status !== 400) {
    throw new Error(`[Case 11 失败] 预期跨 SKU 归属错误 (400)，实际状态码: ${crossSkuSelectRes.status}`);
  }
  const crossSkuJson = await crossSkuSelectRes.json();
  console.log(`  ✓ 成功阻断跨 SKU 版本指向: ${crossSkuJson.error?.message || crossSkuJson.error}`);

  console.log('\n==================================================');
  console.log('✅ 所有 C4B-2 Copy SKU 与结构化文案版本控制真实验证通过!');
  console.log('==================================================\n');
}

runC4B2Verification().catch(err => {
  console.error('\n❌ C4B-2 验证出现错误:', err.message || err);
  process.exit(1);
});
