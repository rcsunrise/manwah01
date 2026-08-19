const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}`);
  }
}

console.log('='.repeat(72));
console.log('BASELINE-M1｜C4B-3 + G0-1R + G3 Responses 主线融合验证');
console.log('='.repeat(72));

const server = read('server.ts');
const agentRoutes = read('server/routes/agentRoutes.ts');
const agentPanel = read('src/components/creative-canvas/AgentPanel.tsx');
const workspaceHook = read('src/hooks/useCreativeCanvasWorkspace.ts');
const types = read('src/types.ts');

check('Responses 协议实现已进入根工程', fs.existsSync(path.join(root, 'server/ai/agentResponses.ts')));
check('Agent 模型能力注册表已进入根工程', fs.existsSync(path.join(root, 'server/ai/agentModelRegistry.ts')));
check('九屏严格 JSON Schema 已进入根工程', fs.existsSync(path.join(root, 'server/ai/detailPlanSchema.ts')));
check('G3 Responses 专项测试已进入根工程', fs.existsSync(path.join(root, 'tests/g3_responses_agent.test.ts')));
check('九屏路由接入 createAgentResponse', agentRoutes.includes('createAgentResponse(providerConfig'));
check('九屏路由保存 responseId', agentRoutes.includes('responseId: response.id'));
check('九屏路由处理可续接 incomplete', agentRoutes.includes('continuationRequired: true'));
check('九屏路由拒绝不可续接 incomplete', agentRoutes.includes('PROVIDER_RESPONSE_INCOMPLETE'));
check('AgentRun 类型记录 planGeneration', types.includes('planGeneration?:'));
check('前端提供 GPT-5.6 Responses 选择', agentPanel.includes('GPT-5.6 Responses'));
check('前端提供思考等级选择', agentPanel.includes('planReasoningEffort'));
check('前端限制自动续接次数', workspaceHook.includes('continuationAttempt < 3'));

check('G0-1R 会话路由仍挂载', server.includes("app.use('/api/agent', agentConversationRoutes)"));
check('G0-1R 会话服务仍存在', fs.existsSync(path.join(root, 'src/services/agentChatService.ts')));
check('G0-1R 运行验收脚本仍存在', fs.existsSync(path.join(root, 'scripts/verify_g0_1_runtime.cjs')));
check('G0-1R 前端流式状态仍存在', workspaceHook.includes('handleSendMessageStream'));
check('C4B-3 Typography 工作区仍存在', fs.existsSync(path.join(root, 'src/components/creative-canvas/TypographyWorkspacePanel.tsx')));
check('C4B Copy 路由仍挂载', server.includes("app.use('/api', copyRoutes)"));
check('C4B-3 验证脚本仍存在', fs.existsSync(path.join(root, 'scripts/verify_c4b3.cjs')));
check('package-lock.json 已锁定', fs.existsSync(path.join(root, 'package-lock.json')));
check('交付根目录不包含旧 manwah-g1 工程', !fs.existsSync(path.join(root, 'manwah-g1')));
check('交付根目录不包含旧 manwah-G3-R1 工程', !fs.existsSync(path.join(root, 'manwah-G3-R1')));

console.log('-'.repeat(72));
console.log(`BASELINE-M1 验证结果：${passed} Passed, ${failed} Failed`);
console.log('='.repeat(72));

if (failed > 0) process.exit(1);
