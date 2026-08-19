import { beforeEach, describe, expect, it } from 'vitest';
import {
  authenticateAgentTestRequest,
  getAgentRuntimeMetrics,
  getAgentTestCanvasFixture,
  incrementAgentMetric,
  resetAgentRuntimeMetrics,
  validateAgentTestContext
} from '../server/agentChat/runtimeTestSupport';

const userId = '10000000-0000-4000-8000-000000000001';
const context = {
  projectId: 'project-a',
  canvasId: 'canvas-a',
  activeSceneKey: 'scene-01',
  assetVersionId: 'asset-a'
};

describe('G0-1R explicit runtime test adapter', () => {
  beforeEach(() => {
    process.env.AGENT_CHAT_TEST_MODE = 'true';
    process.env.AGENT_CHAT_TEST_SECRET = 'unit-test-secret';
    process.env.AGENT_CHAT_TEST_FIXTURES = JSON.stringify({
      users: [userId],
      canvases: [{ userId, projectId: 'project-a', canvasId: 'canvas-a', context }]
    });
    resetAgentRuntimeMetrics();
  });

  it('requires both the secret and an allow-listed user', () => {
    const request = { headers: {
      'x-agent-test-secret': 'unit-test-secret',
      'x-agent-test-user-id': userId
    } } as any;
    expect(authenticateAgentTestRequest(request)).toBe(userId);
    request.headers['x-agent-test-secret'] = 'wrong';
    expect(authenticateAgentTestRequest(request)).toBeNull();
  });

  it('is unreachable when explicit test mode is disabled', () => {
    process.env.AGENT_CHAT_TEST_MODE = 'false';
    const request = { headers: {
      'x-agent-test-secret': 'unit-test-secret',
      'x-agent-test-user-id': userId
    } } as any;
    expect(authenticateAgentTestRequest(request)).toBeNull();
  });

  it('binds fixtures and context versions to one user/project/canvas', () => {
    expect(getAgentTestCanvasFixture(userId, 'project-a', 'canvas-a')).not.toBeNull();
    expect(getAgentTestCanvasFixture(userId, 'project-a', 'canvas-b')).toBeNull();
    expect(validateAgentTestContext(userId, 'project-a', 'canvas-a', context)).toBe(true);
    expect(validateAgentTestContext(userId, 'project-a', 'canvas-a', { ...context, assetVersionId: 'foreign' })).toBe(false);
  });

  it('reports explicit zero-side-effect counters', () => {
    incrementAgentMetric('mockTextProviderCalls');
    expect(getAgentRuntimeMetrics()).toEqual({
      textProviderCalls: 0,
      mockTextProviderCalls: 1,
      canvasNodeWrites: 0,
      copyVersionWrites: 0,
      typographySpecWrites: 0,
      imageProviderCalls: 0,
      billingCalls: 0,
      toolCalls: 0
    });
  });
});
