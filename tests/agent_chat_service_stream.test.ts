import { describe, expect, it, vi } from 'vitest';
import { consumeAgentSseStream } from '../src/services/agentChatService';

function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    }
  });
}

describe('AgentChatService SSE parser', () => {
  it('preserves event state across arbitrary network chunk boundaries', async () => {
    const onDelta = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const completedMessage = { id: 'assistant-1', content: { text: '你好' } };
    await consumeAgentSseStream(chunkedStream([
      'event: response.del',
      'ta\ndata: {"type":"response.delta","delta":"你"}\n\n',
      'event: response.delta\ndata: {"type":"response.delta","delta":"好"}\n',
      '\nevent: response.completed\ndata: {"type":"response.completed","message":',
      `${JSON.stringify(completedMessage)}}\n\n`
    ]), { onDelta, onComplete, onError });

    expect(onDelta.mock.calls.map(call => call[0]).join('')).toBe('你好');
    expect(onComplete).toHaveBeenCalledWith(completedMessage);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a stream that ends without a terminal event', async () => {
    const onError = vi.fn();
    await consumeAgentSseStream(chunkedStream([
      'event: response.delta\ndata: {"type":"response.delta","delta":"局部"}\n\n'
    ]), { onError });
    expect(onError).toHaveBeenCalledWith({
      code: 'STREAM_INTERRUPTED',
      message: '响应流在完成前中断'
    });
  });
});
