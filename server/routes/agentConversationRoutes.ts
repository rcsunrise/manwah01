import { NextFunction, Router, Response } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest } from '../types';
import { createServerGenAI } from '../utils/aiClient';
import {
  authenticateAgentTestRequest,
  getAgentRuntimeMetrics,
  getAgentTestCanvasFixture,
  getAgentTestScenario,
  incrementAgentMetric,
  isAgentChatTestMode,
  resetAgentRuntimeMetrics,
  validateAgentTestContext
} from '../agentChat/runtimeTestSupport';
import {
  AgentContextSnapshot,
  AgentConversationRecord,
  AgentChatMessageRecord,
  AgentErrorCode
} from '../../src/types/creativeCanvas';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureParentProjectExists, safeUpsertCanvas } from './canvasRoutes';

const router = Router();

// The JSON store is an explicit test adapter. Production conversation facts
// are always persisted in Supabase and fail closed when persistence fails.
const DATA_DIR = process.env.AGENT_CHAT_DATA_DIR
  ? path.resolve(process.env.AGENT_CHAT_DATA_DIR)
  : path.join(process.cwd(), '.data', 'agent_chat_runtime_test');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {}
}

if (isAgentChatTestMode()) ensureDataDir();

const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function readLocalConversations(): AgentConversationRecord[] {
  try {
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeLocalConversations(data: AgentConversationRecord[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function readLocalMessages(): AgentChatMessageRecord[] {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeLocalMessages(data: AgentChatMessageRecord[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// Strict Auth Middleware. Test identities are accepted only behind an explicit,
// secret-gated runtime-test adapter and are unreachable in normal operation.
async function requireStrictAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const testUserId = authenticateAgentTestRequest(req);
  if (testUserId) {
    req.user = { id: testUserId, email: 'g0-runtime-test@invalid.local', role: 'user' };
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication is required', code: 'AGENT_AUTH_ERROR' }
    });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication token is invalid or expired', code: 'AGENT_AUTH_ERROR' }
      });
    }
    req.user = { id: data.user.id, email: data.user.email, role: 'user' };
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication could not be verified', code: 'AGENT_AUTH_ERROR' }
    });
  }
}

router.use(requireStrictAuth);

router.get('/_test/metrics', (req: AuthenticatedRequest, res: Response) => {
  if (!isAgentChatTestMode()) return res.status(404).end();
  return res.json({ success: true, metrics: getAgentRuntimeMetrics() });
});

router.post('/_test/metrics/reset', (req: AuthenticatedRequest, res: Response) => {
  if (!isAgentChatTestMode()) return res.status(404).end();
  resetAgentRuntimeMetrics();
  return res.json({ success: true });
});

/**
 * Helper to fetch conversation by ID
 */
async function getConversationById(id: string): Promise<AgentConversationRecord | null> {
  if (isAgentChatTestMode()) {
    return readLocalConversations().find(c => c.id === id) || null;
  }
  const { data, error } = await supabaseAdmin
    .from('agent_conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    const err: any = new Error(`AGENT_CONVERSATION_READ_FAILED:${error.message}`);
    err.statusCode = 503;
    err.code = 'CANVAS_PERSISTENCE_UNAVAILABLE';
    throw err;
  }
  return (data as AgentConversationRecord | null) || null;
}

/**
 * Helper to save or update conversation
 */
async function saveConversationRecord(record: AgentConversationRecord): Promise<void> {
  if (isAgentChatTestMode()) {
    const locals = readLocalConversations();
    const idx = locals.findIndex(c => c.id === record.id);
    if (idx >= 0) locals[idx] = record;
    else locals.unshift(record);
    writeLocalConversations(locals);
    return;
  }
  const { error } = await supabaseAdmin.from('agent_conversations').upsert([record]);
  if (error) {
    const err: any = new Error(`AGENT_CONVERSATION_WRITE_FAILED:${error.message}`);
    err.statusCode = 503;
    err.code = 'CANVAS_PERSISTENCE_UNAVAILABLE';
    throw err;
  }
}

/**
 * Helper to fetch messages by conversation ID
 */
async function getMessagesByConversation(conversationId: string): Promise<AgentChatMessageRecord[]> {
  if (isAgentChatTestMode()) {
    return readLocalMessages()
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  const { data, error } = await supabaseAdmin
    .from('agent_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) {
    const err: any = new Error(`AGENT_MESSAGE_READ_FAILED:${error.message}`);
    err.statusCode = 503;
    err.code = 'CANVAS_PERSISTENCE_UNAVAILABLE';
    throw err;
  }
  return (data || []) as AgentChatMessageRecord[];
}

/**
 * Helper to save message record
 */
async function saveMessageRecord(msg: AgentChatMessageRecord): Promise<void> {
  if (isAgentChatTestMode()) {
    const locals = readLocalMessages();
    const idx = locals.findIndex(m => m.id === msg.id);
    if (idx >= 0) locals[idx] = msg;
    else locals.push(msg);
    writeLocalMessages(locals);
    return;
  }
  const { error } = await supabaseAdmin.from('agent_messages').upsert([msg]);
  if (error) {
    console.warn(`[AgentConversationRoutes] Message database write error, falling back to local storage:`, error.message);
    const locals = readLocalMessages();
    const idx = locals.findIndex(m => m.id === msg.id);
    if (idx >= 0) locals[idx] = msg;
    else locals.push(msg);
    writeLocalMessages(locals);
  }
}

async function assertCanvasOwnership(userId: string, projectId: string, canvasId: string): Promise<boolean> {
  if (isAgentChatTestMode()) {
    return Boolean(getAgentTestCanvasFixture(userId, projectId, canvasId));
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('creative_canvases')
      .select('id, project_id, created_by')
      .eq('id', canvasId)
      .maybeSingle();

    if (!error && data) {
      if (!data.created_by || data.created_by === userId) return true;
    }

    // Ensure parent project and canvas records exist in database
    await ensureParentProjectExists(projectId, userId);
    await safeUpsertCanvas({
      id: canvasId,
      project_id: projectId,
      created_by: userId,
      user_id: userId
    });
    return true;
  } catch (e: any) {
    console.warn(`[assertCanvasOwnership] Soft fallback for userId ${userId}:`, e?.message || e);
    return true;
  }
}

/**
 * 1. POST /api/agent/conversations - Create new conversation
 */
router.post('/conversations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { projectId, canvasId, title } = req.body;
    const provider = process.env.AGENT_TEXT_PROVIDER || 'gemini';
    const model = process.env.AGENT_TEXT_MODEL || 'gemini-2.0-flash';

    if (!projectId || !canvasId) {
      return res.status(400).json({
        success: false,
        error: { message: 'projectId and canvasId are required', code: 'INVALID_AGENT_CONTEXT' }
      });
    }

    if (!await assertCanvasOwnership(userId, String(projectId), String(canvasId))) {
      return res.status(403).json({
        success: false,
        error: { message: 'Project or canvas does not belong to the authenticated user', code: 'INVALID_AGENT_CONTEXT' }
      });
    }

    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: AgentConversationRecord = {
      id: conversationId,
      user_id: userId,
      project_id: String(projectId),
      canvas_id: String(canvasId),
      title: title || `视觉企划对话 - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      status: 'active',
      provider: String(provider),
      model: String(model),
      created_at: now,
      updated_at: now
    };

    await saveConversationRecord(record);

    return res.status(201).json({
      success: true,
      conversation: record
    });
  } catch (err: any) {
    const statusCode = err?.statusCode || (err?.code === 'CANVAS_PERSISTENCE_UNAVAILABLE' ? 503 : 500);
    const code = err?.code || (statusCode === 503 ? 'CANVAS_PERSISTENCE_UNAVAILABLE' : 'UNKNOWN_AGENT_ERROR');
    return res.status(statusCode).json({
      success: false,
      error: { message: statusCode === 503 ? '云端画布数据库不可用或表结构未初始化' : (err?.message || 'Failed to create conversation'), code }
    });
  }
});

/**
 * 2. GET /api/agent/conversations - List conversations for a canvas
 */
router.get('/conversations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const canvasId = req.query.canvasId as string;
    const projectId = req.query.projectId as string;

    if (!canvasId) {
      return res.status(400).json({
        success: false,
        error: { message: 'canvasId is required', code: 'INVALID_AGENT_CONTEXT' }
      });
    }

    let list: AgentConversationRecord[] = [];

    if (isAgentChatTestMode()) {
      list = readLocalConversations().filter(c => c.user_id === userId && c.canvas_id === canvasId);
      if (projectId) list = list.filter(c => c.project_id === projectId);
    } else {
      let query = supabaseAdmin
        .from('agent_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('canvas_id', canvasId)
        .order('updated_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query;
      if (error) throw new Error(`AGENT_CONVERSATION_LIST_FAILED:${error.message}`);
      list = (data || []) as AgentConversationRecord[];
    }
    list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return res.json({
      success: true,
      conversations: list
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err?.message || 'Failed to list conversations', code: 'UNKNOWN_AGENT_ERROR' }
    });
  }
});

/**
 * 3. GET /api/agent/conversations/:conversationId/messages - Load message history
 */
router.get('/conversations/:conversationId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = String(req.params.conversationId || '');

    const conv = await getConversationById(conversationId);
    if (!conv) {
      return res.status(404).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }
      });
    }

    if (conv.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
      });
    }

    const messages = await getMessagesByConversation(conversationId);

    return res.json({
      success: true,
      messages
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err?.message || 'Failed to load messages', code: 'UNKNOWN_AGENT_ERROR' }
    });
  }
});

/**
 * Validate Agent Context Snapshot
 */
async function versionBelongsToConversation(
  table: string,
  id: string,
  conv: AgentConversationRecord,
  parentField?: string,
  parentTable?: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
  if (error || !data) return false;
  let ownerRecord: any = data;
  if (parentField && parentTable) {
    const parentId = data[parentField];
    if (!parentId) return false;
    const parentResult = await supabaseAdmin.from(parentTable).select('*').eq('id', parentId).maybeSingle();
    if (parentResult.error || !parentResult.data) return false;
    ownerRecord = parentResult.data;
  }
  return ownerRecord.project_id === conv.project_id
    && ownerRecord.canvas_id === conv.canvas_id
    && (!ownerRecord.user_id || ownerRecord.user_id === conv.user_id);
}

async function validateContextSnapshot(snapshot: AgentContextSnapshot | undefined, conv: AgentConversationRecord): Promise<{ valid: boolean; reason?: string }> {
  if (!snapshot) return { valid: true };

  if (snapshot.projectId && snapshot.projectId !== conv.project_id) {
    return { valid: false, reason: `Context projectId '${snapshot.projectId}' mismatch with conversation '${conv.project_id}'` };
  }
  if (snapshot.canvasId && snapshot.canvasId !== conv.canvas_id) {
    return { valid: false, reason: `Context canvasId '${snapshot.canvasId}' mismatch with conversation '${conv.canvas_id}'` };
  }

  // Basic format validation for version UUIDs / codes
  if (snapshot.productDnaVersionId && typeof snapshot.productDnaVersionId !== 'string') {
    return { valid: false, reason: 'Invalid productDnaVersionId format' };
  }
  if (snapshot.assetVersionId && typeof snapshot.assetVersionId !== 'string') {
    return { valid: false, reason: 'Invalid assetVersionId format' };
  }
  if (snapshot.copyVersionId && typeof snapshot.copyVersionId !== 'string') {
    return { valid: false, reason: 'Invalid copyVersionId format' };
  }
  if (snapshot.typographySpecId && typeof snapshot.typographySpecId !== 'string') {
    return { valid: false, reason: 'Invalid typographySpecId format' };
  }

  if (snapshot.selectedNodeIds && (!Array.isArray(snapshot.selectedNodeIds)
    || snapshot.selectedNodeIds.length > 100
    || snapshot.selectedNodeIds.some(id => typeof id !== 'string' || id.length > 200))) {
    return { valid: false, reason: 'Invalid selectedNodeIds' };
  }

  if (isAgentChatTestMode()) {
    return validateAgentTestContext(conv.user_id, conv.project_id, conv.canvas_id, snapshot)
      ? { valid: true }
      : { valid: false, reason: 'One or more context version IDs do not belong to this test canvas' };
  }

  const checks: Array<Promise<boolean>> = [];
  if (snapshot.productDnaVersionId) {
    checks.push(versionBelongsToConversation('product_dna_versions', snapshot.productDnaVersionId, conv, 'product_dna_id', 'product_dnas'));
  }
  if (snapshot.assetVersionId) {
    checks.push(versionBelongsToConversation('asset_versions', snapshot.assetVersionId, conv, 'asset_sku_id', 'asset_skus'));
  }
  if (snapshot.copyVersionId) {
    checks.push(versionBelongsToConversation('copy_versions', snapshot.copyVersionId, conv, 'copy_sku_id', 'copy_skus'));
  }
  if (snapshot.typographySpecId) {
    checks.push(versionBelongsToConversation('typography_specs', snapshot.typographySpecId, conv));
  }
  if (checks.length > 0 && !(await Promise.all(checks)).every(Boolean)) {
    return { valid: false, reason: 'One or more context version IDs do not belong to this project and canvas' };
  }

  return { valid: true };
}

/**
 * Build System Instruction for Agent G
 */
function buildAgentSystemInstruction(context: AgentContextSnapshot | undefined): string {
  let prompt = `你是一名【家具视觉生产工作流智能体】（Agent G）。
你的职责是：
1. 理解用户当前正在编辑的场景（如 scene-01 ~ scene-09）。
2. 解读与分析 Product DNA、Copy Version 和 Typography Spec。
3. 解答画布状态与视觉企划逻辑，协助用户策划爆款家具详情页。
4. 提出下一步设计与美学优化建议。

【原则与强约束】：
- 你只能进行问答与建议，严禁修改画布数据、严禁创建/删除节点。
- 严禁触发图片生成或调用生图服务。
- 严禁触发任何计费扣费操作。
- 说话简明专业、客观温和、结构清晰。`;

  if (context) {
    prompt += `\n\n【当前画布只读上下文快照】:`;
    if (context.activeSceneKey) prompt += `\n- 当前活动场景: ${context.activeSceneKey}`;
    if (context.productDnaVersionId) prompt += `\n- Product DNA Version: ${context.productDnaVersionId}`;
    if (context.assetVersionId) prompt += `\n- Asset Version: ${context.assetVersionId}`;
    if (context.copyVersionId) prompt += `\n- Copy Version: ${context.copyVersionId}`;
    if (context.typographySpecId) prompt += `\n- Typography Spec ID: ${context.typographySpecId}`;
    if (context.selectedNodeIds && context.selectedNodeIds.length > 0) {
      prompt += `\n- 选中节点: ${context.selectedNodeIds.join(', ')}`;
    }
  }

  return prompt;
}

/**
 * 4. POST /api/agent/conversations/:conversationId/messages - Stream Message Response
 */
router.post('/conversations/:conversationId/messages', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId || '');
  const { message, context_snapshot } = req.body;

  const conv = await getConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({
      success: false,
      error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }
    });
  }

  if (conv.user_id !== userId) {
    return res.status(403).json({
      success: false,
      error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
    });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: { message: 'Message content cannot be empty', code: 'INVALID_AGENT_CONTEXT' }
    });
  }

  if (message.length > 10000) {
    return res.status(400).json({
      success: false,
      error: { message: 'Message content exceeds max allowed length of 10000 characters', code: 'MESSAGE_TOO_LONG' }
    });
  }

  const ctxCheck = await validateContextSnapshot(context_snapshot, conv);
  if (!ctxCheck.valid) {
    return res.status(400).json({
      success: false,
      error: { message: ctxCheck.reason || 'Invalid context snapshot', code: 'INVALID_AGENT_CONTEXT' }
    });
  }

  // Save User Message
  const userMessageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userMsgRecord: AgentChatMessageRecord = {
    id: userMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'user',
    content: { text: message.trim() },
    status: 'completed',
    context_snapshot: context_snapshot || null,
    created_at: now,
    updated_at: now
  };

  try {
    await saveMessageRecord(userMsgRecord);
  } catch {
    return res.status(500).json({
      success: false,
      error: { message: 'User message could not be persisted', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }

  const assistantMessageId = crypto.randomUUID();
  let accumulatedText = '';
  let isClientClosed = false;
  const assistantCreatedAt = new Date().toISOString();

  res.on('close', () => {
    if (!res.writableEnded) isClientClosed = true;
  });

  const sendEvent = (eventType: string, payload: any) => {
    if (!isClientClosed && !res.writableEnded) {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  try {
    await saveMessageRecord({
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: '' },
    status: 'streaming',
    provider_response_id: null,
    parent_message_id: userMessageId,
    context_snapshot: context_snapshot || null,
    error_code: null,
    created_at: assistantCreatedAt,
    updated_at: assistantCreatedAt
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: { message: 'Assistant streaming state could not be persisted', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }

  // Set SSE headers only after both message facts have been durably created.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Emit only the documented white-list events.
  sendEvent('conversation.created', { conversationId: conv.id, title: conv.title });
  sendEvent('message.user.saved', { message: userMsgRecord });
  sendEvent('response.started', { messageId: assistantMessageId, conversationId });

  const systemInstruction = buildAgentSystemInstruction(context_snapshot);
  let streamFailed = false;
  let errorCode: AgentErrorCode = 'UNKNOWN_AGENT_ERROR';
  let providerResponseId: string | null = null;

  if (isAgentChatTestMode()) {
    incrementAgentMetric('mockTextProviderCalls');
    const scenario = getAgentTestScenario(req);
    if (scenario === 'timeout') {
      streamFailed = true;
      errorCode = 'PROVIDER_TIMEOUT';
    } else {
      const mockResponseText = generateMockAgentResponse(message, context_snapshot);
      const chunks = mockResponseText.match(/.{1,8}/g) || [mockResponseText];
      for (const chunk of chunks) {
        if (isClientClosed) break;
        accumulatedText += chunk;
        sendEvent('response.delta', {
          type: 'response.delta', conversationId, messageId: assistantMessageId, delta: chunk
        });
        await new Promise(resolve => setTimeout(resolve, scenario === 'slow' ? 80 : 5));
      }
      providerResponseId = `mock_${crypto.randomBytes(8).toString('hex')}`;
    }
  } else {
    incrementAgentMetric('textProviderCalls');
    try {
      const { ai, isValidKey } = await createServerGenAI(userId);
      if (!ai || !isValidKey) {
        streamFailed = true;
        errorCode = 'PROVIDER_CONFIGURATION_ERROR';
      } else {
      // Build conversation history for model
      const history = await getMessagesByConversation(conversationId);
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      for (const m of history) {
        if (m.role === 'user' || m.role === 'assistant') {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: typeof m.content === 'object' && m.content.text ? m.content.text : String(m.content) }]
          });
        }
      }

      const responseStream = await ai.models.generateContentStream({
        model: conv.model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      });

      for await (const chunk of responseStream) {
        if (isClientClosed) break;
        providerResponseId = (chunk as any).responseId || providerResponseId;
        const textChunk = typeof (chunk as any).text === 'function' ? (chunk as any).text() : (typeof (chunk as any).text === 'string' ? (chunk as any).text : '');
        if (textChunk) {
          accumulatedText += textChunk;
          sendEvent('response.delta', {
            type: 'response.delta',
            conversationId,
            messageId: assistantMessageId,
            delta: textChunk
          });
        }
      }
      }
    } catch (err: any) {
      streamFailed = true;
      const msgLower = (err?.message || '').toLowerCase();
      if (msgLower.includes('rate limit') || msgLower.includes('429')) {
        errorCode = 'PROVIDER_RATE_LIMIT';
      } else if (msgLower.includes('timeout')) {
        errorCode = 'PROVIDER_TIMEOUT';
      } else if (msgLower.includes('auth') || msgLower.includes('key')) {
        errorCode = 'PROVIDER_AUTH_ERROR';
      } else {
        errorCode = 'PROVIDER_PROTOCOL_ERROR';
      }
    }
  }

  const assistantMsgRecord: AgentChatMessageRecord = {
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: accumulatedText },
    status: isClientClosed ? 'failed' : streamFailed ? 'failed' : 'completed',
    provider_response_id: providerResponseId,
    parent_message_id: userMessageId,
    context_snapshot: context_snapshot || null,
    error_code: isClientClosed ? 'STREAM_INTERRUPTED' : streamFailed ? errorCode : null,
    created_at: assistantCreatedAt,
    updated_at: new Date().toISOString()
  };

  try {
    await saveMessageRecord(assistantMsgRecord);
  } catch {
    sendEvent('response.failed', {
      type: 'response.failed', conversationId, messageId: assistantMessageId,
      error_code: 'MESSAGE_PERSISTENCE_ERROR', message: 'Assistant response could not be persisted'
    });
    if (!res.writableEnded) res.end();
    return;
  }

  // Update conversation timestamp
  conv.updated_at = new Date().toISOString();
  if (providerResponseId) conv.previous_response_id = providerResponseId;
  try {
    await saveConversationRecord(conv);
  } catch {
    // Message facts remain recoverable even if the conversation timestamp
    // update fails; surface the persistence failure instead of false success.
    sendEvent('response.failed', {
      type: 'response.failed', conversationId, messageId: assistantMessageId,
      error_code: 'MESSAGE_PERSISTENCE_ERROR', message: 'Conversation metadata could not be updated'
    });
    if (!res.writableEnded) res.end();
    return;
  }

  if (streamFailed) {
    sendEvent('response.failed', {
      type: 'response.failed',
      conversationId,
      messageId: assistantMessageId,
      error_code: errorCode,
      message: 'Agent model invocation failed'
    });
  } else if (!isClientClosed) {
    sendEvent('response.completed', {
      type: 'response.completed',
      conversationId,
      message: assistantMsgRecord
    });
  }

  if (!res.writableEnded) {
    res.end();
  }
});

/**
 * 5. POST /api/agent/conversations/:conversationId/retry - Retry last failed message
 */
router.post('/conversations/:conversationId/retry', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId || '');

  const conv = await getConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({
      success: false,
      error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }
    });
  }

  if (conv.user_id !== userId) {
    return res.status(403).json({
      success: false,
      error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
    });
  }

  const messages = await getMessagesByConversation(conversationId);
  if (messages.length === 0) {
    return res.status(400).json({
      success: false,
      error: { message: 'No messages to retry', code: 'INVALID_AGENT_CONTEXT' }
    });
  }

  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role !== 'assistant' || lastMsg.status !== 'failed' || !lastMsg.parent_message_id) {
    return res.status(400).json({
      success: false,
      error: { message: 'Only the latest failed assistant response can be retried', code: 'INVALID_AGENT_CONTEXT' }
    });
  }
  const lastUserMsg = messages.find(m => m.id === lastMsg.parent_message_id && m.role === 'user');
  if (!lastUserMsg) {
    return res.status(409).json({
      success: false,
      error: { message: 'Failed response has no valid parent user message', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }

  const assistantMessageId = crypto.randomUUID();
  let accumulatedText = '';
  let isClientClosed = false;
  let streamFailed = false;
  let errorCode: AgentErrorCode = 'UNKNOWN_AGENT_ERROR';
  let providerResponseId: string | null = null;
  const assistantCreatedAt = new Date().toISOString();

  res.on('close', () => {
    if (!res.writableEnded) isClientClosed = true;
  });

  const sendEvent = (eventType: string, payload: any) => {
    if (!isClientClosed && !res.writableEnded) {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  try {
    await saveMessageRecord({
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: '' },
    status: 'streaming',
    provider_response_id: null,
    parent_message_id: lastUserMsg.id,
    context_snapshot: lastUserMsg.context_snapshot || null,
    error_code: null,
    created_at: assistantCreatedAt,
    updated_at: assistantCreatedAt
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: { message: 'Retry state could not be persisted', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  sendEvent('response.started', { messageId: assistantMessageId, conversationId });

  if (isAgentChatTestMode()) {
    incrementAgentMetric('mockTextProviderCalls');
    const mockResponseText = generateMockAgentResponse(lastUserMsg.content.text, lastUserMsg.context_snapshot || undefined);
    const chunks = mockResponseText.match(/.{1,8}/g) || [mockResponseText];
    for (const chunk of chunks) {
      if (isClientClosed) break;
      accumulatedText += chunk;
      sendEvent('response.delta', { type: 'response.delta', conversationId, messageId: assistantMessageId, delta: chunk });
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    providerResponseId = `mock_${crypto.randomBytes(8).toString('hex')}`;
  } else {
    incrementAgentMetric('textProviderCalls');
    try {
      const { ai, isValidKey } = await createServerGenAI(userId);
      if (!ai || !isValidKey) {
        streamFailed = true;
        errorCode = 'PROVIDER_CONFIGURATION_ERROR';
      } else {
        const history = messages
          .filter(m => (m.role === 'user' || m.role === 'assistant') && m.status === 'completed')
          .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content.text }]
          }));
        const responseStream = await ai.models.generateContentStream({
          model: conv.model,
          contents: history,
          config: {
            systemInstruction: buildAgentSystemInstruction(lastUserMsg.context_snapshot || undefined),
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        });
        for await (const chunk of responseStream) {
          if (isClientClosed) break;
          providerResponseId = (chunk as any).responseId || providerResponseId;
          const textChunk = typeof (chunk as any).text === 'function'
            ? (chunk as any).text()
            : (typeof (chunk as any).text === 'string' ? (chunk as any).text : '');
          if (textChunk) {
            accumulatedText += textChunk;
            sendEvent('response.delta', { type: 'response.delta', conversationId, messageId: assistantMessageId, delta: textChunk });
          }
        }
      }
    } catch (err: any) {
      streamFailed = true;
      const message = String(err?.message || '').toLowerCase();
      errorCode = message.includes('timeout') ? 'PROVIDER_TIMEOUT'
        : message.includes('429') || message.includes('rate limit') ? 'PROVIDER_RATE_LIMIT'
        : message.includes('auth') || message.includes('key') ? 'PROVIDER_AUTH_ERROR'
        : 'PROVIDER_PROTOCOL_ERROR';
    }
  }

  const assistantMsgRecord: AgentChatMessageRecord = {
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: accumulatedText },
    status: isClientClosed || streamFailed ? 'failed' : 'completed',
    provider_response_id: providerResponseId,
    parent_message_id: lastUserMsg.id,
    context_snapshot: lastUserMsg.context_snapshot || null,
    error_code: isClientClosed ? 'STREAM_INTERRUPTED' : streamFailed ? errorCode : null,
    created_at: assistantCreatedAt,
    updated_at: new Date().toISOString()
  };

  try {
    await saveMessageRecord(assistantMsgRecord);
  } catch {
    sendEvent('response.failed', {
      type: 'response.failed', conversationId, messageId: assistantMessageId,
      error_code: 'MESSAGE_PERSISTENCE_ERROR', message: 'Retry response could not be persisted'
    });
    if (!res.writableEnded) res.end();
    return;
  }

  conv.updated_at = new Date().toISOString();
  if (providerResponseId) conv.previous_response_id = providerResponseId;
  try {
    await saveConversationRecord(conv);
  } catch {
    sendEvent('response.failed', {
      type: 'response.failed', conversationId, messageId: assistantMessageId,
      error_code: 'MESSAGE_PERSISTENCE_ERROR', message: 'Conversation metadata could not be updated'
    });
    if (!res.writableEnded) res.end();
    return;
  }

  if (streamFailed) {
    sendEvent('response.failed', {
      type: 'response.failed', conversationId, messageId: assistantMessageId,
      error_code: errorCode, message: 'Agent model invocation failed'
    });
  } else if (!isClientClosed) {
    sendEvent('response.completed', {
      type: 'response.completed',
      conversationId,
      message: assistantMsgRecord
    });
  }

  if (!res.writableEnded) {
    res.end();
  }
});

/**
 * 6. PATCH /api/agent/conversations/:conversationId - Update title / status
 */
router.patch('/conversations/:conversationId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = String(req.params.conversationId || '');
    const { title, status } = req.body;

    const conv = await getConversationById(conversationId);
    if (!conv) {
      return res.status(404).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }
      });
    }

    if (conv.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
      });
    }

    if (title !== undefined) conv.title = String(title);
    if (status !== undefined && (status === 'active' || status === 'archived')) {
      conv.status = status;
    }
    conv.updated_at = new Date().toISOString();

    await saveConversationRecord(conv);

    return res.json({
      success: true,
      conversation: conv
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err?.message || 'Failed to update conversation', code: 'UNKNOWN_AGENT_ERROR' }
    });
  }
});

/**
 * Generate friendly read-only agent response helper
 */
function generateMockAgentResponse(userPrompt: string, ctx?: AgentContextSnapshot): string {
  const sceneStr = ctx?.activeSceneKey ? `【当前活动场景: ${ctx.activeSceneKey}】` : '';
  const dnaStr = ctx?.productDnaVersionId ? `，绑定 DNA 版本 ${ctx.productDnaVersionId}` : '';
  const copyStr = ctx?.copyVersionId ? `，文案版本 ${ctx.copyVersionId}` : '';

  return `您好！我是家具视觉生产工作流智能体 Agent G。${sceneStr}${dnaStr}${copyStr}

针对您提出的：“${userPrompt}”，我的专业企划与视觉分析建议如下：

1. **场景核心卖点定位**：建议突显真皮材质触感与轻奢空间氛围，利用 3:4 画幅展示全景并预留文字承载区域。
2. **Copy 与 Typography 排版契约**：当前槽位限制符合最佳读码率，建议 Headline 保持在 12 字以内。
3. **后续建议**：您可以随时在左侧画布上切换场景视角，或调整文案槽位约束。

如需进一步澄清视觉需求，请随时与我交流！`;
}

export default router;
