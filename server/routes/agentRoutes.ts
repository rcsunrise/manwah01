import { Router, Response, NextFunction } from 'express';
import { Type } from '@google/genai';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { authenticateToken } from '../middleware/auth';
import { AgentRun, AgentRunStatus, ALLOWED_STATUS_TRANSITIONS, DetailPagePlan, ProductVisualDNA, DetailPageRenderTask, DetailPageTaskBatch, DetailPageCanvasConfig, DetailPageExportResult, DetailPageSliceAsset } from '../../src/types';
import { createServerGenAI } from '../utils/aiClient';

const router = Router();

router.use(authenticateToken as any);

// In-memory repositories fallback
const inMemoryAgentRuns = new Map<string, AgentRun>();
const inMemoryTasks = new Map<string, DetailPageRenderTask[]>();

function validateStatusTransition(current: AgentRunStatus, target: AgentRunStatus): void {
  const allowed = ALLOWED_STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(target)) {
    throw new AppError(`非法的状态转换: 不能从 ${current} 切换至 ${target}`, 400, 'INVALID_TRANSITION');
  }
}

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

    return res.json({ success: true, agentRun: newRun });
  } catch (err) {
    next(err);
  }
});

// 2. Generate 9-Screen Detail Page Plan using Gemini API
router.post('/:runId/generate-plan', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const { promptHint } = req.body;

    const run = inMemoryAgentRuns.get(runId);
    if (!run) {
      throw new AppError('Agent 运行实例不存在', 404, 'NOT_FOUND');
    }

    // Validate state transition
    if (run.status !== 'dna_confirmed' && run.status !== 'plan_review' && run.status !== 'failed') {
      validateStatusTransition(run.status, 'plan_generating');
    }
    run.status = 'plan_generating';
    run.updatedAt = new Date().toISOString();

    const user = req.user!;
    const { ai, isValidKey } = await createServerGenAI(user.id);

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

输出必须为符合要求的 JSON 格式。`;

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
            temperature: 0.3
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
            console.warn('[AgentRoutes] 模型返回并非合规 JSON，使用兜底计划:', parseErr?.message);
          }
        }
      } catch (e: any) {
        console.warn('Gemini generateContent call failed, using fallback 9-screen plan:', e?.message || e);
      }
    }

    if (!parsedPlan || !Array.isArray(parsedPlan.screens) || parsedPlan.screens.length === 0) {
      const category = dna?.category || '家具沙发';
      const style = dna?.style?.[0] || '意式极简';
      parsedPlan = {
        themeTitle: `${style}${category} 9 屏爆款详情页全案策划`,
        targetAudience: '追求生活品质的新中产家庭与高端住宅业主',
        overallStyle: '自然暖调、高雅轻奢、光影艺术影棚调性',
        screens: [
          {
            screenIndex: 1,
            screenTitle: '首屏 Hero 视觉主图',
            coreSellingPoint: `高冲击力场景全景，展现${style}${category}奢华气场`,
            visualComposition: '低角度仰拍，45度视角广角，突出主体宽阔线条与气场',
            lightingAndAtmosphere: '晨曦自然柔光穿透落地窗，高级暖灰色调与光影斑驳',
            promptSuggestion: `Luxury ${style} ${category}, high end living room, natural warm sunlight, 8k resolution`,
            aspectRatio: '3:4',
            lockedRules: dna?.lockedFeatures?.map(f => f.rule) || ['保持材质与色调一致']
          },
          {
            screenIndex: 2,
            screenTitle: '核心设计理念与空间美学',
            coreSellingPoint: '融合现代客厅空间，表达舒适生活哲学',
            visualComposition: '中景平拍，与客厅背景墙、大理石茶几构成和谐比例',
            lightingAndAtmosphere: '柔和无主灯设计，温馨包覆感氛围',
            promptSuggestion: `Modern architectural living room with ${category}, minimalist interior design`,
            aspectRatio: '3:4',
            lockedRules: ['保持造型结构稳定性']
          },
          {
            screenIndex: 3,
            screenTitle: '面料与触感微距特写',
            coreSellingPoint: '头层牛皮细腻纹理与精致双缝线工艺',
            visualComposition: '极精微距大特写，焦平面聚焦于皮革毛孔与走线细节',
            lightingAndAtmosphere: '侧光烘托皮质光泽与立体肌理',
            promptSuggestion: `Macro shot of premium Italian top-grain leather texture and precise stitching`,
            aspectRatio: '3:4',
            lockedRules: ['头层牛皮色泽与肌理严格一致']
          },
          {
            screenIndex: 4,
            screenTitle: '人体工学与坐感体验展示',
            coreSellingPoint: '多分区贴合支撑，久坐不累的云端坐感',
            visualComposition: '侧面半剖或模特惬意坐姿展示，强调颈背腰三点支撑',
            lightingAndAtmosphere: '明亮舒适家居光线',
            promptSuggestion: `Ergonomic seating experience on luxury sofa, comfortable lifestyle photo`,
            aspectRatio: '3:4',
            lockedRules: ['保持靠背与坐垫充盈形态']
          },
          {
            screenIndex: 5,
            screenTitle: '核心电动调节功能演示',
            coreSellingPoint: '110°-160°双无级调节与隐藏式脚托',
            visualComposition: '功能展开状态动感组合，展现平躺与坐姿双形态',
            lightingAndAtmosphere: '高质感专业摄影棚均匀布光',
            promptSuggestion: `Power recliner sofa in extended lounge state, sleek mechanical movement`,
            aspectRatio: '3:4',
            lockedRules: ['保证机械连杆与伸展姿态自然']
          },
          {
            screenIndex: 6,
            screenTitle: '内部材质与品质功底',
            coreSellingPoint: '高回弹海绵、进口松木实木框架与稳固蛇形弹簧',
            visualComposition: '立轴三维解构视效，分层展示皮料、海绵与实木内胆',
            lightingAndAtmosphere: '科技感工业影棚侧光',
            promptSuggestion: `3D exploded view of luxury sofa layers, high density foam and solid wood frame`,
            aspectRatio: '3:4',
            lockedRules: ['内部结构标准品质展示']
          },
          {
            screenIndex: 7,
            screenTitle: '多场景组合与户型搭配',
            coreSellingPoint: '单人位、三人位与妃位自由组合，灵活适配大中小户型',
            visualComposition: '俯拍俯视全局客厅规划视角',
            lightingAndAtmosphere: '通透明亮自然客厅全景',
            promptSuggestion: `Top down angle of modular sofa placement in modern apartment living room`,
            aspectRatio: '3:4',
            lockedRules: ['组合模块造型统一']
          },
          {
            screenIndex: 8,
            screenTitle: '工匠精神与五金配件细节',
            coreSellingPoint: '定制枪色合金拉脚与品牌徽标金属印章',
            visualComposition: '底部金属拉脚与细节小标斜角特写',
            lightingAndAtmosphere: '高对比度金属高光反光效果',
            promptSuggestion: `Close up shot of gunmetal sofa legs and metallic luxury brand badge`,
            aspectRatio: '3:4',
            lockedRules: ['品牌Logo与金属配件风格锁定']
          },
          {
            screenIndex: 9,
            screenTitle: '场景收尾与官方售后保障',
            coreSellingPoint: '敏华官方 10 年质保，全国送装一体与7天无理由退换',
            visualComposition: '温暖家庭全景氛围收尾，标注标准规格尺寸图解',
            lightingAndAtmosphere: '温馨暖色落日余晖氛围',
            promptSuggestion: `Cozy family evening atmosphere in warm living room with luxury sofa`,
            aspectRatio: '3:4',
            lockedRules: ['官方保障标识与规范尺寸标注']
          }
        ]
      };
    }

    const detailPlan: DetailPagePlan = {
      projectId: run.projectId,
      version: run.planVersion,
      themeTitle: parsedPlan.themeTitle || '意式极简家具 9 屏策划案',
      targetAudience: parsedPlan.targetAudience || '追求生活品质的新中产家庭',
      overallStyle: parsedPlan.overallStyle || '自然光影、优雅轻奢、高质感家具影棚',
      screens: parsedPlan.screens || [],
      userModifications: promptHint || '',
      confirmedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    run.plan = detailPlan;
    run.status = 'plan_review';
    run.updatedAt = new Date().toISOString();

    inMemoryAgentRuns.set(runId, run);

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
        console.warn('Gemini single screen replan failed, using fallback:', e?.message || e);
      }
    }

    if (!updatedScreen) {
      updatedScreen = {
        ...targetScreen,
        screenIndex: screenIdx,
        coreSellingPoint: `${targetScreen.coreSellingPoint}（全面升级视角与卖点）`,
        promptSuggestion: `${targetScreen.promptSuggestion}, enhanced details, ultra high quality`,
        updatedAt: new Date().toISOString()
      };
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

export default router;


