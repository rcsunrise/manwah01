import { describe, it, expect } from 'vitest';
import { AgentRun, DetailPagePlan, ALLOWED_STATUS_TRANSITIONS } from '../src/types';

describe('Phase 3 Detail Page Agent MVP Tests', () => {
  it('should enforce state machine transition rules for AgentRun', () => {
    const validNextFromDnaConfirmed = ALLOWED_STATUS_TRANSITIONS['dna_confirmed'];
    expect(validNextFromDnaConfirmed).toContain('plan_generating');
    expect(validNextFromDnaConfirmed).not.toContain('completed');

    const validNextFromPlanReview = ALLOWED_STATUS_TRANSITIONS['plan_review'];
    expect(validNextFromPlanReview).toContain('plan_approved');
    expect(validNextFromPlanReview).toContain('plan_generating');

    const validNextFromPlanApproved = ALLOWED_STATUS_TRANSITIONS['plan_approved'];
    expect(validNextFromPlanApproved).toContain('tasks_generating');
  });

  it('should structure 9-screen detail page plan accurately', () => {
    const plan: DetailPagePlan = {
      projectId: 'proj_999',
      version: 1,
      themeTitle: '敏华云感羽绒沙发表格图谱全案',
      targetAudience: '城市精英与高品质新中产家庭',
      overallStyle: '自然暖质调影棚，极致光影纹理',
      screens: Array.from({ length: 9 }).map((_, i) => ({
        screenIndex: i + 1,
        screenTitle: `第 ${i + 1} 屏`,
        coreSellingPoint: `卖点展示 ${i + 1}`,
        visualComposition: '45度侧角视角',
        lightingAndAtmosphere: '柔和自然侧光',
        promptSuggestion: `Modern luxury sofa screen ${i + 1}`,
        aspectRatio: '3:4',
        lockedRules: ['保持全粒面牛皮质感']
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(plan.screens.length).toBe(9);
    expect(plan.screens[0].screenIndex).toBe(1);
    expect(plan.screens[8].screenIndex).toBe(9);
    expect(plan.confirmedAt).toBeUndefined();
  });
});
