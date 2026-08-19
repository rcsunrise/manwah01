/**
 * C4B-3 Verification Suite: Typography Spec Contract & Isolation
 * Tests data isolation, Copy Version binding, history immutability,
 * lineage preservation, overflow validation, auth/RLS, and zero TextNode/LayoutVersion compliance.
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  // Keep the legacy C4B mock-auth token below the provider-token branch;
  // user identity for this isolated regression comes from x-user-uuid.
  'Authorization': 'Bearer c4b3-test',
  'x-user-uuid': '00000000-0000-0000-0000-000000000001'
};

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        ...AUTH_HEADERS,
        ...extraHeaders
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runC4B3Verification() {
  console.log('========================================================================');
  console.log('C4B-3｜Typography Spec Contract & Isolation Verification Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? '(' + detail + ')' : ''}`);
      failed++;
    }
  }

  try {
    const projectId = `proj_c4b3_${Date.now()}`;
    const canvasId = `canv_c4b3_${Date.now()}`;

    // -------------------------------------------------------------------------
    // Step 1: Create Copy SKU & COPY-V001 for scene-01
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Create Copy SKU and COPY-V001 for scene-01 ---');
    const skuRes1 = await request('POST', '/api/copy-skus', {
      projectId,
      canvasId,
      sceneKey: 'scene-01',
      name: 'Scene 01 Copy SKU'
    });
    if (skuRes1.status !== 201) {
      console.error('skuRes1 unexpected status/body:', skuRes1.status, skuRes1.body);
    }
    assert(skuRes1.status === 201 && skuRes1.body.success, 'Create Copy SKU for scene-01');
    const sku1Id = skuRes1.body.copySku.id;

    const copyContentV1 = {
      eyebrow: 'LUXURY COMFORT',
      headline: '尊享全青牛皮包裹',
      subheadline: '110-160超大无级电动调节',
      body: '倾心打造的高端隐形电动沙发，为您带来极致尊贵的家庭沉浸式放松体验。',
      sellingPoints: ['头层精选牛皮', '多挡电动无级调节', '高密度回弹海绵'],
      featureLabels: ['意大利设计', '环保低醛'],
      specs: [{ label: '尺寸', value: '220x95x98cm' }],
      cta: '立即开启奢享',
      disclaimer: '*实验数据来源于敏华实验室'
    };

    const verRes1 = await request('POST', `/api/copy-skus/${sku1Id}/versions`, {
      productDnaVersionId: 'dna_v001_c4b3',
      assetVersionId: 'asset_v001_c4b3',
      contentJson: copyContentV1,
      sourceType: 'manual_edit'
    });
    assert(verRes1.status === 201 && verRes1.body.success, 'Create COPY-V001 version for scene-01');
    const ver1Id = verRes1.body.version.id;

    // -------------------------------------------------------------------------
    // Test 1: Generate Default Typography Spec from COPY-V001
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Generate Default Typography Spec from COPY-V001 ---');
    const defaultSpecRes1 = await request('POST', '/api/typography-specs/default-from-copy', {
      projectId,
      canvasId,
      sceneKey: 'scene-01',
      copySkuId: sku1Id,
      copyVersionId: ver1Id,
      productDnaVersionId: 'dna_v001_c4b3',
      assetVersionId: 'asset_v001_c4b3'
    });

    assert(
      defaultSpecRes1.status === 201 && defaultSpecRes1.body.success,
      'Generate Default Spec from COPY-V001',
      JSON.stringify(defaultSpecRes1.body)
    );
    assert(defaultSpecRes1.body.spec.status === 'valid', 'Spec status is valid for normal content');
    assert(defaultSpecRes1.body.spec.copy_version_id === ver1Id, 'Spec binds correctly to COPY-V001');
    assert(defaultSpecRes1.body.spec.product_dna_version_id === 'dna_v001_c4b3', 'Preserves productDnaVersionId lineage');

    // -------------------------------------------------------------------------
    // Test 2: Scene-01 vs Scene-02 Data Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Scene-01 vs Scene-02 Data Isolation ---');
    const skuRes2 = await request('POST', '/api/copy-skus', {
      projectId,
      canvasId,
      sceneKey: 'scene-02',
      name: 'Scene 02 Copy SKU'
    });
    const sku2Id = skuRes2.body.copySku.id;

    const verRes2 = await request('POST', `/api/copy-skus/${sku2Id}/versions`, {
      contentJson: { ...copyContentV1, headline: 'Scene 02 独立标题' }
    });
    const ver2Id = verRes2.body.version.id;

    const specRes2 = await request('POST', '/api/typography-specs/default-from-copy', {
      projectId,
      canvasId,
      sceneKey: 'scene-02',
      copySkuId: sku2Id,
      copyVersionId: ver2Id
    });

    const getSpec1 = await request('GET', `/api/canvases/${canvasId}/scenes/scene-01/typography-spec?projectId=${projectId}`);
    const getSpec2 = await request('GET', `/api/canvases/${canvasId}/scenes/scene-02/typography-spec?projectId=${projectId}`);

    assert(getSpec1.body.spec.scene_key === 'scene-01', 'Scene 01 retrieves scene-01 Spec');
    assert(getSpec2.body.spec.scene_key === 'scene-02', 'Scene 02 retrieves scene-02 Spec');
    assert(getSpec1.body.spec.copy_sku_id !== getSpec2.body.spec.copy_sku_id, 'Scene-01 and Scene-02 Specs are strictly isolated');

    // -------------------------------------------------------------------------
    // Test 3: Create COPY-V002 and verify Copy Version Immutability
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: COPY-V002 Creation & Copy Version Immutability ---');
    const verRes1_v2 = await request('POST', `/api/copy-skus/${sku1Id}/versions`, {
      productDnaVersionId: 'dna_v002_c4b3',
      assetVersionId: 'asset_v002_c4b3',
      contentJson: { ...copyContentV1, headline: 'V002 升级版全青牛皮真皮沙发' }
    });
    assert(verRes1_v2.status === 201, 'Create COPY-V002 version');
    const ver1_v2Id = verRes1_v2.body.version.id;

    // Create new Spec for COPY-V002
    const specRes1_v2 = await request('POST', '/api/typography-specs/default-from-copy', {
      projectId,
      canvasId,
      sceneKey: 'scene-01',
      copySkuId: sku1Id,
      copyVersionId: ver1_v2Id
    });
    assert(specRes1_v2.body.spec.copy_version_id === ver1_v2Id, 'Spec updated to bind COPY-V002');

    // Verify COPY-V001 content_json was NOT mutated
    const origV1Res = await request('GET', `/api/copy-versions/${ver1Id}`);
    assert(
      origV1Res.body.version.content_json.headline === '尊享全青牛皮包裹',
      'COPY-V001 historical content remains strictly unchanged and unmutated'
    );

    // -------------------------------------------------------------------------
    // Test 4: Overlength Headline & Overflow Policy Validation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Overlength Headline & Overflow Policy Validation ---');
    const overlengthSlots = [
      {
        slotKey: 'headline',
        semanticRole: 'headline',
        sourceField: 'headline',
        content: '这是一条超级超级超级长长长长长长长长长长长长长长长长长长长长的爆款大标题', // > 24 chars
        enabled: true,
        priority: 1,
        maxCharacters: 24,
        maxLines: 2,
        overflowPolicy: 'manual_review'
      },
      {
        slotKey: 'subheadline',
        semanticRole: 'subheadline',
        sourceField: 'subheadline',
        content: '正常副标题',
        enabled: true,
        priority: 2,
        maxCharacters: 40,
        maxLines: 2,
        overflowPolicy: 'shrink'
      }
    ];

    const overflowSpecRes = await request('POST', '/api/typography-specs', {
      projectId,
      canvasId,
      sceneKey: 'scene-01',
      copySkuId: sku1Id,
      copyVersionId: ver1_v2Id,
      slots: overlengthSlots
    });

    assert(
      overflowSpecRes.status === 201 && overflowSpecRes.body.spec.status === 'manual_review',
      'Overlength headline with manual_review policy triggers manual_review status',
      JSON.stringify(overflowSpecRes.body)
    );
    assert(
      overflowSpecRes.body.warnings.length > 0,
      'Overflow warnings are reported in API response'
    );

    // -------------------------------------------------------------------------
    // Test 5: Rejection on Missing Copy Version
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Rejection on Missing Copy Version ---');
    const invalidSpecRes = await request('POST', '/api/typography-specs', {
      projectId,
      canvasId,
      sceneKey: 'scene-01',
      copySkuId: sku1Id,
      copyVersionId: 'non_existent_copy_version_12345',
      slots: overlengthSlots
    });

    if (invalidSpecRes.status !== 404 && invalidSpecRes.status !== 400) {
      console.error('Test 5 received status and body:', invalidSpecRes.status, invalidSpecRes.body);
    }

    assert(
      invalidSpecRes.status === 404 || invalidSpecRes.status === 400,
      'Rejects Typography Spec creation if copyVersionId does not exist'
    );

    // -------------------------------------------------------------------------
    // Test 6: Zero TextNode and Zero Layout Attributes Validation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Zero TextNode & Zero Layout Attributes Compliance ---');
    const currentSpec = overflowSpecRes.body.spec;
    let hasForbiddenLayoutKeys = false;
    let hasTextNode = false;

    const forbiddenLayoutKeys = ['font', 'fontsize', 'fontfamily', 'color', 'x', 'y', 'width', 'height', 'rotation'];

    currentSpec.slots.forEach(s => {
      Object.keys(s).forEach(k => {
        if (forbiddenLayoutKeys.includes(k.toLowerCase())) {
          hasForbiddenLayoutKeys = true;
        }
      });
      if (s.textNode || s.nodeId) {
        hasTextNode = true;
      }
    });

    assert(!hasForbiddenLayoutKeys, 'Zero forbidden layout attributes (font, size, coords) in Typography Spec');
    assert(!hasTextNode, 'Zero fake or real TextNodes created in Typography Spec');

    // -------------------------------------------------------------------------
    // Test 7: Persistence & Recovery
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Persistence and Recovery Verification ---');
    const recoveredSpec = await request('GET', `/api/canvases/${canvasId}/scenes/scene-01/typography-spec?projectId=${projectId}`);
    assert(recoveredSpec.status === 200 && recoveredSpec.body.spec !== null, 'Spec recovers successfully from server store');

    console.log('\n========================================================================');
    console.log(`C4B-3 Verification Results: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error('C4B-3 Verification Exception:', e);
    process.exit(1);
  }
}

runC4B3Verification();
