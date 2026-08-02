import { Node, Edge } from '@xyflow/react';
import { AgentRun, ProductVisualDNA, DetailPageScreenPlan } from '../types';
import { NineGridPlanNodeData, ScenePlanNodeData } from '../types/creativeCanvas';

export interface NineGridCanvasAdapterCallbacks {
  onViewFullPlan?: () => void;
  onRegenerateAll?: () => void;
  onViewSceneDetail?: (screenIndex: number) => void;
  onReplanScene?: (screenIndex: number) => void;
}

export function mapExistingNineGridResultToCanvasNodes(
  agentRun: AgentRun,
  productDna: ProductVisualDNA | null,
  callbacks?: NineGridCanvasAdapterCallbacks
): { nodes: Node[]; edges: Edge[] } {
  if (!agentRun || !agentRun.plan) {
    throw new Error('缺失有效的九屏企划数据');
  }

  const plan = agentRun.plan;
  const screens = plan.screens || [];

  if (screens.length !== 9) {
    throw new Error(`九屏策划数据异常：期望 9 屏分镜，实际收到 ${screens.length} 屏数据`);
  }

  const nineGridNodeData: NineGridPlanNodeData = {
    runId: agentRun.id,
    themeTitle: plan.themeTitle || '意式极简家具 9 屏全案策划',
    targetAudience: plan.targetAudience || '追求生活品质的新中产家庭',
    overallStyle: plan.overallStyle || '自然光影、高雅轻奢影棚',
    coreCreative: productDna?.subcategory ? `${productDna.subcategory} 爆款卖点突破` : '空间美学与质感演绎',
    colorDirection: productDna?.primaryColor || '暖灰色系',
    sceneDirection: '现代高端客厅场景',
    screenCount: 9,
    status: 'completed',
    generatedAt: plan.createdAt || new Date().toISOString(),
    onViewFullPlan: callbacks?.onViewFullPlan,
    onRegenerateAll: callbacks?.onRegenerateAll
  };

  const nineGridNode: Node = {
    id: 'nine-grid-plan-node',
    type: 'nineGridPlanNode',
    position: { x: 800, y: 150 },
    data: nineGridNodeData
  };

  const dnaToPlanEdge: Edge = {
    id: 'edge-dna-plan',
    source: 'dna-node-1',
    target: 'nine-grid-plan-node',
    sourceHandle: 'source',
    targetHandle: 'target',
    label: 'DNA 驱动企划',
    labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
    labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
    animated: true,
    style: { stroke: '#B28C5A', strokeWidth: 2 }
  };

  const sceneNodes: Node[] = [];
  const sceneEdges: Edge[] = [];

  const startX = 800;
  const gapX = 380;
  const startY = 520;
  const gapY = 360;

  screens.forEach((screen: DetailPageScreenPlan, idx: number) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const posX = startX + col * gapX;
    const posY = startY + row * gapY;

    const sceneNodeId = `scene-plan-node-${screen.screenIndex}`;

    const sceneData: ScenePlanNodeData = {
      runId: agentRun.id,
      screenIndex: screen.screenIndex,
      screenTitle: screen.screenTitle,
      coreSellingPoint: screen.coreSellingPoint,
      sceneDescription: screen.lightingAndAtmosphere || '现代家居光影与场景展示',
      visualComposition: screen.visualComposition,
      lightingAndAtmosphere: screen.lightingAndAtmosphere,
      productFocus: screen.lockedRules?.join(', ') || productDna?.category || '产品主体',
      copySuggestion: screen.coreSellingPoint,
      promptSuggestion: screen.promptSuggestion,
      aspectRatio: screen.aspectRatio || '3:4',
      status: 'completed',
      onViewDetail: () => callbacks?.onViewSceneDetail?.(screen.screenIndex),
      onReplanScene: () => callbacks?.onReplanScene?.(screen.screenIndex)
    };

    sceneNodes.push({
      id: sceneNodeId,
      type: 'scenePlanNode',
      position: { x: posX, y: posY },
      data: sceneData
    });

    sceneEdges.push({
      id: `edge-plan-scene-${screen.screenIndex}`,
      source: 'nine-grid-plan-node',
      target: sceneNodeId,
      sourceHandle: 'source',
      targetHandle: 'target',
      label: '企划分镜',
      labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
      animated: false,
      style: { stroke: '#C8B293', strokeWidth: 1.5, strokeDasharray: '4,4' }
    });
  });

  return {
    nodes: [nineGridNode, ...sceneNodes],
    edges: [dnaToPlanEdge, ...sceneEdges]
  };
}
