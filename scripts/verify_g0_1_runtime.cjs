const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.G0_RUNTIME_PORT || 3187);
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manwah-g0-1r-'));
const secret = crypto.randomBytes(24).toString('hex');
const userA = '10000000-0000-4000-8000-000000000001';
const userB = '20000000-0000-4000-8000-000000000002';

const contextA = {
  projectId: 'project-g0-a', canvasId: 'canvas-g0-a', activeSceneKey: 'scene-01',
  selectedNodeIds: ['scene-node-01'], productDnaVersionId: 'dna-version-a',
  assetVersionId: 'asset-version-a', copyVersionId: 'copy-version-a',
  typographySpecId: 'typography-spec-a'
};
const fixtures = {
  users: [userA, userB],
  canvases: [
    { userId: userA, projectId: 'project-g0-a', canvasId: 'canvas-g0-a', context: contextA },
    { userId: userA, projectId: 'project-g0-a2', canvasId: 'canvas-g0-a2', context: { projectId: 'project-g0-a2', canvasId: 'canvas-g0-a2' } },
    { userId: userB, projectId: 'project-g0-b', canvasId: 'canvas-g0-b', context: { projectId: 'project-g0-b', canvasId: 'canvas-g0-b' } }
  ]
};

const serverEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(port),
  DISABLE_VITE: 'true',
  AGENT_CHAT_TEST_MODE: 'true',
  AGENT_CHAT_TEST_SECRET: secret,
  AGENT_CHAT_TEST_FIXTURES: JSON.stringify(fixtures),
  AGENT_CHAT_DATA_DIR: dataDir
};

let server;
let passed = 0;
const evidence = {};

function pass(name, detail = '') {
  passed += 1;
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(condition, name, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
  pass(name, detail);
}

function headers(userId, scenario) {
  const result = {
    'content-type': 'application/json',
    'x-agent-test-secret': secret,
    'x-agent-test-user-id': userId
  };
  if (scenario) result['x-agent-test-scenario'] = scenario;
  return result;
}

async function waitForHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Server did not become healthy');
}

async function startServer() {
  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', chunk => process.env.G0_RUNTIME_VERBOSE === 'true' && process.stdout.write(chunk));
  server.stderr.on('data', chunk => process.env.G0_RUNTIME_VERBOSE === 'true' && process.stderr.write(chunk));
  await waitForHealth();
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function parseSse(raw) {
  return raw.split('\n\n').filter(Boolean).map(block => {
    const lines = block.split('\n');
    const event = lines.find(line => line.startsWith('event: '))?.slice(7) || '';
    const data = lines.filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
    return { event, data: data ? JSON.parse(data) : null };
  });
}

async function streamRequest(url, body, userId, scenario, abortAfterDeltas = 0) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}${url}`, {
    method: 'POST', headers: headers(userId, scenario), body: JSON.stringify(body), signal: controller.signal
  });
  if (!response.ok) return { response, events: [], raw: await response.text() };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let deltaCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      deltaCount = (raw.match(/event: response\.delta/g) || []).length;
      if (abortAfterDeltas && deltaCount >= abortAfterDeltas) {
        controller.abort();
        break;
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
  }
  return { response, events: parseSse(raw), raw };
}

async function loadMessages(conversationId, userId = userA) {
  return jsonRequest(`/api/agent/conversations/${conversationId}/messages`, { headers: headers(userId) });
}

async function waitForMessage(conversationId, predicate) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const loaded = await loadMessages(conversationId);
    const match = loaded.body.messages?.find(predicate);
    if (match) return { loaded, match };
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error('Timed out waiting for persisted message state');
}

async function run() {
  console.log('G0-1R｜真实 HTTP / SSE / 持久化运行验收');
  await startServer();

  const unauth = await jsonRequest('/api/agent/conversations?canvasId=canvas-g0-a');
  assert(unauth.response.status === 401 && unauth.body.error?.code === 'AGENT_AUTH_ERROR', '未登录请求被拒绝');

  const wrongOwnerCreate = await jsonRequest('/api/agent/conversations', {
    method: 'POST', headers: headers(userA),
    body: JSON.stringify({ projectId: 'project-g0-b', canvasId: 'canvas-g0-b' })
  });
  assert(wrongOwnerCreate.response.status === 403, '创建会话前验证 Project / Canvas 归属');

  const created = await jsonRequest('/api/agent/conversations', {
    method: 'POST', headers: headers(userA),
    body: JSON.stringify({ projectId: contextA.projectId, canvasId: contextA.canvasId, title: 'G0-1R 验收会话' })
  });
  assert(created.response.status === 201 && created.body.conversation?.id, '真实 HTTP 创建 Conversation');
  const conversationId = created.body.conversation.id;
  assert(created.body.conversation.project_id === contextA.projectId && created.body.conversation.canvas_id === contextA.canvasId, 'Conversation 正确绑定 Project / Canvas');

  const first = await streamRequest(`/api/agent/conversations/${conversationId}/messages`, {
    message: '请说明当前场景状态', context_snapshot: contextA
  }, userA, 'success');
  const eventNames = first.events.map(item => item.event);
  const deltas = first.events.filter(item => item.event === 'response.delta');
  const completed = first.events.filter(item => item.event === 'response.completed');
  assert(first.response.ok && deltas.length >= 2, 'Assistant 以多个 SSE delta 增量返回', `${deltas.length} deltas`);
  assert(eventNames.slice(0, 3).join(',') === 'conversation.created,message.user.saved,response.started', 'SSE 起始事件顺序正确');
  assert(completed.length === 1 && eventNames.at(-1) === 'response.completed', 'response.completed 仅出现一次且位于末尾');
  const merged = deltas.map(item => item.data.delta).join('');
  assert(merged === completed[0].data.message.content.text, 'delta 合并正文与 completed 正文一致');
  evidence.sse = { eventNames, deltaCount: deltas.length };

  const history = await loadMessages(conversationId);
  assert(history.body.messages.length === 2, 'User / Assistant 消息真实持久化');
  assert(history.body.messages[0].context_snapshot.activeSceneKey === 'scene-01', 'context_snapshot 完整持久化');
  assert(history.body.messages[1].status === 'completed' && history.body.messages[1].content.text === merged, '持久化 Assistant 正文与 SSE 一致');

  const listed = await jsonRequest(`/api/agent/conversations?canvasId=${contextA.canvasId}&projectId=${contextA.projectId}`, { headers: headers(userA) });
  assert(listed.body.conversations.some(item => item.id === conversationId), '刷新恢复所需会话列表可重新加载');

  const forbidden = await loadMessages(conversationId, userB);
  assert(forbidden.response.status === 403 && forbidden.body.error?.code === 'CONVERSATION_FORBIDDEN', '用户 B 无法读取用户 A 会话');

  const invalidContext = await streamRequest(`/api/agent/conversations/${conversationId}/messages`, {
    message: '非法上下文', context_snapshot: { ...contextA, assetVersionId: 'asset-version-foreign' }
  }, userA, 'success');
  assert(invalidContext.response.status === 400 && JSON.parse(invalidContext.raw).error.code === 'INVALID_AGENT_CONTEXT', '无效版本 ID 被拒绝');

  const tooLong = await streamRequest(`/api/agent/conversations/${conversationId}/messages`, { message: 'x'.repeat(10001), context_snapshot: contextA }, userA);
  assert(tooLong.response.status === 400 && JSON.parse(tooLong.raw).error.code === 'MESSAGE_TOO_LONG', '超长消息被拒绝');

  const missing = await streamRequest('/api/agent/conversations/00000000-0000-4000-8000-999999999999/messages', { message: 'test' }, userA);
  assert(missing.response.status === 404, '非法 conversationId 被拒绝');

  const timeout = await streamRequest(`/api/agent/conversations/${conversationId}/messages`, {
    message: '请模拟超时', context_snapshot: contextA
  }, userA, 'timeout');
  assert(timeout.events.some(item => item.event === 'response.failed' && item.data.error_code === 'PROVIDER_TIMEOUT'), 'Provider Timeout 分类为 PROVIDER_TIMEOUT');
  const afterTimeout = await loadMessages(conversationId);
  const failed = afterTimeout.body.messages.at(-1);
  const userCountBeforeRetry = afterTimeout.body.messages.filter(item => item.role === 'user').length;
  assert(failed.role === 'assistant' && failed.status === 'failed', 'Provider 失败持久化为 failed');

  const retried = await streamRequest(`/api/agent/conversations/${conversationId}/retry`, {}, userA, 'success');
  assert(retried.events.at(-1)?.event === 'response.completed', '失败消息可重试并完成');
  const afterRetry = await loadMessages(conversationId);
  assert(afterRetry.body.messages.filter(item => item.role === 'user').length === userCountBeforeRetry, 'retry 不重复创建 User Message');
  assert(afterRetry.body.messages.at(-1).parent_message_id === failed.parent_message_id, 'retry 保留正确 parent_message_id');

  const slow = await streamRequest(`/api/agent/conversations/${conversationId}/messages`, {
    message: '请生成一段较慢的回复', context_snapshot: { ...contextA, activeSceneKey: 'scene-02' }
  }, userA, 'slow', 2);
  assert(slow.events.filter(item => item.event === 'response.delta').length >= 2, '断流前收到局部 delta');
  const interrupted = await waitForMessage(conversationId, item => item.role === 'assistant' && item.error_code === 'STREAM_INTERRUPTED');
  assert(interrupted.match.status === 'failed', '客户端断开不会写入伪 completed');
  assert(interrupted.match.content.text.length > 0, '断流局部内容按策略保存');

  const stableHistory = await loadMessages(conversationId);
  assert(stableHistory.body.messages[0].context_snapshot.activeSceneKey === 'scene-01', '历史 context_snapshot 不随当前状态变化');

  const sensitivePattern = /(systemInstruction|authorization|api[_ -]?key|chain of thought|hidden reasoning)/i;
  assert(!sensitivePattern.test(first.raw + timeout.raw + retried.raw), 'SSE 未输出系统指令、凭证或隐藏推理');
  const allowedEvents = new Set(['conversation.created', 'message.user.saved', 'response.started', 'response.delta', 'response.completed', 'response.failed']);
  assert([...first.events, ...timeout.events, ...retried.events].every(item => allowedEvents.has(item.event)), 'SSE 仅输出白名单事件');

  const metrics = await jsonRequest('/api/agent/_test/metrics', { headers: headers(userA) });
  const zeroSideEffects = ['canvasNodeWrites', 'copyVersionWrites', 'typographySpecWrites', 'imageProviderCalls', 'billingCalls', 'toolCalls'];
  assert(zeroSideEffects.every(key => metrics.body.metrics[key] === 0), '运行时零画布写入、零生图、零计费、零工具调用');
  evidence.metrics = metrics.body.metrics;

  await stopServer();
  await startServer();
  const recovered = await loadMessages(conversationId);
  assert(recovered.response.ok && recovered.body.messages.length === stableHistory.body.messages.length, '服务重启后恢复完整消息历史');
  assert(recovered.body.messages.some(item => item.status === 'completed') && recovered.body.messages.some(item => item.error_code === 'STREAM_INTERRUPTED'), '重启恢复保留完成与断流状态');

  evidence.conversationId = conversationId;
  evidence.messageCount = recovered.body.messages.length;
  evidence.dataDir = dataDir;
  console.log(`\nG0-1R 验收完成：${passed} 项通过 / 0 项失败`);
  console.log(`EVIDENCE ${JSON.stringify(evidence)}`);
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
});
