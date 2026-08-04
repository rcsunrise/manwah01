const http = require('http');

const PORT = 3000;

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: body });
        }
      });
    });

    req.on('error', err => reject(err));
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runVerification() {
  console.log('=== STARTING C4A-3 PRODUCT DNA IMMUTABLE VERSIONING VERIFICATION ===\n');
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, message) {
    totalCount++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer verify_c4a3_mock_jwt_token_xyz',
    'x-user-uuid': 'user_c4a3_test_001'
  };

  const testProjectId = 'proj_c4a3_audit_888';
  const testCanvasId = 'canvas_c4a3_audit_888';
  let createdDnaId = null;
  let dnaVersion1Id = null;
  let dnaVersion2Id = null;

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated Guard on Product DNA Creation
    // -------------------------------------------------------------
    console.log('Test 1: Unauthenticated Guard on POST /api/product-dnas');
    const resNoAuth = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/product-dnas',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { projectId: testProjectId, canvasId: testCanvasId });

    assert(resNoAuth.status === 401, `Unauthenticated request returned 401 (got ${resNoAuth.status})`);

    // -------------------------------------------------------------
    // Test 2: Create Product DNA & Initial DNA-V001
    // -------------------------------------------------------------
    console.log('\nTest 2: Create Product DNA & Initial DNA-V001');
    const resCreateDna = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/product-dnas',
      method: 'POST',
      headers: authHeaders
    }, {
      projectId: testProjectId,
      canvasId: testCanvasId,
      productName: '敏华C4A-3审计特供沙发',
      productCategory: '家具/客厅沙发',
      initialSnapshot: {
        identity: {
          productName: '敏华C4A-3审计特供沙发',
          productCategory: '家具/客厅沙发',
          modelCode: 'MH-C4A3-001'
        },
        appearance: {
          primaryColor: '#C8A97E',
          secondaryColors: ['#3C2A21'],
          materials: ['头层头层牛皮', '实木脚'],
          surfaceTexture: '真皮纹理'
        },
        structure: {
          productType: 'L型沙发',
          proportionRules: ['坐高45cm'],
          structuralAnchors: ['双缝线扶手'],
          functionalParts: ['电动调控']
        },
        brandRules: {
          logoRequired: true,
          logoPosition: '右侧扶手',
          logoTreatment: '压印铭牌'
        },
        mustPreserve: ['真皮质感', '扶手缝线'],
        forbiddenChanges: ['变更为织物面料'],
        promptConstraints: ['Strict product consistency with DNA-V001']
      }
    });

    assert(resCreateDna.status === 201 || resCreateDna.status === 200, `Product DNA creation returned 201/200 (got ${resCreateDna.status})`);
    assert(resCreateDna.data?.success === true, `Response success is true`);
    assert(resCreateDna.data?.productDna?.id, `Product DNA has ID: ${resCreateDna.data?.productDna?.id}`);
    assert(resCreateDna.data?.currentVersion?.version_code === 'V001', `Initial version is V001 (got ${resCreateDna.data?.currentVersion?.version_code})`);
    assert(resCreateDna.data?.currentVersion?.checksum, `Initial version has checksum: ${resCreateDna.data?.currentVersion?.checksum}`);

    createdDnaId = resCreateDna.data?.productDna?.id;
    dnaVersion1Id = resCreateDna.data?.currentVersion?.id;

    // -------------------------------------------------------------
    // Test 3: Get Product DNA Details
    // -------------------------------------------------------------
    console.log('\nTest 3: Read Product DNA Details via GET /api/product-dnas/:dnaId');
    const resGetDna = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/product-dnas/${createdDnaId}`,
      method: 'GET',
      headers: authHeaders
    });

    assert(resGetDna.status === 200, `GET Product DNA returned 200 (got ${resGetDna.status})`);
    assert(resGetDna.data?.productDna?.id === createdDnaId, `Product DNA ID matches`);
    assert(resGetDna.data?.currentVersion?.id === dnaVersion1Id, `Current version matches V001`);

    // -------------------------------------------------------------
    // Test 4: Derive DNA-V002 Version
    // -------------------------------------------------------------
    console.log('\nTest 4: Derive DNA-V002 Version via POST /api/product-dnas/:dnaId/versions');
    const resDeriveV2 = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/product-dnas/${createdDnaId}/versions`,
      method: 'POST',
      headers: authHeaders
    }, {
      parentVersionId: dnaVersion1Id,
      dnaSnapshot: {
        identity: {
          productName: '敏华C4A-3审计特供沙发 (V002升级版)',
          productCategory: '家具/客厅沙发',
          modelCode: 'MH-C4A3-002'
        },
        appearance: {
          primaryColor: '#3C2A21',
          secondaryColors: ['#C8A97E'],
          materials: ['头层黑色牛皮', '铝合金脚'],
          surfaceTexture: '深色皮革'
        },
        structure: {
          productType: 'L型沙发',
          proportionRules: ['坐高45cm'],
          structuralAnchors: ['双缝线扶手', '隐形头枕'],
          functionalParts: ['双电控按键']
        },
        brandRules: {
          logoRequired: true,
          logoPosition: '右侧扶手',
          logoTreatment: '压印铭牌'
        },
        mustPreserve: ['真皮质感', '隐形头枕'],
        forbiddenChanges: ['变更为布艺面料'],
        promptConstraints: ['Strict product consistency with DNA-V002']
      }
    });

    assert(resDeriveV2.status === 201, `Deriving DNA version returned 201 (got ${resDeriveV2.status})`);
    assert(resDeriveV2.data?.version?.version_code === 'V002', `New version code is V002 (got ${resDeriveV2.data?.version?.version_code})`);
    assert(resDeriveV2.data?.version?.parent_version_id === dnaVersion1Id, `Parent version is V001 ID`);
    
    dnaVersion2Id = resDeriveV2.data?.version?.id;

    // -------------------------------------------------------------
    // Test 5: Switch Active DNA Version
    // -------------------------------------------------------------
    console.log('\nTest 5: Switch Active Version back to V001 via POST /api/product-dnas/:dnaId/select-version');
    const resSelectV1 = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/product-dnas/${createdDnaId}/select-version`,
      method: 'POST',
      headers: authHeaders
    }, {
      versionId: dnaVersion1Id
    });

    assert(resSelectV1.status === 200, `Select version returned 200 (got ${resSelectV1.status})`);
    assert(resSelectV1.data?.productDna?.current_version_id === dnaVersion1Id, `Current version updated back to V001`);

    // -------------------------------------------------------------
    // Test 6: Verify Product DNA Version Immutability Guard
    // -------------------------------------------------------------
    console.log('\nTest 6: Product DNA Version Immutability Guard (PUT /api/product-dna-versions/:versionId)');
    const resPutVer = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/product-dna-versions/${dnaVersion1Id}`,
      method: 'PUT',
      headers: authHeaders
    }, {
      dnaSnapshot: { forbiddenChanges: ['HACKED_SNAPSHOT'] }
    });

    assert(resPutVer.status === 403, `PUT on DNA Version returned 403 Forbidden (got ${resPutVer.status})`);
    assert(resPutVer.data?.error?.code === 'IMMUTABLE_PRODUCT_DNA_VERSION', `Error code is IMMUTABLE_PRODUCT_DNA_VERSION`);

    // -------------------------------------------------------------
    // Test 7: Bind Asset Version to Valid Product DNA Version
    // -------------------------------------------------------------
    console.log('\nTest 7: Bind Asset Version to Valid Product DNA Version');
    
    // First create a test SKU in same project/canvas
    const resCreateSku = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/asset-skus',
      method: 'POST',
      headers: authHeaders
    }, {
      projectId: testProjectId,
      canvasId: testCanvasId,
      skuName: 'C4A-3 测试场景 SKU',
      category: '场景图',
      sceneType: '客厅全景'
    });

    const testSkuId = resCreateSku.data?.sku?.id || resCreateSku.data?.sku?.sku_code;
    assert(testSkuId, `Test Asset SKU created with ID: ${testSkuId}`);

    // Create Asset Version bound to Product DNA Version V001
    const resCreateVerDna = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/asset-skus/${testSkuId}/versions`,
      method: 'POST',
      headers: authHeaders
    }, {
      productDnaVersionId: dnaVersion1Id,
      generationProvider: 'google',
      generationModel: 'gemini-2.5-flash',
      promptSnapshot: '客厅沙发场景，严格符合DNA-V001'
    });

    assert(resCreateVerDna.status === 201, `Asset version creation returned 201 (got ${resCreateVerDna.status})`);
    assert(resCreateVerDna.data?.version?.product_dna_version_id === dnaVersion1Id, `Asset version bound to productDnaVersionId: ${dnaVersion1Id}`);

    // -------------------------------------------------------------
    // Test 8: Reject Cross-Project Product DNA Version Binding
    // -------------------------------------------------------------
    console.log('\nTest 8: Reject Cross-Project Product DNA Version Binding');
    
    // Create a SKU in a DIFFERENT project
    const resCreateOtherSku = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/asset-skus',
      method: 'POST',
      headers: authHeaders
    }, {
      projectId: 'proj_other_user_999',
      canvasId: 'canvas_other_user_999',
      skuName: '跨项目 SKU',
      category: '场景图'
    });

    const otherSkuId = resCreateOtherSku.data?.sku?.id;

    const resCrossProjectBind = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/asset-skus/${otherSkuId}/versions`,
      method: 'POST',
      headers: authHeaders
    }, {
      productDnaVersionId: dnaVersion1Id, // dnaVersion1 belongs to proj_c4a3_audit_888!
      promptSnapshot: '试图跨项目引用DNA'
    });

    assert(resCrossProjectBind.status === 400 || resCrossProjectBind.status === 403, `Cross-project DNA binding rejected with 400/403 (got ${resCrossProjectBind.status})`);

    console.log('\n=============================================================');
    console.log(`SUMMARY: Passed ${passedCount} / ${totalCount} tests.`);
    console.log('=============================================================\n');

    if (passedCount === totalCount) {
      console.log('🎉 ALL C4A-3 VERIFICATION TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      console.error('❌ SOME TESTS FAILED.');
      process.exit(1);
    }
  } catch (err) {
    console.error('VERIFICATION SCRIPT ERROR:', err);
    process.exit(1);
  }
}

runVerification();
