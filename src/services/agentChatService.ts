import { supabase } from '../lib/supabase';
import {
  AgentContextSnapshot,
  AgentConversationRecord,
  AgentChatMessageRecord,
  AgentErrorCode
} from '../types/creativeCanvas';

export class AgentApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AgentApiError';
    this.code = code;
    this.status = status;
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
    return headers;
  } catch (e) {
    return { 'Content-Type': 'application/json' };
  }
}

/**
 * Safely parse JSON responses from Agent API without assuming JSON format or risking unhandled HTML exceptions.
 */
async function parseAgentJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';

  let text = '';
  try {
    text = await res.text();
  } catch (e) {
    throw new AgentApiError('无法读取 API 响应', 'AGENT_API_READ_ERROR', res.status);
  }

  const isHtml = contentType.includes('text/html') || /^\s*<!DOCTYPE\s+html/i.test(text) || /^\s*<html/i.test(text);

  if (isHtml || !contentType.includes('application/json')) {
    if (res.status === 504 || /gateway\s*time-?out|timeout/i.test(text)) {
      throw new AgentApiError('服务器网关响应超时（HTTP 504），请稍后重试', 'API_TIMEOUT', 504);
    }
    if (res.status === 502 || /bad\s*gateway/i.test(text)) {
      throw new AgentApiError('服务器上游响应异常（HTTP 502）', 'BAD_GATEWAY', 502);
    }
    const titleMatch = text.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const errorMsg = title 
      ? `服务器响应 HTML 页面 (${res.status}): ${title}` 
      : (res.status === 404 ? '请求的 Agent API 路由不存在 (404)' : `服务器返回异常页面 (${res.status})`);

    throw new AgentApiError(
      errorMsg,
      'AGENT_API_NON_JSON_RESPONSE',
      res.status
    );
  }

  if (!text || !text.trim()) {
    throw new AgentApiError('API 返回空响应', 'AGENT_API_EMPTY_RESPONSE', res.status);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new AgentApiError(
      `Agent API 返回非标准 JSON 格式 (HTTP ${res.status})`,
      'AGENT_API_NON_JSON_RESPONSE',
      res.status
    );
  }

  if (!res.ok || json.success === false) {
    const errObj = json.error || {};
    const code = errObj.code || (
      res.status === 401 ? 'AGENT_AUTH_ERROR' :
      res.status === 403 ? 'CANVAS_FORBIDDEN' :
      res.status === 404 ? 'API_ROUTE_NOT_FOUND' :
      res.status === 503 ? 'CANVAS_PERSISTENCE_UNAVAILABLE' :
      'UNKNOWN_AGENT_ERROR'
    );
    const message = errObj.message || (
      res.status === 401 ? '未登录或认证令牌无效' :
      res.status === 403 ? '无权限访问该画布' :
      res.status === 404 ? '请求的 API 路由不存在' :
      res.status === 503 ? '云端画布数据库不可用或表结构未初始化' :
      `请求失败 (${res.status})`
    );
    throw new AgentApiError(message, code, res.status);
  }

  return json;
}

interface AgentStreamCallbacks {
  onDelta?: (delta: string) => void;
  onComplete?: (assistantMessage: AgentChatMessageRecord) => void;
  onError?: (err: { code: AgentErrorCode; message: string }) => void;
}

export async function consumeAgentSseStream(
  body: ReadableStream<Uint8Array>,
  callbacks: AgentStreamCallbacks
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let terminalEventReceived = false;

  const processBlock = (block: string) => {
    let eventType = '';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    try {
      const parsed = JSON.parse(dataLines.join('\n'));
      const type = eventType || parsed.type;
      if (type === 'response.delta' && parsed.delta) {
        callbacks.onDelta?.(parsed.delta);
      } else if (type === 'response.completed' && parsed.message) {
        terminalEventReceived = true;
        callbacks.onComplete?.(parsed.message);
      } else if (type === 'response.failed') {
        terminalEventReceived = true;
        callbacks.onError?.({
          code: parsed.error_code || 'UNKNOWN_AGENT_ERROR',
          message: parsed.message || '模型响应失败'
        });
      }
    } catch {
      // Ignore malformed non-terminal blocks; a missing terminal event below
      // is surfaced as STREAM_INTERRUPTED instead of silently succeeding.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    blocks.filter(Boolean).forEach(processBlock);
  }
  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);
  if (!terminalEventReceived) {
    callbacks.onError?.({ code: 'STREAM_INTERRUPTED', message: '响应流在完成前中断' });
  }
}

export class AgentChatService {
  /**
   * Create a new agent conversation
   */
  static async createConversation(
    projectId: string,
    canvasId: string,
    title?: string
  ): Promise<AgentConversationRecord> {
    const headers = await getAuthHeader();
    const res = await fetch('/api/agent/conversations', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, canvasId, title })
    });

    const json = await parseAgentJsonResponse(res);
    return json.conversation;
  }

  /**
   * List conversations for canvas
   */
  static async listConversations(
    canvasId: string,
    projectId?: string
  ): Promise<AgentConversationRecord[]> {
    const headers = await getAuthHeader();
    const params = new URLSearchParams({ canvasId });
    if (projectId) params.append('projectId', projectId);

    const res = await fetch(`/api/agent/conversations?${params.toString()}`, {
      method: 'GET',
      headers
    });

    const json = await parseAgentJsonResponse(res);
    return json.conversations || [];
  }

  /**
   * Load history messages for conversation
   */
  static async loadMessages(conversationId: string): Promise<AgentChatMessageRecord[]> {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/agent/conversations/${conversationId}/messages`, {
      method: 'GET',
      headers
    });

    const json = await parseAgentJsonResponse(res);
    return json.messages || [];
  }

  /**
   * Send message with SSE streaming
   */
  static async sendMessageStream(options: {
    conversationId: string;
    message: string;
    contextSnapshot?: AgentContextSnapshot;
    onDelta?: (delta: string) => void;
    onComplete?: (assistantMessage: AgentChatMessageRecord) => void;
    onError?: (err: { code: AgentErrorCode; message: string }) => void;
    abortController?: AbortController;
  }): Promise<void> {
    const {
      conversationId,
      message,
      contextSnapshot,
      onDelta,
      onComplete,
      onError,
      abortController
    } = options;

    const headers = await getAuthHeader();

    try {
      const res = await fetch(`/api/agent/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers,
        signal: abortController?.signal,
        body: JSON.stringify({
          message,
          context_snapshot: contextSnapshot
        })
      });

      if (!res.ok) {
        let code: AgentErrorCode = 'UNKNOWN_AGENT_ERROR';
        let msg = `请求失败 (${res.status})`;
        try {
          const json = await parseAgentJsonResponse(res);
          if (json.error) {
            code = (json.error.code as AgentErrorCode) || code;
            msg = json.error.message || msg;
          }
        } catch (err: any) {
          code = (err.code as AgentErrorCode) || 'AGENT_API_NON_JSON_RESPONSE';
          msg = err.message || msg;
        }
        onError?.({ code, message: msg });
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        let code: AgentErrorCode = 'AGENT_API_NON_JSON_RESPONSE';
        let msg = 'Agent API 未返回 SSE 事件流，请检查服务端运行入口或 API 路由配置';
        try {
          const json = await parseAgentJsonResponse(res);
          if (json.error) {
            code = (json.error.code as AgentErrorCode) || code;
            msg = json.error.message || msg;
          }
        } catch (err: any) {
          code = (err.code as AgentErrorCode) || code;
          msg = err.message || msg;
        }
        onError?.({ code, message: msg });
        return;
      }

      if (!res.body) {
        onError?.({ code: 'STREAM_INTERRUPTED', message: '未收到可读响应流' });
        return;
      }

      await consumeAgentSseStream(res.body, { onDelta, onComplete, onError });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        onError?.({ code: 'STREAM_INTERRUPTED', message: '已停止生成' });
      } else {
        const code = (err.code as AgentErrorCode) || 'UNKNOWN_AGENT_ERROR';
        onError?.({ code, message: err?.message || '网络连接异常' });
      }
    }
  }

  /**
   * Retry generating assistant response for last message
   */
  static async retryMessage(options: {
    conversationId: string;
    onDelta?: (delta: string) => void;
    onComplete?: (assistantMessage: AgentChatMessageRecord) => void;
    onError?: (err: { code: AgentErrorCode; message: string }) => void;
  }): Promise<void> {
    const { conversationId, onDelta, onComplete, onError } = options;
    const headers = await getAuthHeader();

    try {
      const res = await fetch(`/api/agent/conversations/${conversationId}/retry`, {
        method: 'POST',
        headers
      });

      if (!res.ok) {
        let code: AgentErrorCode = 'UNKNOWN_AGENT_ERROR';
        let msg = '重试失败';
        try {
          const json = await parseAgentJsonResponse(res);
          if (json.error) {
            code = (json.error.code as AgentErrorCode) || code;
            msg = json.error.message || msg;
          }
        } catch (err: any) {
          code = (err.code as AgentErrorCode) || 'AGENT_API_NON_JSON_RESPONSE';
          msg = err.message || msg;
        }
        onError?.({ code, message: msg });
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        let code: AgentErrorCode = 'AGENT_API_NON_JSON_RESPONSE';
        let msg = 'Agent API 未返回 SSE 事件流，请检查服务端运行入口或 API 路由配置';
        try {
          const json = await parseAgentJsonResponse(res);
          if (json.error) {
            code = (json.error.code as AgentErrorCode) || code;
            msg = json.error.message || msg;
          }
        } catch (err: any) {
          code = (err.code as AgentErrorCode) || code;
          msg = err.message || msg;
        }
        onError?.({ code, message: msg });
        return;
      }

      if (!res.body) {
        onError?.({ code: 'STREAM_INTERRUPTED', message: '未收到可读响应流' });
        return;
      }

      await consumeAgentSseStream(res.body, { onDelta, onComplete, onError });
    } catch (err: any) {
      const code = (err.code as AgentErrorCode) || 'UNKNOWN_AGENT_ERROR';
      onError?.({ code, message: err?.message || '重试处理失败' });
    }
  }

  /**
   * Archive or rename conversation
   */
  static async updateConversation(
    conversationId: string,
    updates: { title?: string; status?: 'active' | 'archived' }
  ): Promise<AgentConversationRecord> {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/agent/conversations/${conversationId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates)
    });

    const json = await parseAgentJsonResponse(res);
    return json.conversation;
  }
}

