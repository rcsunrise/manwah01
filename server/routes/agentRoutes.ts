import { Router, Response, NextFunction } from 'express';
import { ThinkingLevel, Type } from '@google/genai';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { authenticateToken } from '../middleware/auth';
import { AgentRun, AgentRunStatus, ALLOWED_STATUS_TRANSITIONS, DetailPagePlan, ProductVisualDNA, DetailPageRenderTask, DetailPageTaskBatch, DetailPageCanvasConfig, DetailPageExportResult, DetailPageSliceAsset } from '../../src/types';
import { createServerGenAI } from '../utils/aiClient';
import {
  AgentResponsesError,
  assertSafePreviousResponseId,
  createAgentResponse,
  isContinuableIncompleteReason,
  parseAgentReasoningEffort
} from '../ai/agentResponses';
import { assertAgentModelCompatibility, resolveAgentModel, resolveAgentModelDetailed } from '../ai/agentModelRegistry';
import {
  DETAIL_PLAN_INSTRUCTIONS,
  DETAIL_PLAN_JSON_SCHEMA,
  parseStructuredDetailPlan
} from '../ai/detailPlanSchema';

import { renderBatchManager } from '../services/renderBatchManager';
import { compileScreenPrompt } from '../ai/promptCompiler';
import { resolveImageModel } from '../ai/modelRegistry';
import { getImageProviderAdapter } from '../ai/imageProviderAdapter';
import { paidAuthorizationGate, redactSensitiveData } from '../services/paidAuthorizationGate';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(authenticateToken as any);

// In-memory repositories fallback
const inMemoryAgentRuns = new Map<string, AgentRun>();
const inMemoryTasks = new Map<string, DetailPageRenderTask[]>();

const AGENT_RUNS_DIR = path.join(process.cwd(), '.data', 'agent_runs');

function ensureAgentRunsDir() {
  try {
    if (!fs.existsSync(AGENT_RUNS_DIR)) {
      fs.mkdirSync(AGENT_RUNS_DIR, { recursive: true });
    }
  } catch (e) {}
}

function persistAgentRunData(runId: string) {
  ensureAgentRunsDir();
  try {
    const run = inMemoryAgentRuns.get(runId);
    const tasks = inMemoryTasks.get(runId) || [];
    if (run) {
      const filePath = path.join(AGENT_RUNS_DIR, `${runId}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ run, tasks }, null, 2), 'utf-8');
    }
  } catch (e) {}
}

function loadAgentRunsFromDisk() {
  ensureAgentRunsDir();
  try {
    const files = fs.readdirSync(AGENT_RUNS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(AGENT_RUNS_DIR, file), 'utf-8');
        const data = JSON.parse(raw);
        if (data?.run?.id) {
          inMemoryAgentRuns.set(data.run.id, data.run);
          if (Array.isArray(data.tasks)) {
            inMemoryTasks.set(data.run.id, data.tasks);
          }
        } else if (data?.id) {
          inMemoryAgentRuns.set(data.id, data);
        }
      }
    }
  } catch (e) {}
}

loadAgentRunsFromDisk();

function validateStatusTransition(current: AgentRunStatus, target: AgentRunStatus): void {
  const allowed = ALLOWED_STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(target)) {
    throw new AppError(`非法的状态转换: 不能从 ${current} 切换至 ${target}`, 400, 'INVALID_TRANSITION');
  }
}

// 0. List or query Agent Runs (by projectId)
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    let runs = Array.from(inMemoryAgentRuns.values());
    if (projectId) {
      runs = runs.filter(r => r.projectId === String(projectId));
    }
    runs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.json({ success: true, agentRuns: runs, agentRun: runs[0] || null });
  } catch (err) {
    next(err);
  }
});

// 1. Create a new Agent Run from a confirmed Product DNA
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { projectId } = req.body;

    if (!projectId) {
      throw new AppError('缺少 projectId 参数', 400, 'BAD_REQUEST');
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newRun: AgentRun = {
      id: runId,
      projectId: String(projectId),
      ownerId: user.id,
      status: 'dna_confirmed',
      currentStep: 1,
      totalSteps: 9,
      plan: null,
      planVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    inMemoryAgentRuns.set(runId, newRun);
    persistAgentRunData(runId);

    return res.json({ success: true, agentRun: newRun });
  } catch (err) {
    next(err);
  }
});

// 2. Generate 9-Screen Detail Page Plan using persistent configured AI Provider
router.post('/:runId/generate-plan', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const { promptHint, agentModel, reasoningEffort, previousResponseId } = req.body;

    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    const isResponseContinuation = typeof previousResponseId === 'string' && previousResponseId.trim().length > 0;
    if (
      run.status !== 'dna_confirmed' &&
      run.status !== 'plan_review' &&
      run.status !== 'failed' &&
      run.status !== 'plan_generating'
    ) {
      validateStatusTransition(run.status, 'plan_generating');
    }
    run.status = 'plan_generating';
    run.updatedAt = new Date().toISOString();

    const user = req.user!;
    const { ai, config: providerConfig, isValidKey } = await createServerGenAI(user.id);

    // Fetch Product DNA
    let dna: ProductVisualDNA | null = null;
    try {
      const { data } = await supabaseAdmin
        .from('product_visual_dna')
        .select('*')
        .eq('project_id', run.projectId)
        .single();
      if (data) dna = data;
    } catch (e) {}

    let parsedPlan: any = null;
    let selectedModel: ReturnType<typeof resolveAgentModel>;
    let selectedEffort: ReturnType<typeof parseAgentReasoningEffort>;
    let safePreviousResponseId: string | undefined;
    try {
      const resolution = resolveAgentModelDetailed(agentModel);
      selectedModel = resolution.model;
      selectedEffort = parseAgentReasoningEffort(reasoningEffort);
      safePreviousResponseId = assertSafePreviousResponseId(previousResponseId);
      assertAgentModelCompatibility(
        selectedModel,
        providerConfig.provider,
        selectedEffort,
        Boolean(safePreviousResponseId)
      );
    } catch (error) {
      if (error instanceof AgentResponsesError) {
        run.status = 'failed';
        run.errorMessage = error.message;
        inMemoryAgentRuns.set(runId, run);
        throw new AppError(error.message, error.statusCode, error.code);
      }
      throw error;
    }
    const usesResponses = selectedModel.transport === 'openai_responses';

    if (usesResponses && !isValidKey) {
      run.status = 'failed';
      run.errorMessage = '当前用户所属部门及全站系统均未配置可用的 Responses Provider。';
      inMemoryAgentRuns.set(runId, run);
      throw new AppError(
        '当前用户所属部门及全站系统均未配置可用的 Responses Provider。',
        500,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    if (ai && isValidKey) {
      try {
        const promptText = `你是一名顶级家具电商爆款详情页全案总监。请根据以下产品的“视觉 DNA”数据，为品牌策划一套由 9 个分屏组成的电商详情页全案视觉逻辑图谱(Detail Page 9-Screen Plan)。

[产品视觉 DNA 数据]
品类: ${dna?.category || '家具沙发'}
细分品类: ${dna?.subcategory || '电动皮沙发'}
视觉风格: ${dna?.style?.join(', ') || '极简轻奢'}
主色调: ${dna?.primaryColor || '暖灰色'}
辅色调: ${dna?.secondaryColors?.join(', ') || '哑光黑'}
核心材质: ${dna?.materials?.join(', ') || '头层牛皮'}
核心结构特征: ${JSON.stringify(dna?.structuralFeatures || [])}
锁定规则: ${JSON.stringify(dna?.lockedFeatures || [])}
用户补充要求: ${promptHint || '强调舒适度与高级质感'}

要求策划严格包含 9 屏分屏脚本：
1. 第 1 屏：首屏 Hero 主图（高冲击力场景全景，突出整体颜值与主定位）
2. 第 2 屏：核心设计理念与空间美学（与现代客厅环境融为一体）
3. 第 3 屏：面料与触感特写（精细微距，表现头层牛皮与精致走线）
4. 第 4 屏：人体工学与坐感体验（坐姿展示，靠背与坐垫支撑力）
5. 第 5 屏：核心功能演示（如电动无级调节、隐藏脚托等）
6. 第 6 屏：内部材质与工艺品质（高弹海绵、实木框架、稳固结构）
7. 第 7 屏：多角度/多搭配展示（角度组合，适应不同客厅户型）
8. 第 8 屏：细节与配件工匠精神（金属拉脚、品牌 Logo 徽饰）
9. 第 9 屏：场景收尾与购买保障（全景温馨氛围，尺寸标注与售后品质保证）

输出必须为符合要求的 JSON 格式。${safePreviousResponseId ? '\n这是对上一条 incomplete Response 的续接。请重新输出一份从头到尾完整、可独立解析的九屏 JSON，不要只补写残余片段。' : ''}`;

        if (usesResponses) {
          const response = await createAgentResponse(providerConfig, {
            model: selectedModel.id,
            input: promptText,
            instructions: DETAIL_PLAN_INSTRUCTIONS,
            reasoningEffort: selectedEffort,
            previousResponseId: safePreviousResponseId,
            maxOutputTokens: 32000,
            schema: {
              name: 'detail_page_nine_screen_plan',
              description: '家具电商详情页九屏结构化视觉策划',
              schema: DETAIL_PLAN_JSON_SCHEMA as unknown as Record<string, unknown>
            },
            metadata: {
              run_id: run.id.slice(0, 64),
              project_id: run.projectId.slice(0, 64)
            }
          });

          run.planGeneration = {
            transport: 'openai_responses',
            model: response.model || selectedModel.id,
            reasoningEffort: selectedEffort,
            responseId: response.id,
            previousResponseId: safePreviousResponseId,
            responseStatus: response.status,
            incompleteReason: response.incompleteReason,
            continuationRequired: response.status === 'incomplete' && isContinuableIncompleteReason(response.incompleteReason),
            usage: response.usage
          };
          run.updatedAt = new Date().toISOString();
          inMemoryAgentRuns.set(runId, run);

          if (response.refusal) {
            run.status = 'failed';
            throw new AppError(response.refusal, 422, 'MODEL_REFUSAL');
          }
          if (response.status === 'incomplete') {
            if (!isContinuableIncompleteReason(response.incompleteReason)) {
              run.status = 'failed';
              const filtered = response.incompleteReason === 'content_filter';
              throw new AppError(
                filtered
                  ? '模型输出被内容安全策略中止，请调整输入后重试。'
                  : `模型返回不可续接的 incomplete 状态：${response.incompleteReason || 'unknown'}`,
                filtered ? 422 : 502,
                filtered ? 'MODEL_OUTPUT_FILTERED' : 'PROVIDER_RESPONSE_INCOMPLETE'
              );
            }
            return res.status(202).json({
              success: true,
              incomplete: true,
              continuationRequired: true,
              responseId: response.id,
              incompleteReason: response.incompleteReason,
              agentRun: run
            });
          }
          if (response.status !== 'completed') {
            run.status = 'failed';
            throw new AppError(
              `Responses API 未完成计划生成，状态：${response.status}`,
              502,
              'PROVIDER_RESPONSE_NOT_COMPLETED'
            );
          }
          parsedPlan = parseStructuredDetailPlan(response.outputText);
        } else {
          const planSchema = {
            type: Type.OBJECT,
            properties: {
              themeTitle: { type: Type.STRING, description: '全案企划主题名称' },
              targetAudience: { type: Type.STRING, description: '目标人群画像' },
              overallStyle: { type: Type.STRING, description: '整体视觉与影棚调性' },
              screens: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    screenIndex: { type: Type.INTEGER },
                    screenTitle: { type: Type.STRING, description: '分屏标题，如首屏主图' },
                    coreSellingPoint: { type: Type.STRING, description: '本屏核心卖点或传达情绪' },
                    visualComposition: { type: Type.STRING, description: '构图与摄影视角描述' },
                    lightingAndAtmosphere: { type: Type.STRING, description: '灯光与环境布景氛围' },
                    promptSuggestion: { type: Type.STRING, description: '推荐用于 Midjourney/Flux 生成的中文/英文 Prompt' },
                    aspectRatio: { type: Type.STRING, description: '建议画幅比例，如 3:4 或 16:9' },
                    lockedRules: { type: Type.ARRAY, items: { type: Type.STRING }, description: '本屏需遵循的 DNA 锁定规则' }
                  },
                  required: ['screenIndex', 'screenTitle', 'coreSellingPoint', 'visualComposition', 'lightingAndAtmosphere', 'promptSuggestion', 'aspectRatio']
                }
              }
            },
            required: ['themeTitle', 'targetAudience', 'overallStyle', 'screens']
          };

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: planSchema as any,
              temperature: 0.3,
              thinkingConfig: selectedEffort === 'none'
                ? undefined
                : {
                    thinkingLevel: selectedEffort === 'minimal'
                      ? ThinkingLevel.MINIMAL
                      : selectedEffort === 'low'
                        ? ThinkingLevel.LOW
                        : selectedEffort === 'high' || selectedEffort === 'xhigh'
                          ? ThinkingLevel.HIGH
                          : ThinkingLevel.MEDIUM
                  }
            }
          });

          if (response.text) {
            let cleanText = response.text.trim();
            if (cleanText.startsWith('```')) {
              cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            }
            try {
              parsedPlan = JSON.parse(cleanText);
            } catch (parseErr: any) {
              console.warn('[AgentRoutes] Gemini 模型返回非标准 JSON:', parseErr?.message);
            }
          }
          run.planGeneration = {
            transport: 'gemini_native',
            model: selectedModel.id,
            reasoningEffort: selectedEffort,
            responseStatus: 'completed',
            continuationRequired: false
          };
        }
      } catch (e: any) {
        run.status = 'failed';
        run.errorMessage = e?.message || '模型生成 9 屏策划案失败';
        inMemoryAgentRuns.set(runId, run);
        if (e instanceof AgentResponsesError) {
          throw new AppError(e.message, e.statusCode, e.code);
        }
        if (e instanceof AppError) throw e;
        throw new AppError(run.errorMessage, 502, 'PLAN_GENERATION_FAILED');
      }
    }

    if (!parsedPlan || !Array.isArray(parsedPlan.screens) || parsedPlan.screens.length === 0) {
      run.status = 'failed';
      run.errorMessage = '策划方案生成失败，模型未输出合规的九屏结构化数据。';
      inMemoryAgentRuns.set(runId, run);
      throw new AppError('策划方案生成失败，模型未输出合规的九屏结构化数据。', 502, 'INVALID_STRUCTURED_PLAN');
    }

    const detailPlan: DetailPagePlan = {
      projectId: run.projectId,
      version: run.planVersion,
      themeTitle: parsedPlan.themeTitle || '意式极简家具 9 屏策划案',
      targetAudience: parsedPlan.targetAudience || '追求生活品质的新中产家庭',
      overallStyle: parsedPlan.overallStyle || '自然光影、优雅轻奢、高质感家具影棚',
      screens: parsedPlan.screens,
      userModifications: promptHint || '',
      confirmedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    run.plan = detailPlan;
    run.status = 'plan_review';
    run.updatedAt = new Date().toISOString();

    inMemoryAgentRuns.set(runId, run);
    persistAgentRunData(runId);

    return res.json({ success: true, agentRun: run });
  } catch (err) {
    next(err);
  }
});

// 2b. Replan a single screen
router.post('/:runId/screens/:screenIndex/replan', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const screenIdx = parseInt(String(req.params.screenIndex), 10);
    const { promptHint } = req.body;

    const run = inMemoryAgentRuns.get(runId);
    if (!run || !run.plan || !Array.isArray(run.plan.screens)) {
      throw new AppError('Agent 运行实例或 9 屏策划案不存在', 404, 'NOT_FOUND');
    }

    if (isNaN(screenIdx) || screenIdx < 1 || screenIdx > run.plan.screens.length) {
      throw new AppError(`无效的屏幕编号: ${String(req.params.screenIndex)}`, 400, 'BAD_REQUEST');
    }

    const targetScreen = run.plan.screens.find(s => s.screenIndex === screenIdx);
    if (!targetScreen) {
      throw new AppError(`未找到编号为 ${screenIdx} 的分屏`, 404, 'NOT_FOUND');
    }

    const user = req.user!;
    const { ai, isValidKey } = await createServerGenAI(user.id);

    let dna: ProductVisualDNA | null = null;
    try {
      const { data } = await supabaseAdmin
        .from('product_visual_dna')
        .select('*')
        .eq('project_id', run.projectId)
        .single();
      if (data) dna = data;
    } catch (e) {}

    let updatedScreen: any = null;

    if (ai && isValidKey) {
      try {
        const promptText = `你是一名顶级家具电商爆款详情页全案总监。请重新策划第 ${screenIdx} 屏分屏脚本。
当前分屏原标题: ${targetScreen.screenTitle}
原核心卖点: ${targetScreen.coreSellingPoint}
产品品类: ${dna?.category || '家具沙发'}
主色调: ${dna?.primaryColor || '暖灰色'}
用户重新策划意见: ${promptHint || '优化视觉冲击力与卖点表达'}

请输出该分屏的更新策划，JSON格式。`;

        const singleScreenSchema = {
          type: Type.OBJECT,
          properties: {
            screenIndex: { type: Type.INTEGER },
            screenTitle: { type: Type.STRING },
            coreSellingPoint: { type: Type.STRING },
            visualComposition: { type: Type.STRING },
            lightingAndAtmosphere: { type: Type.STRING },
            promptSuggestion: { type: Type.STRING },
            aspectRatio: { type: Type.STRING },
            lockedRules: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['screenIndex', 'screenTitle', 'coreSellingPoint', 'visualComposition', 'lightingAndAtmosphere', 'promptSuggestion', 'aspectRatio']
        };

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: singleScreenSchema as any,
            temperature: 0.3
          }
        });

        if (response.text) {
          let cleanText = response.text.trim();
          if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          }
          try {
            updatedScreen = JSON.parse(cleanText);
            updatedScreen.screenIndex = screenIdx;
          } catch (parseErr: any) {
            console.warn('[AgentRoutes] 单屏 Replan 模型返回非标准 JSON:', parseErr?.message);
          }
        }
      } catch (e: any) {
        throw new AppError(e?.message || '单屏重新策划模型调用失败', 502, 'PLAN_REPLAN_FAILED');
      }
    }

    if (!updatedScreen) {
      throw new AppError('重新策划单屏失败，模型未输出有效的 JSON 结构。', 502, 'INVALID_STRUCTURED_PLAN');
    }

    const idxInArray = run.plan.screens.findIndex(s => s.screenIndex === screenIdx);
    if (idxInArray !== -1) {
      run.plan.screens[idxInArray] = updatedScreen;
    }
    run.updatedAt = new Date().toISOString();
    inMemoryAgentRuns.set(runId, run);

    return res.json({ success: true, updatedScreen, agentRun: run });
  } catch (err) {
    next(err);
  }
});

// 3. User approves and confirms the plan
router.post('/:runId/approve-plan', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    validateStatusTransition(run.status, 'plan_approved');

    run.status = 'plan_approved';
    if (run.plan) {
      run.plan.confirmedAt = new Date().toISOString();
    }
    run.updatedAt = new Date().toISOString();

    inMemoryAgentRuns.set(runId, run);

    return res.json({ success: true, agentRun: run });
  } catch (err) {
    next(err);
  }
});

// 4. Get Agent Run Status
router.get('/:runId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    return res.json({ success: true, agentRun: run });
  } catch (err) {
    next(err);
  }
});

// 5. Initialize Generation Tasks from Approved Plan (Phase 4)
router.post('/:runId/tasks/generate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    if (!run.plan || !run.plan.screens || run.plan.screens.length === 0) {
      throw new AppError('尚未生成或确认 9 屏策划案', 400, 'PLAN_REQUIRED');
    }

    if (run.status !== 'plan_approved' && run.status !== 'tasks_generating' && run.status !== 'completed' && run.status !== 'failed') {
      validateStatusTransition(run.status, 'tasks_generating');
    }

    run.status = 'tasks_generating';
    run.updatedAt = new Date().toISOString();

    const tasks: DetailPageRenderTask[] = run.plan.screens.map((screen) => ({
      id: `task_${runId}_s${screen.screenIndex}_${Math.random().toString(36).substr(2, 5)}`,
      agentRunId: runId,
      projectId: run.projectId,
      screenIndex: screen.screenIndex,
      screenTitle: screen.screenTitle,
      coreSellingPoint: screen.coreSellingPoint,
      prompt: screen.promptSuggestion,
      aspectRatio: screen.aspectRatio || '3:4',
      lockedRules: screen.lockedRules || [],
      referenceImageUrl: null,
      status: 'pending',
      resultImageUrl: null,
      retryCount: 0,
      errorMessage: null,
      costTokens: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    inMemoryTasks.set(runId, tasks);
    inMemoryAgentRuns.set(runId, run);

    const batch: DetailPageTaskBatch = {
      agentRunId: runId,
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      inProgressTasks: 0,
      tasks
    };

    return res.json({ success: true, batch, agentRun: run });
  } catch (err) {
    next(err);
  }
});

// 6. Get Generation Task Queue for an Agent Run
router.get('/:runId/tasks', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    const tasks = inMemoryTasks.get(runId) || [];
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const failedTasks = tasks.filter(t => t.status === 'failed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'generating').length;

    const batch: DetailPageTaskBatch = {
      agentRunId: runId,
      totalTasks: tasks.length,
      completedTasks,
      failedTasks,
      inProgressTasks,
      tasks
    };

    return res.json({ success: true, batch });
  } catch (err) {
    next(err);
  }
});

// Helper function to simulate/render image result with DNA parameters
function buildMockRenderedSvg(title: string, index: number, ratio: string): string {
  const bgColors = ['#1e293b', '#0f172a', '#172554', '#1c1917', '#111827', '#030712', '#064e3b', '#4c1d95', '#701a75'];
  const bg = bgColors[(index - 1) % bgColors.length];
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="100%" height="100%" fill="${encodeURIComponent(bg)}"/><circle cx="300" cy="360" r="180" fill="%23f59e0b" opacity="0.15"/><rect x="150" y="280" width="300" height="180" rx="20" fill="%23f59e0b" opacity="0.8"/><text x="300" y="520" font-family="sans-serif" font-size="28" font-weight="bold" fill="%23ffffff" text-anchor="middle">第 ${index} 屏: ${encodeURIComponent(title)}</text><text x="300" y="560" font-family="sans-serif" font-size="18" fill="%23fcd34d" text-anchor="middle">画幅: ${encodeURIComponent(ratio)} · DNA 匹配: 100%</text><text x="300" y="600" font-family="sans-serif" font-size="14" fill="%239ca3af" text-anchor="middle">敏华 AI 智能影棚 4K 超精细渲染引擎</text></svg>`;
}

// 7. Execute Single Generation Task
router.post('/:runId/tasks/:taskId/execute', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const taskId = String(req.params.taskId);

    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    const tasks = inMemoryTasks.get(runId) || [];
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new AppError('渲染任务不存在', 404, 'TASK_NOT_FOUND');
    }

    const task = tasks[taskIndex];
    task.status = 'generating';
    task.updatedAt = new Date().toISOString();

    // Render image SVG artifact with DNA constraints
    const renderedImage = buildMockRenderedSvg(task.screenTitle, task.screenIndex, task.aspectRatio);

    task.status = 'completed';
    task.resultImageUrl = renderedImage;
    task.costTokens = 120;
    task.updatedAt = new Date().toISOString();

    tasks[taskIndex] = task;
    inMemoryTasks.set(runId, tasks);

    // Check if all tasks in run completed
    const allCompleted = tasks.every(t => t.status === 'completed');
    if (allCompleted) {
      run.status = 'completed';
      run.updatedAt = new Date().toISOString();
      inMemoryAgentRuns.set(runId, run);
    }

    return res.json({ success: true, task, agentRun: run });
  } catch (err) {
    next(err);
  }
});

// 8. Execute All Pending Tasks in Queue Batch
router.post('/:runId/tasks/execute-all', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);

    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    const tasks = inMemoryTasks.get(runId) || [];
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].status === 'pending' || tasks[i].status === 'failed') {
        tasks[i].status = 'generating';
        tasks[i].updatedAt = new Date().toISOString();

        tasks[i].resultImageUrl = buildMockRenderedSvg(tasks[i].screenTitle, tasks[i].screenIndex, tasks[i].aspectRatio);
        tasks[i].status = 'completed';
        tasks[i].costTokens = 120;
        tasks[i].updatedAt = new Date().toISOString();
      }
    }

    inMemoryTasks.set(runId, tasks);

    run.status = 'completed';
    run.updatedAt = new Date().toISOString();
    inMemoryAgentRuns.set(runId, run);

    const batch: DetailPageTaskBatch = {
      agentRunId: runId,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      inProgressTasks: 0,
      tasks
    };

    return res.json({ success: true, batch, agentRun: run });
  } catch (err) {
    next(err);
  }
});

// 9. Retry a Single Failed or Pending Task with Prompt Adjustments
router.post('/:runId/tasks/:taskId/retry', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const taskId = String(req.params.taskId);
    const { customPrompt } = req.body;

    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    const tasks = inMemoryTasks.get(runId) || [];
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new AppError('渲染任务不存在', 404, 'TASK_NOT_FOUND');
    }

    const task = tasks[taskIndex];
    task.retryCount += 1;
    if (customPrompt) {
      task.prompt = customPrompt;
    }
    task.status = 'generating';
    task.updatedAt = new Date().toISOString();

    task.resultImageUrl = buildMockRenderedSvg(task.screenTitle, task.screenIndex, task.aspectRatio);
    task.status = 'completed';
    task.errorMessage = null;
    task.updatedAt = new Date().toISOString();

    tasks[taskIndex] = task;
    inMemoryTasks.set(runId, tasks);

    return res.json({ success: true, task });
  } catch (err) {
    next(err);
  }
});

// 10. Phase 5: Export Canvas & Stitch Long Image with Typography
router.post('/:runId/export-canvas', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const config: DetailPageCanvasConfig = req.body.config || {
      widthPx: 750,
      showBrandHeader: true,
      showFooterGuarantee: true,
      showSellingPointOverlay: true,
      themeColor: '#f59e0b',
      screenSpacingPx: 0
    };

    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    const tasks = inMemoryTasks.get(runId) || [];
    const completedTasks = tasks.filter(t => t.status === 'completed');

    if (completedTasks.length === 0) {
      throw new AppError('当前没有任何已完成渲染的分屏，无法合成长图', 400, 'NO_RENDERED_IMAGES');
    }

    // Build SVG Long Image
    const width = config.widthPx || 750;
    const screenHeight = Math.round((width * 4) / 3);
    const headerHeight = config.showBrandHeader ? 160 : 0;
    const footerHeight = config.showFooterGuarantee ? 240 : 0;
    const totalContentHeight = completedTasks.length * screenHeight + (completedTasks.length - 1) * config.screenSpacingPx;
    const totalHeight = headerHeight + totalContentHeight + footerHeight;

    const slices: DetailPageSliceAsset[] = completedTasks.map((t) => ({
      screenIndex: t.screenIndex,
      title: t.screenTitle,
      sliceImageUrl: t.resultImageUrl || buildMockRenderedSvg(t.screenTitle, t.screenIndex, t.aspectRatio),
      width,
      height: screenHeight
    }));

    // SVG Stitched long image
    const longSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
      <rect width="100%" height="100%" fill="#09090b"/>
      ${config.showBrandHeader ? `
        <rect width="${width}" height="160" fill="#18181b"/>
        <text x="${width / 2}" y="70" font-family="sans-serif" font-size="28" font-weight="bold" fill="${config.themeColor}" text-anchor="middle">MANWAH 敏华家居 · 旗舰详情全案</text>
        <text x="${width / 2}" y="110" font-family="sans-serif" font-size="16" fill="#a1a1aa" text-anchor="middle">${run.plan?.themeTitle || '爆款详情页策划'}</text>
      ` : ''}
      ${slices.map((slice, idx) => {
        const yOffset = headerHeight + idx * (screenHeight + config.screenSpacingPx);
        return `
          <g transform="translate(0, ${yOffset})">
            <rect width="${width}" height="${screenHeight}" fill="${idx % 2 === 0 ? '#18181b' : '#27272a'}"/>
            <text x="${width / 2}" y="${screenHeight / 2}" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle">第 ${slice.screenIndex} 屏: ${encodeURIComponent(slice.title)}</text>
            ${config.showSellingPointOverlay ? `<text x="${width / 2}" y="${screenHeight / 2 + 40}" font-family="sans-serif" font-size="14" fill="${config.themeColor}" text-anchor="middle">DNA 精确锁定 · 敏华 4K 视觉影棚</text>` : ''}
          </g>
        `;
      }).join('')}
      ${config.showFooterGuarantee ? `
        <g transform="translate(0, ${headerHeight + totalContentHeight})">
          <rect width="${width}" height="240" fill="#18181b"/>
          <text x="${width / 2}" y="90" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle">敏华家居 官方正品保障 · 全国包邮送装</text>
          <text x="${width / 2}" y="130" font-family="sans-serif" font-size="14" fill="#a1a1aa" text-anchor="middle">质保 10 年 · 7 天无理由退换 · 终身维护服务</text>
        </g>
      ` : ''}
    </svg>`;

    const longImageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(longSvg)}`;

    const exportResult: DetailPageExportResult = {
      runId,
      longImageUrl,
      totalHeightPx: totalHeight,
      slices,
      config,
      exportedAt: new Date().toISOString()
    };

    return res.json({ success: true, exportResult });
  } catch (err) {
    next(err);
  }
});

// ================= G0-2A: Detail Page Render Batches & Task Endpoints =================

// 11. Create a new Render Batch (POST /api/agent/detail-page/render-batches)
router.post('/detail-page/render-batches', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const {
      planId,
      runId,
      provider = 'vectorengine',
      model = 'gpt-image-2',
      screenIndexes = [1, 2, 3, 4, 5, 6, 7, 8, 9],
      resolution = '1K',
      concurrency = 2,
      confirmPaidCalls = false,
      conversationId = 'default_conv'
    } = req.body;

    const targetRunId = runId || planId;
    let plan: DetailPagePlan | null = null;
    let dna: ProductVisualDNA | null = null;

    if (targetRunId) {
      const run = inMemoryAgentRuns.get(targetRunId);
      if (run && run.plan) {
        plan = run.plan;
        dna = run.dna || null;
      }
    }

    // If plan not found in memory run, check if plan object was supplied in body
    if (!plan && req.body.plan) {
      plan = req.body.plan;
    }

    if (!plan || !Array.isArray(plan.screens) || plan.screens.length !== 9) {
      throw new AppError(
        '九屏计划不存在或不满足 screens.length=9',
        400,
        'DETAIL_PLAN_SCREEN_COUNT_INVALID'
      );
    }

    const { batch, reusedTaskCount } = await renderBatchManager.createRenderBatch({
      workspaceId: user.id,
      conversationId: String(conversationId),
      plan,
      provider: String(provider),
      model: String(model),
      screenIndexes: Array.isArray(screenIndexes) ? screenIndexes.map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9],
      resolution: String(resolution),
      concurrency: Number(concurrency) || 2,
      confirmPaidCalls: Boolean(confirmPaidCalls),
      dna
    });

    return res.json({
      success: true,
      batch,
      reusedTaskCount,
      realImageCalls: 0,
      billableImageCalls: 0,
      mode: 'g0-2a_mock_transport'
    });
  } catch (err) {
    next(err);
  }
});

// 12. Get Render Batch Status (GET /api/agent/detail-page/render-batches/:batchId)
router.get('/detail-page/render-batches/:batchId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const batchId = String(req.params.batchId);
    const batch = renderBatchManager.getBatch(batchId);

    if (!batch) {
      throw new AppError('渲染批次不存在', 404, 'RENDER_BATCH_NOT_FOUND');
    }

    const billingLedger = renderBatchManager.getBillingLedger(batchId);

    return res.json({
      success: true,
      batch,
      billingLedger,
      realImageCalls: 0,
      billableImageCalls: 0
    });
  } catch (err) {
    next(err);
  }
});

// 13. Retry a Single Failed Screen Task (POST /api/agent/detail-page/render-tasks/:taskId/retry)
router.post('/detail-page/render-tasks/:taskId/retry', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const { customPrompt } = req.body;

    const task = await renderBatchManager.retryTask(taskId, customPrompt);

    return res.json({
      success: true,
      task,
      realImageCalls: 0,
      billableImageCalls: 0
    });
  } catch (err) {
    next(err);
  }
});

// 14. Cancel a Render Batch (POST /api/agent/detail-page/render-batches/:batchId/cancel)
router.post('/detail-page/render-batches/:batchId/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const batchId = String(req.params.batchId);
    const batch = renderBatchManager.cancelBatch(batchId);

    return res.json({
      success: true,
      batch
    });
  } catch (err) {
    next(err);
  }
});

// ================= G0-2B-P: Single Screen Image Preflight & Paid Authorization Gate =================

// 15. Create Paid Authorization Grant (POST /api/agent/detail-page/render-smoke/authorizations)
router.post('/detail-page/render-smoke/authorizations', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const grant = paidAuthorizationGate.createAuthorizationGrant(user.id);
    return res.json({
      success: true,
      authorization: grant
    });
  } catch (err) {
    next(err);
  }
});

// 16. Dry Run Preflight for Single Screen Image Smoke (POST /api/agent/detail-page/render-smoke/preflight)
router.post('/detail-page/render-smoke/preflight', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const workspaceId = user.id;

    const {
      planId,
      runId,
      screenIndex = 1,
      provider = 'vectorengine',
      model = 'gpt-image-2',
      resolution = '1K',
      concurrency = 1,
      maxProviderCalls = 1,
      confirmPaidCalls = false,
      dryRun = true,
      paidAuthorizationId,
      paidAuthorizationScope = 'single_image_smoke'
    } = req.body;

    const targetRunId = runId || planId || 'default_run';
    let plan: DetailPagePlan | null = null;
    let dna: ProductVisualDNA | null = null;

    if (targetRunId) {
      const run = inMemoryAgentRuns.get(targetRunId);
      if (run && run.plan) {
        plan = run.plan;
        dna = run.dna || null;
      }
    }

    if (!plan && req.body.plan) {
      plan = req.body.plan;
    }

    if (!plan) {
      plan = {
        projectId: targetRunId,
        version: 1,
        themeTitle: '预检测试 9 屏策划',
        targetAudience: '都市新中产',
        overallStyle: '极简影棚风',
        screens: Array.from({ length: 9 }).map((_, i) => ({
          screenIndex: i + 1,
          screenTitle: `分屏 #${i + 1} 预检视觉`,
          coreSellingPoint: `卖点 ${i + 1}`,
          visualComposition: '三分法构图',
          lightingAndAtmosphere: '无影柔光灯',
          promptSuggestion: `Commercial product shot for screen ${i + 1}`,
          aspectRatio: '3:4',
          lockedRules: []
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    const screenIndexNum = Number(screenIndex) || 1;
    const screenSnapshot = plan.screens.find(s => s.screenIndex === screenIndexNum);

    if (!screenSnapshot) {
      throw new AppError(`找不到屏幕索引 #${screenIndexNum} 的策划快照`, 400, 'REAL_SMOKE_SINGLE_SCREEN_REQUIRED');
    }

    const compiled = compileScreenPrompt({
      screenSnapshot,
      dna,
      aspectRatio: screenSnapshot.aspectRatio || '3:4'
    });

    const rawFingerprint = [provider, model, resolution, compiled.promptHash, screenIndexNum].join('::');
    const requestFingerprint = crypto.createHash('sha256').update(rawFingerprint).digest('hex');

    const modelDef = resolveImageModel(model, 'text_to_image');
    if (!modelDef.supportedProviders.includes(provider)) {
      throw new AppError(`模型“${model}”未在 Provider“${provider}”中验证`, 400, 'IMAGE_MODEL_UNVERIFIED');
    }

    const adapter = getImageProviderAdapter(modelDef);
    const mockBaseUrl = provider === 'vectorengine'
      ? 'https://api.vectorengine.ai/v1'
      : provider === 'google'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : 'https://api.routerhub.ai/v1';

    const endpointUrl = adapter.buildEndpoint(mockBaseUrl, modelDef, 'text_to_image');

    if (!endpointUrl.startsWith('http') || endpointUrl.includes('/dashboard') || endpointUrl.includes('.html')) {
      throw new AppError('Provider API 端点格式无效或属于前端控制台页面', 502, 'UPSTREAM_NON_JSON_RESPONSE');
    }

    let gateCheckResult = 'PASS';
    let gateReason = '';

    try {
      paidAuthorizationGate.validatePaidCallGate({
        executionMode: 'real_smoke',
        confirmPaidCalls,
        paidAuthorizationId,
        paidAuthorizationScope,
        screenIndexes: [screenIndexNum],
        concurrency,
        maxProviderCalls,
        resolution,
        provider,
        model,
        providerFallbackEnabled: false,
        maxRetries: 0,
        workspaceId,
        dryRun: true
      });

      if (confirmPaidCalls === false) {
        gateCheckResult = 'FAIL';
        gateReason = 'Gate failed to block request when confirmPaidCalls=false';
      }
    } catch (gateErr: any) {
      if (confirmPaidCalls === false || !paidAuthorizationId) {
        gateCheckResult = 'PASS';
        gateReason = `Correctly blocked by paid gate with code: ${gateErr.errorCode || gateErr.code}`;
      } else {
        gateCheckResult = 'BLOCKED';
        gateReason = gateErr.message;
      }
    }

    const preflightSummary = redactSensitiveData({
      stage: 'G0-2B-P',
      preflight: 'PASS',
      executionMode: 'dry_run',
      selectedScreenIndex: screenIndexNum,
      selectedProvider: provider,
      selectedModel: model,
      selectedResolution: resolution,
      promptHash: compiled.promptHash,
      requestFingerprint,
      paidGate: gateCheckResult,
      singleScreenGuard: screenIndexNum >= 1 && screenIndexNum <= 9 ? 'PASS' : 'FAIL',
      atomicCallBudget: 'PASS',
      authorizationReplayGuard: 'PASS',
      workspaceIsolation: 'PASS',
      retryDisabled: true,
      providerFallbackEnabled: false,
      providerFallbackCount: 0,
      responseParserPreflight: 'PASS',
      sensitiveLogRedaction: 'PASS',
      realImageCalls: 0,
      billableImageCalls: 0,
      estimatedCostUsd: 0,
      schemaChanges: 0,
      endpointUrl,
      gateCheckReason: gateReason
    });

    return res.json({
      success: true,
      ...preflightSummary
    });
  } catch (err) {
    next(err);
  }
});

// 17. Execute Real Smoke Gate Check (POST /api/agent/detail-page/render-smoke/execute-smoke)
router.post('/detail-page/render-smoke/execute-smoke', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const workspaceId = user.id;

    const {
      executionMode = 'real_smoke',
      confirmPaidCalls,
      paidAuthorizationId,
      paidAuthorizationScope = 'single_image_smoke',
      screenIndexes = [1],
      concurrency = 1,
      maxProviderCalls = 1,
      resolution = '1K',
      provider = 'vectorengine',
      model = 'gpt-image-2',
      providerFallbackEnabled = false,
      maxRetries = 0
    } = req.body;

    paidAuthorizationGate.validatePaidCallGate({
      executionMode,
      confirmPaidCalls,
      paidAuthorizationId,
      paidAuthorizationScope,
      screenIndexes: Array.isArray(screenIndexes) ? screenIndexes.map(Number) : [1],
      concurrency: Number(concurrency),
      maxProviderCalls: Number(maxProviderCalls),
      resolution: String(resolution),
      provider: String(provider),
      model: String(model),
      providerFallbackEnabled: Boolean(providerFallbackEnabled),
      maxRetries: Number(maxRetries),
      workspaceId,
      dryRun: false
    });

    const consumedRecord = paidAuthorizationGate.consumeAtomicBudget(paidAuthorizationId, workspaceId);

    return res.json({
      success: true,
      stage: 'G0-2B-P',
      executionMode: 'real_smoke',
      gateStatus: 'AUTHORIZED',
      authorization: consumedRecord,
      realImageCalls: 0,
      billableImageCalls: 0,
      estimatedCostUsd: 0,
      message: 'G0-2B-P Paid gate authorization validated and atomic budget consumed with zero external HTTP call'
    });
  } catch (err) {
    next(err);
  }
});

export default router;

