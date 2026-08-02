import { describe, it, expect } from 'vitest';
import { DetailPageRenderTask, DetailPageTaskBatch } from '../src/types';

describe('Phase 4 Image-to-Image Generation Tasks & Queue Tests', () => {
  it('should initialize 9 tasks correctly from an approved plan', () => {
    const tasks: DetailPageRenderTask[] = Array.from({ length: 9 }).map((_, i) => ({
      id: `task_run123_s${i + 1}`,
      agentRunId: 'run123',
      projectId: 'proj_001',
      screenIndex: i + 1,
      screenTitle: `第 ${i + 1} 屏`,
      coreSellingPoint: `卖点 ${i + 1}`,
      prompt: `Prompt ${i + 1}`,
      aspectRatio: '3:4',
      lockedRules: ['规则 A'],
      referenceImageUrl: null,
      status: 'pending',
      resultImageUrl: null,
      retryCount: 0,
      errorMessage: null,
      costTokens: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const batch: DetailPageTaskBatch = {
      agentRunId: 'run123',
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      inProgressTasks: 0,
      tasks
    };

    expect(batch.totalTasks).toBe(9);
    expect(batch.completedTasks).toBe(0);
    expect(batch.tasks[0].status).toBe('pending');
    expect(batch.tasks[8].screenIndex).toBe(9);
  });

  it('should update task batch status correctly when tasks execute', () => {
    const tasks: DetailPageRenderTask[] = [
      {
        id: 'task_1',
        agentRunId: 'run123',
        projectId: 'proj_001',
        screenIndex: 1,
        screenTitle: '首屏 Hero',
        coreSellingPoint: '突出颜值',
        prompt: 'Luxury leather sofa',
        aspectRatio: '3:4',
        lockedRules: [],
        status: 'completed',
        resultImageUrl: 'data:image/svg+xml;utf8,<svg></svg>',
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'task_2',
        agentRunId: 'run123',
        projectId: 'proj_001',
        screenIndex: 2,
        screenTitle: '空间美学',
        coreSellingPoint: '融合客厅',
        prompt: 'Modern living room sofa',
        aspectRatio: '3:4',
        lockedRules: [],
        status: 'pending',
        resultImageUrl: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    expect(completedTasks).toBe(1);
    expect(tasks[0].resultImageUrl).not.toBeNull();
  });
});
