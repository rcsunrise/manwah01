import type { Request } from 'express';
import type { AgentContextSnapshot } from '../../src/types/creativeCanvas';

interface TestCanvasFixture {
  userId: string;
  projectId: string;
  canvasId: string;
  context?: AgentContextSnapshot;
}

interface TestFixtures {
  users?: string[];
  canvases?: TestCanvasFixture[];
}

export interface AgentRuntimeMetrics {
  textProviderCalls: number;
  mockTextProviderCalls: number;
  canvasNodeWrites: number;
  copyVersionWrites: number;
  typographySpecWrites: number;
  imageProviderCalls: number;
  billingCalls: number;
  toolCalls: number;
}

const EMPTY_METRICS: AgentRuntimeMetrics = {
  textProviderCalls: 0,
  mockTextProviderCalls: 0,
  canvasNodeWrites: 0,
  copyVersionWrites: 0,
  typographySpecWrites: 0,
  imageProviderCalls: 0,
  billingCalls: 0,
  toolCalls: 0
};

let metrics: AgentRuntimeMetrics = { ...EMPTY_METRICS };

export const isAgentChatTestMode = () => process.env.AGENT_CHAT_TEST_MODE === 'true';

function readFixtures(): TestFixtures {
  if (!isAgentChatTestMode()) return {};
  try {
    return JSON.parse(process.env.AGENT_CHAT_TEST_FIXTURES || '{}') as TestFixtures;
  } catch {
    return {};
  }
}

export function authenticateAgentTestRequest(req: Request): string | null {
  if (!isAgentChatTestMode()) return null;
  const expectedSecret = process.env.AGENT_CHAT_TEST_SECRET || '';
  const suppliedSecret = String(req.headers['x-agent-test-secret'] || '');
  const userId = String(req.headers['x-agent-test-user-id'] || '');
  const fixtures = readFixtures();
  if (!expectedSecret || suppliedSecret !== expectedSecret || !fixtures.users?.includes(userId)) {
    return null;
  }
  return userId;
}

export function getAgentTestCanvasFixture(userId: string, projectId: string, canvasId: string): TestCanvasFixture | null {
  if (!isAgentChatTestMode()) return null;
  return readFixtures().canvases?.find(item => (
    item.userId === userId && item.projectId === projectId && item.canvasId === canvasId
  )) || null;
}

export function validateAgentTestContext(
  userId: string,
  projectId: string,
  canvasId: string,
  snapshot: AgentContextSnapshot
): boolean {
  const fixture = getAgentTestCanvasFixture(userId, projectId, canvasId);
  if (!fixture) return false;
  const expected = fixture.context || {};
  const versionKeys: Array<keyof AgentContextSnapshot> = [
    'productDnaVersionId',
    'assetVersionId',
    'copyVersionId',
    'typographySpecId'
  ];
  return versionKeys.every(key => !snapshot[key] || snapshot[key] === expected[key]);
}

export function getAgentTestScenario(req: Request): 'success' | 'slow' | 'timeout' {
  if (!isAgentChatTestMode()) return 'success';
  const raw = String(req.headers['x-agent-test-scenario'] || 'success');
  return raw === 'slow' || raw === 'timeout' ? raw : 'success';
}

export function incrementAgentMetric(key: keyof AgentRuntimeMetrics): void {
  metrics[key] += 1;
}

export function getAgentRuntimeMetrics(): AgentRuntimeMetrics {
  return { ...metrics };
}

export function resetAgentRuntimeMetrics(): void {
  metrics = { ...EMPTY_METRICS };
}
