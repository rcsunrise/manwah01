import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Send,
  Upload,
  Bot,
  User,
  CheckCircle,
  Info,
  Loader2,
  AlertCircle,
  X,
  Dna,
  LayoutGrid,
  Film,
  RotateCw,
  RefreshCw,
  Sliders,
  ChevronRight,
  Image as ImageIcon,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Play,
  Pause,
  ImagePlus,
  RotateCcw,
  Layers,
  ShieldAlert
} from 'lucide-react';
import { AgentMessage, GenerationBatch, SceneQueueItem } from '../../types/creativeCanvas';
import { ProductVisualDNA, AgentRun } from '../../types';
import { CopyWorkspacePanel } from './CopyWorkspacePanel';

interface AgentPanelProps {
  messages: AgentMessage[];
  uploadState: 'idle' | 'uploading' | 'analyzing' | 'completed' | 'error';
  errorMessage: string | null;
  activeDna: ProductVisualDNA | null;
  showFullDnaDrawer: boolean;
  setShowFullDnaDrawer: (show: boolean) => void;
  onUploadFile: (file: File) => void;
  onSendMessage: (text: string) => void;

  // C2 Props
  agentRun: AgentRun | null;
  isPlanGenerating: boolean;
  planError: string | null;
  selectedNodeId: string | null;
  selectedSceneIndex: number | null;
  onGenerateNineGridPlan: () => void;
  onReplanSingleScene: (screenIndex: number) => void;

  // C3A Props
  generatingScenes?: Set<number>;
  nodes?: any[];
  selectedModel?: string;
  setSelectedModel?: (m: string) => void;
  selectedResolution?: '1K' | '2K' | '4K';
  setSelectedResolution?: (r: '1K' | '2K' | '4K') => void;
  onGenerateSceneImage?: (screenIndex: number, reviewFeedback?: string) => void;
  onApproveSceneImage?: (screenIndex: number) => void;
  onRejectSceneImage?: (screenIndex: number, feedback: string) => void;

  // C3B Props
  batchState?: GenerationBatch | null;
  queueItems?: SceneQueueItem[];
  onTriggerBatchMissingModal?: () => void;
  onPauseBatch?: () => void;
  onResumeBatch?: () => void;
  onCancelBatch?: () => void;
  onRetryFailedBatch?: () => void;

  // C4B-1 & C4B-2 Props
  onSelectSceneIndex?: (sceneIndex: number) => void;
  onOpenAssetVersionsModal?: (sceneKey: string) => void;
  dnaCode?: string;
  productDnaVersionCode?: string;
  productDnaVersionId?: string;
  dnaVersions?: any[];
  onSelectDnaVersion?: (versionId: string) => void;
  projectId?: string;
  canvasId?: string;
  assetVersionId?: string;
}

export interface EngineConfigSelectorProps {
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  selectedResolution: '1K' | '2K' | '4K';
  setSelectedResolution: (r: '1K' | '2K' | '4K') => void;
}

export const EngineConfigSelector: React.FC<EngineConfigSelectorProps> = ({
  selectedModel,
  setSelectedModel,
  selectedResolution,
  setSelectedResolution
}) => {
  const models = [
    {
      id: 'gemini-2.5-flash',
      icon: '🚀',
      title: '极速',
      subtitle: 'v2.5 Flash',
      activeColor: 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-md'
    },
    {
      id: 'gemini-3.1-flash-image',
      icon: '⚡',
      title: '标准',
      subtitle: 'v3.1 Flash',
      activeColor: 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-md'
    },
    {
      id: 'google/gemini-3-pro-image',
      icon: '✨',
      title: '旗舰',
      subtitle: 'v3.0 Pro',
      activeColor: 'bg-[#2C2622] text-white border-[#2C2622] shadow-md'
    },
    {
      id: 'openai/gpt-image-2',
      icon: '🌌',
      title: 'GPT',
      subtitle: 'image-2',
      activeColor: 'bg-[#2C2622] text-white border-[#2C2622] shadow-md'
    }
  ];

  return (
    <div className="space-y-2.5 p-3 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#2C2A29] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#B28C5A]" />
          渲染引擎与精度档位
        </span>
      </div>

      {/* Models Grid */}
      <div className="space-y-1">
        <div className="grid grid-cols-4 gap-1.5">
          {models.map(m => {
            const isSelected =
              selectedModel === m.id ||
              (m.id === 'gemini-3.1-flash-image' &&
                (selectedModel === 'gemini-3.1-flash-image' || selectedModel === 'gemini-3.1-flash-image-preview'));
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModel(m.id)}
                className={`p-1.5 rounded-xl text-center border transition-all ${
                  isSelected
                    ? m.activeColor
                    : 'bg-white border-[#E5E0D8] text-stone-700 hover:border-[#B28C5A]'
                }`}
              >
                <div className="text-sm mb-0.5">{m.icon}</div>
                <div className="text-[10px] font-bold leading-tight">{m.title}</div>
                <div className="text-[8px] opacity-70 leading-tight">{m.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution */}
      <div className="space-y-1">
        <span className="text-[10px] text-stone-400 font-bold block">渲染精度 (Resolution)</span>
        <div className="flex gap-1.5">
          {(['1K', '2K', '4K'] as const).map(r => {
            const isV25 = selectedModel.includes('2.5');
            const isDisabled = isV25 && (r === '2K' || r === '4K');
            const isSelected = selectedResolution === r;

            return (
              <button
                key={r}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  setSelectedResolution(r);
                  if ((r === '2K' || r === '4K') && selectedModel.includes('2.5')) {
                    setSelectedModel('gemini-3.1-flash-image');
                  }
                }}
                className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                  isDisabled
                    ? 'bg-stone-50 border-stone-200 text-stone-300 cursor-not-allowed'
                    : isSelected
                    ? 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-xs'
                    : 'bg-white border-[#E5E0D8] text-stone-600 hover:border-[#B28C5A]'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AgentPanel: React.FC<AgentPanelProps> = ({
  messages,
  uploadState,
  errorMessage,
  activeDna,
  showFullDnaDrawer,
  setShowFullDnaDrawer,
  onUploadFile,
  onSendMessage,
  agentRun,
  isPlanGenerating,
  planError,
  selectedNodeId,
  selectedSceneIndex,
  onGenerateNineGridPlan,
  onReplanSingleScene,
  generatingScenes,
  nodes = [],
  selectedModel,
  setSelectedModel,
  selectedResolution,
  setSelectedResolution,
  onGenerateSceneImage,
  onApproveSceneImage,
  onRejectSceneImage,
  batchState,
  queueItems = [],
  onTriggerBatchMissingModal,
  onPauseBatch,
  onResumeBatch,
  onCancelBatch,
  onRetryFailedBatch,
  onSelectSceneIndex,
  onOpenAssetVersionsModal,
  dnaCode,
  productDnaVersionCode,
  productDnaVersionId,
  dnaVersions = [],
  onSelectDnaVersion,
  projectId,
  canvasId,
  assetVersionId
}) => {
  const [activeTab, setActiveTab] = useState<'scene' | 'copy' | 'typography' | 'version'>('scene');
  const [inputValue, setInputValue] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [internalModel, setInternalModel] = useState<string>('gemini-3.1-flash-image');
  const [internalRes, setInternalRes] = useState<'1K' | '2K' | '4K'>('2K');

  const model = selectedModel || internalModel;
  const setModel = setSelectedModel || setInternalModel;
  const resolution = selectedResolution || internalRes;
  const setResolution = setSelectedResolution || setInternalRes;

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      e.target.value = '';
    }
  };

  const selectedScreen = React.useMemo(() => {
    if (selectedSceneIndex && agentRun?.plan?.screens) {
      const found = agentRun.plan.screens.find(s => s.screenIndex === selectedSceneIndex);
      if (found) return found;
    }

    const sceneNode = nodes.find(n => {
      if (selectedNodeId && n.id === selectedNodeId && (n.type === 'scenePlanNode' || n.type === 'scenePlan' || n.data?.screenTitle)) {
        return true;
      }
      if (selectedSceneIndex && (n.id === `scene-plan-node-${selectedSceneIndex}` || n.data?.screenIndex === selectedSceneIndex)) {
        return true;
      }
      return false;
    });

    if (sceneNode?.data) {
      const d = sceneNode.data as any;
      return {
        screenIndex: Number(d.screenIndex) || selectedSceneIndex || 1,
        screenTitle: (d.screenTitle as string) || (d.title as string) || '分镜画面',
        coreSellingPoint: (d.coreSellingPoint as string) || (d.sellingPoint as string) || '',
        visualComposition: (d.visualComposition as string) || '',
        lightingAndAtmosphere: (d.lightingAndAtmosphere as string) || '',
        promptSuggestion: (d.promptSuggestion as string) || (d.prompt as string) || '',
        aspectRatio: (d.aspectRatio as string) || '3:4'
      };
    }

    return null;
  }, [selectedSceneIndex, selectedNodeId, agentRun, nodes]);

  const hasDna = !!activeDna || !!agentRun?.dna || nodes.some(n => n.id === 'dna-node-1' || n.type === 'productDnaNode' || n.type === 'productDna');

  const selectedGenImgNode = nodes.find(
    n => n.id === selectedNodeId && (n.type === 'generatedImage' || n.type === 'generatedImageNode' || n.id.startsWith('gen-img-node-'))
  );
  const genImgData = selectedGenImgNode?.data;

  return (
    <aside className="relative w-full md:w-[440px] md:min-w-[380px] md:max-w-[520px] h-full flex flex-col bg-[#FDFBF7] border-l border-[#E5E0D8] shrink-0 z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] select-none">
      {/* Panel Header */}
      <div className="p-4 md:p-5 border-b border-[#E5E0D8] bg-white/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8] shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif font-bold text-base text-[#2C2A29]">
              视觉企划智能体
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-stone-500">
                {agentRun?.plan ? '九屏企划已就绪' : activeDna ? 'DNA 已接入' : '工作区已就绪'}
              </span>
            </div>
          </div>
        </div>
        <div className="text-[10px] bg-[#F9F5EF] text-[#B28C5A] px-2.5 py-1 rounded-full font-bold border border-[#E5E0D8]/60">
          阶段 C2
        </div>
      </div>

      {/* C4B-1 Architecture Four Tab Bar */}
      <div className="grid grid-cols-4 bg-[#F4EFE6] p-1 border-b border-[#E5E0D8] shrink-0 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('scene')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'scene'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Film className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>场景</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('copy')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'copy'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>文案</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('typography')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'typography'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>排版</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('version')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'version'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <Dna className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>版本</span>
        </button>
      </div>

      {/* Unified Scrollable Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 custom-scrollbar">
        {/* Quick Scene Selector Grid for Two-Way Linkage */}
        {activeTab === 'scene' && (
          <div className="bg-white p-2.5 rounded-2xl border border-[#E5E0D8] space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-stone-600 flex items-center gap-1">
                <LayoutGrid className="w-3.5 h-3.5 text-[#B28C5A]" />
                场景快速切换 (scene-01 ~ 09)
              </span>
              <span className="text-[10px] text-stone-400 font-mono">
                {selectedSceneIndex ? `当前: scene-0${selectedSceneIndex}` : '全视图'}
              </span>
            </div>
            <div className="grid grid-cols-9 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(idx => {
                const isSelected = selectedSceneIndex === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (onSelectSceneIndex) {
                        onSelectSceneIndex(idx);
                      }
                    }}
                    className={`py-1.5 text-center font-mono text-[10px] font-bold rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-xs'
                        : 'bg-[#FAF8F5] text-stone-700 border-[#E5E0D8] hover:border-[#B28C5A]'
                    }`}
                    title={`选择 Scene-0${idx}`}
                  >
                    0{idx}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Copy Tab Content */}
        {activeTab === 'copy' && (
          <CopyWorkspacePanel
            projectId={projectId || 'default-project'}
            canvasId={canvasId || 'default-canvas'}
            sceneIndex={selectedSceneIndex || 1}
            sceneTitle={selectedScreen?.screenTitle}
            coreSellingPoint={selectedScreen?.coreSellingPoint}
            visualComposition={selectedScreen?.visualComposition}
            productDnaVersionId={productDnaVersionId}
            assetVersionId={assetVersionId}
          />
        )}

        {/* Typography Tab Content */}
        {activeTab === 'typography' && (
          <div className="p-6 bg-white rounded-2xl border border-[#E5E0D8] text-center space-y-3 my-4">
            <div className="w-12 h-12 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center mx-auto border border-[#E5E0D8]">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-serif font-bold text-sm text-[#2C2A29]">真实文字图层与排版面板</h3>
            <p className="text-xs text-stone-600 leading-relaxed font-medium">
              真实文字图层与 Layout Version 将在 C4B-4 阶段接入。
            </p>
            <span className="inline-block text-[10px] font-bold text-[#B28C5A] bg-[#F9F5EF] px-3 py-1 rounded-full border border-[#E5E0D8]">
              C4B-1 无假图层模式
            </span>
          </div>
        )}

        {/* Version Tab Content */}
        {activeTab === 'version' && (
          <div className="space-y-4">
            {/* DNA Version Card */}
            <div className="p-4 bg-white rounded-2xl border border-[#E5E0D8] space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
                <div className="flex items-center gap-2 text-[#2C2A29]">
                  <Dna className="w-4 h-4 text-[#B28C5A]" />
                  <span className="font-bold text-xs">Product DNA Version (C4A-3)</span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-[#B28C5A]/10 text-[#8C6F43] px-2 py-0.5 rounded-full border border-[#B28C5A]/20">
                  {productDnaVersionCode || 'DNA-V001'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-stone-700 font-mono">
                <div className="flex justify-between">
                  <span className="text-stone-400">DNA 编码:</span>
                  <span className="font-bold text-[#2C2A29]">{dnaCode || 'DNA-DEFAULT'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Version ID:</span>
                  <span className="text-[10px] text-stone-600 truncate max-w-[180px]">{productDnaVersionId || '未锁定'}</span>
                </div>
              </div>

              {dnaVersions && dnaVersions.length > 0 && (
                <div className="pt-2 border-t border-[#E5E0D8] space-y-1.5">
                  <span className="text-[10px] font-bold text-stone-400 block">版本历史</span>
                  <div className="space-y-1">
                    {dnaVersions.map((v: any) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onSelectDnaVersion?.(v.id)}
                        className={`w-full p-2 rounded-xl text-left text-xs font-mono border flex items-center justify-between transition-colors ${
                          v.id === productDnaVersionId
                            ? 'bg-[#F9F5EF] border-[#B28C5A] text-[#2C2A29] font-bold'
                            : 'bg-white border-[#E5E0D8] text-stone-600 hover:border-[#B28C5A]'
                        }`}
                      >
                        <span>{v.version_code || `V00${v.version_number}`}</span>
                        <span className="text-[10px] opacity-60">{v.created_at ? new Date(v.created_at).toLocaleDateString() : '活跃'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Asset SKU & Version Card */}
            <div className="p-4 bg-white rounded-2xl border border-[#E5E0D8] space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
                <div className="flex items-center gap-2 text-[#2C2A29]">
                  <Layers className="w-4 h-4 text-[#B28C5A]" />
                  <span className="font-bold text-xs">Asset SKU & Version (C4A-2)</span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full border border-stone-200">
                  {selectedSceneIndex ? `scene-0${selectedSceneIndex}` : 'scene-01'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-stone-700 font-mono">
                <div className="flex justify-between">
                  <span className="text-stone-400">Asset SKU Code:</span>
                  <span className="font-bold text-[#2C2A29]">
                    {selectedGenImgNode?.data?.assetSkuCode || `SKU-SCENE-${selectedSceneIndex ? String(selectedSceneIndex).padStart(2, '0') : '01'}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">当前 Asset Version:</span>
                  <span className="font-bold text-[#B28C5A]">
                    {selectedGenImgNode?.data?.assetVersionCode || 'V001'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">父版本 ID (Parent):</span>
                  <span className="text-[10px] text-stone-600 truncate max-w-[180px]">
                    {selectedGenImgNode?.data?.parentVersionId || '无 (初始版本)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">绑定 DNA Version ID:</span>
                  <span className="text-[10px] text-stone-600 truncate max-w-[180px]">
                    {productDnaVersionId || 'DNA-V001'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const key = selectedSceneIndex ? `scene-0${selectedSceneIndex}` : 'scene-01';
                  if (onOpenAssetVersionsModal) {
                    onOpenAssetVersionsModal(key);
                  }
                }}
                className="w-full py-2 bg-[#F9F5EF] hover:bg-[#F2EBDC] text-[#B28C5A] border border-[#E5E0D8] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>打开场景资产版本管理 modal</span>
              </button>
            </div>
          </div>
        )}

        {/* Scene Tab Default Content */}
        {activeTab === 'scene' && (
          <>
        {/* Selected Node Inspector View inside Right Panel */}
        {selectedNodeId === 'nine-grid-plan-node' && agentRun?.plan && (
          <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <div className="flex items-center gap-2 text-[#2C2A29]">
              <LayoutGrid className="w-4 h-4 text-[#B28C5A]" />
              <span className="font-bold text-sm">九屏企划总览</span>
            </div>
            <span className="text-[10px] font-bold bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded-full">
              全案就绪
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-stone-700">
            <p><span className="text-stone-400 font-bold">企划主题：</span>{agentRun.plan.themeTitle}</p>
            <p><span className="text-stone-400 font-bold">目标受众：</span>{agentRun.plan.targetAudience}</p>
            <p><span className="text-stone-400 font-bold">视觉调性：</span>{agentRun.plan.overallStyle}</p>
          </div>

          <div className="pt-2 border-t border-[#E5E0D8]/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-stone-400">共 9 屏视角脚本</span>
              <button
                onClick={() => onGenerateNineGridPlan()}
                disabled={isPlanGenerating}
                className="flex items-center gap-1 text-xs font-bold text-[#B28C5A] hover:text-[#8C6F43] disabled:opacity-50"
              >
                <RotateCw className="w-3 h-3" />
                <span>重新策划全案</span>
              </button>
            </div>

            {/* Model & Resolution selector */}
            <EngineConfigSelector
              selectedModel={model}
              setSelectedModel={setModel}
              selectedResolution={resolution}
              setSelectedResolution={setResolution}
            />

            {/* C3B Primary Entry Button */}
            <button
              onClick={() => onTriggerBatchMissingModal?.()}
              disabled={batchState?.status === 'running'}
              className="w-full py-2.5 px-4 bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {batchState?.status === 'running' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>九屏批量生成进行中...</span>
                </>
              ) : (
                <>
                  <ImagePlus className="w-4 h-4" />
                  <span>生成缺失画面 (九屏受控队列)</span>
                </>
              )}
            </button>
          </div>

          {/* C3B Batch Task Queue Control Panel */}
          {(batchState || queueItems.length > 0) && (
            <div className="pt-3 border-t border-[#E5E0D8] space-y-3 bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#B28C5A]" />
                  <span className="font-bold text-xs text-[#2C2A29]">受控并发任务队列 (Max=2)</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white border border-[#E5E0D8] text-stone-700">
                  {batchState?.status === 'running' && '运行中'}
                  {batchState?.status === 'paused' && '已暂停'}
                  {batchState?.status === 'completed' && '全部完成'}
                  {batchState?.status === 'partial_failed' && '有失败项'}
                  {batchState?.status === 'cancelled' && '已取消'}
                </span>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                <div className="bg-white p-1.5 rounded-lg border border-[#E5E0D8]">
                  <span className="text-stone-400 block">排队中</span>
                  <span className="font-bold text-stone-700 font-mono">
                    {queueItems.filter(i => i.status === 'queued' || i.status === 'pending').length}
                  </span>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-amber-200">
                  <span className="text-amber-600 block">生成中</span>
                  <span className="font-bold text-amber-700 font-mono">
                    {queueItems.filter(i => i.status === 'generating').length}
                  </span>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-emerald-200">
                  <span className="text-emerald-600 block">已完成</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {queueItems.filter(i => i.status === 'success').length}
                  </span>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-rose-200">
                  <span className="text-rose-600 block">失败</span>
                  <span className="font-bold text-rose-700 font-mono">
                    {queueItems.filter(i => i.status === 'failed').length}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1.5 pt-1">
                {batchState?.status === 'running' ? (
                  <button
                    onClick={() => onPauseBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-amber-300 transition-colors"
                  >
                    <Pause className="w-3 h-3" />
                    <span>暂停队列</span>
                  </button>
                ) : batchState?.status === 'paused' ? (
                  <button
                    onClick={() => onResumeBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-emerald-300 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>继续队列</span>
                  </button>
                ) : null}

                {queueItems.some(i => i.status === 'queued' || i.status === 'pending' || i.status === 'generating') && (
                  <button
                    onClick={() => onCancelBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-stone-300 transition-colors"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>取消排队</span>
                  </button>
                )}

                {queueItems.some(i => i.status === 'failed') && (
                  <button
                    onClick={() => onRetryFailedBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-rose-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重试失败项</span>
                  </button>
                )}
              </div>

              {/* Scene Queue Grid Detail */}
              <div className="space-y-1 text-[10px] max-h-36 overflow-y-auto pt-1 border-t border-[#E5E0D8]/60">
                {queueItems.map(item => (
                  <div
                    key={item.sceneNumber}
                    className="flex items-center justify-between p-1.5 bg-white rounded-lg border border-[#E5E0D8]"
                  >
                    <span className="font-bold text-[#2C2A29]">第 {item.sceneNumber} 屏分镜</span>
                    <div className="flex items-center gap-1">
                      {item.status === 'generating' && (
                        <span className="text-amber-700 font-medium flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> 生成中...
                        </span>
                      )}
                      {item.status === 'queued' && <span className="text-stone-400">排队中</span>}
                      {item.status === 'pending' && <span className="text-stone-400 font-mono">待处理</span>}
                      {item.status === 'success' && (
                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 已完成
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="text-rose-600 font-bold flex items-center gap-1" title={item.error?.message}>
                          <XCircle className="w-3 h-3" /> 失败
                        </span>
                      )}
                      {item.status === 'cancelled' && <span className="text-stone-400">已取消</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedScreen && (
        <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <div className="flex items-center gap-2 text-[#2C2A29]">
              <Film className="w-4 h-4 text-[#B28C5A]" />
              <span className="font-bold text-sm">
                第 {selectedScreen.screenIndex} 屏分镜: {selectedScreen.screenTitle}
              </span>
            </div>
            <span className="text-[10px] font-bold bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded-full">
              策划完成
            </span>
          </div>

          <div className="space-y-2 text-xs text-stone-700">
            <div>
              <span className="text-[10px] text-stone-400 font-bold block">核心卖点 / 画面目的</span>
              <p className="font-medium text-[#2C2A29] mt-0.5">{selectedScreen.coreSellingPoint}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E5E0D8]/60">
              <div>
                <span className="text-[10px] text-stone-400 block">构图视角</span>
                <span className="font-bold text-[#2C2A29] block mt-0.5">{selectedScreen.visualComposition}</span>
              </div>
              <div>
                <span className="text-[10px] text-stone-400 block">光影氛围</span>
                <span className="font-bold text-[#2C2A29] block mt-0.5">{selectedScreen.lightingAndAtmosphere}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-stone-400 font-bold block">图片生成提示词 (Prompt)</span>
              <p className="font-mono text-[11px] text-[#2C2A29] bg-[#F9F5EF] p-2 rounded-xl border border-[#E5E0D8] mt-0.5">
                {selectedScreen.promptSuggestion}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E5E0D8]/60 flex items-center justify-between">
            <span className="text-[11px] text-stone-400">画幅比例: {selectedScreen.aspectRatio || '3:4'}</span>
            <button
              onClick={() => onReplanSingleScene(selectedScreen.screenIndex)}
              disabled={isPlanGenerating}
              className="flex items-center gap-1 text-xs font-bold text-[#B28C5A] hover:text-[#8C6F43] disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              <span>重新策划本屏</span>
            </button>
          </div>

          {/* Phase C3A: Image Generation & Review Action Section */}
          {(() => {
            const screenIndex = selectedScreen.screenIndex;
            const isGenerating = generatingScenes?.has(screenIndex);
            const genImgNode = nodes.find(n => n.id === `gen-img-node-${screenIndex}`);
            const taskNode = nodes.find(n => n.id === `img-gen-task-${screenIndex}`);

            return (
              <div className="pt-3 border-t border-[#E5E0D8] space-y-3">
                {/* Engine & Resolution Selector */}
                <EngineConfigSelector
                  selectedModel={model}
                  setSelectedModel={setModel}
                  selectedResolution={resolution}
                  setSelectedResolution={setResolution}
                />

                {/* Image Generation Trigger Button */}
                <button
                  onClick={() => {
                    if (onGenerateSceneImage) {
                      onGenerateSceneImage(screenIndex);
                    }
                  }}
                  disabled={isGenerating || isPlanGenerating || !hasDna}
                  className="w-full py-2.5 px-4 bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5533] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>正在生成第 {screenIndex} 屏海报/渲染图...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4" />
                      <span>{genImgNode ? '重新生成本屏海报/渲染图' : '生成本屏海报/渲染图'}</span>
                    </>
                  )}
                </button>

                {!hasDna && (
                  <div className="flex items-start gap-1.5 p-2 bg-amber-50 text-amber-800 rounded-lg text-[11px] border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>提示：尚未提取产品 DNA，请上传产品主角图以激活海报生成。</span>
                  </div>
                )}

                {/* Show Result & Review controls if generated */}
                {genImgNode?.data && (
                  <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-bold text-[#2C2A29]">
                      <span className="flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-[#B28C5A]" />
                        <span>渲染图 review (v{genImgNode.data.version || 1})</span>
                      </span>
                      {genImgNode.data.reviewStatus === 'approved' && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 已通过
                        </span>
                      )}
                      {genImgNode.data.reviewStatus === 'rejected' && (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> 未通过
                        </span>
                      )}
                      {genImgNode.data.reviewStatus === 'pendingReview' && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3" /> 待审核
                        </span>
                      )}
                    </div>

                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-[#E5E0D8] max-h-[180px] bg-stone-200">
                      <img
                        src={genImgNode.data.imageUrl as string}
                        alt={`分镜 #${screenIndex} 渲染结果`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Review Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => onApproveSceneImage?.(screenIndex)}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                          genImgNode.data.reviewStatus === 'approved'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>通过标绿</span>
                      </button>

                      <button
                        onClick={() => {
                          const reason = prompt('请输入该屏画面需要修改或优化的反馈意见：', feedbackInput);
                          if (reason && reason.trim()) {
                            onRejectSceneImage?.(screenIndex, reason.trim());
                          }
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                          genImgNode.data.reviewStatus === 'rejected'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>标记问题</span>
                      </button>
                    </div>

                    {/* Feedback Re-generate Trigger */}
                    {genImgNode.data.reviewStatus === 'rejected' && (
                      <div className="space-y-1.5 pt-1 border-t border-[#E5E0D8]">
                        <span className="text-[10px] text-rose-700 font-bold block">
                          修改意见: {genImgNode.data.reviewFeedback || '细节需调整'}
                        </span>
                        <button
                          onClick={() => {
                            if (onGenerateSceneImage) {
                              onGenerateSceneImage(screenIndex, genImgNode.data.reviewFeedback as string);
                            }
                          }}
                          disabled={isGenerating}
                          className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>根据反馈重新生成本屏</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Selected GeneratedImageNode Detailed Inspector */}
      {genImgData && selectedNodeId?.startsWith('gen-img-node-') && (
        <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <div className="flex items-center gap-2 text-[#2C2A29]">
              <ImageIcon className="w-4 h-4 text-[#B28C5A]" />
              <span className="font-bold text-sm">
                第 {genImgData.sceneIndex} 屏渲染结果 (v{genImgData.version || 1})
              </span>
            </div>
            {genImgData.reviewStatus === 'approved' && (
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 已通过
              </span>
            )}
            {genImgData.reviewStatus === 'rejected' && (
              <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <XCircle className="w-3 h-3" /> 未通过
              </span>
            )}
            {genImgData.reviewStatus === 'pendingReview' && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" /> 待人审
              </span>
            )}
          </div>

          {/* Large Image Preview */}
          <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-[#E5E0D8] bg-stone-100 shadow-inner group">
            <img
              src={genImgData.imageUrl as string}
              alt={genImgData.screenTitle as string}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-full font-mono">
              {genImgData.aspectRatio || '3:4'} · {genImgData.dimensions || '1024x1365'}
            </div>
          </div>

          {/* Metadata & Prompt Parameters */}
          <div className="space-y-2 text-xs text-stone-700 bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8]/80">
            <div>
              <span className="text-[10px] text-stone-400 font-bold block">分镜主题</span>
              <p className="font-bold text-[#2C2A29]">{genImgData.screenTitle as string}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-[#E5E0D8]/60">
              <div>
                <span className="text-[10px] text-stone-400 block">生成模型</span>
                <span className="font-semibold text-[#2C2A29] truncate block">
                  {(genImgData.model as string) || 'openai/gpt-image-2'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-stone-400 block">服务通道</span>
                <span className="font-semibold text-[#2C2A29] truncate block">
                  {(genImgData.provider as string) || 'OpenAI Direct API'}
                </span>
              </div>
            </div>

            <div className="pt-1 border-t border-[#E5E0D8]/60">
              <span className="text-[10px] text-stone-400 font-bold block">完整图片生成 Prompt</span>
              <p className="font-mono text-[10px] leading-relaxed text-[#2C2A29] bg-white p-2 rounded-lg border border-[#E5E0D8] max-h-24 overflow-y-auto mt-0.5">
                {genImgData.prompt as string}
              </p>
            </div>

            {genImgData.negativePrompt && (
              <div className="pt-1 border-t border-[#E5E0D8]/60">
                <span className="text-[10px] text-stone-400 font-bold block">负面约束 (Negative Prompt)</span>
                <p className="font-mono text-[10px] text-stone-600 bg-white p-1.5 rounded-lg border border-[#E5E0D8] mt-0.5">
                  {genImgData.negativePrompt as string}
                </p>
              </div>
            )}
          </div>

          {/* Review Actions & Feedback */}
          <div className="space-y-2 pt-2 border-t border-[#E5E0D8]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onApproveSceneImage?.(genImgData.sceneIndex as number)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  genImgData.reviewStatus === 'approved'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                <span>标记通过</span>
              </button>

              <button
                onClick={() => {
                  const reason = prompt('请输入该屏画面需要修改或优化的反馈意见：', (genImgData.reviewFeedback as string) || '');
                  if (reason && reason.trim()) {
                    onRejectSceneImage?.(genImgData.sceneIndex as number, reason.trim());
                  }
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  genImgData.reviewStatus === 'rejected'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                <span>标记问题</span>
              </button>
            </div>

            {/* Re-generate trigger for this scene */}
            <button
              onClick={() => {
                if (onGenerateSceneImage) {
                  onGenerateSceneImage(genImgData.sceneIndex as number, genImgData.reviewFeedback as string);
                }
              }}
              disabled={generatingScenes?.has(genImgData.sceneIndex as number)}
              className="w-full py-2.5 px-4 bg-[#B28C5A] hover:bg-[#8C6F43] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {generatingScenes?.has(genImgData.sceneIndex as number) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在重新生成...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>重新生成第 {genImgData.sceneIndex} 屏图片</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
      </>
      )}
      <div className="p-3 bg-white rounded-2xl border border-[#E5E0D8] shadow-sm flex items-start gap-3">
        <Info className="w-4 h-4 text-[#B28C5A] shrink-0 mt-0.5" />
        <div className="text-xs text-stone-600 leading-relaxed">
          <span className="font-bold text-[#2C2A29]">企划指南：</span>
          {uploadState !== 'completed' && '右侧上传产品图以完成 DNA 提取。'}
          {uploadState === 'completed' && !agentRun?.plan && '点击下方【生成九屏企划】开启爆款 9 屏方案策划。'}
          {agentRun?.plan && '点击画布中的分镜节点可在右侧实时调阅与重新策划。'}
        </div>
      </div>

      {/* Messages Area */}
      <div className="space-y-4 py-1">
        {messages.map((msg, index) => (
          <div
            key={msg.id ? `${msg.id}-${index}` : `msg-${index}`}
            className={`flex items-start gap-3 ${
              msg.sender === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                msg.sender === 'user'
                  ? 'bg-stone-800 text-white shadow-sm'
                  : 'bg-[#F9F5EF] text-[#B28C5A] border border-[#E5E0D8]'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[84%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-stone-800 text-white rounded-tr-none'
                  : 'bg-white text-[#2C2A29] border border-[#E5E0D8] rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
              <span
                className={`block text-[9px] mt-1.5 ${
                  msg.sender === 'user' ? 'text-stone-400 text-right' : 'text-stone-400'
                }`}
              >
                {msg.timestamp}
              </span>
            </div>
          </div>
        ))}

        {/* Upload Trigger Area */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/png, image/jpeg, image/jpg, image/webp"
          className="hidden"
        />

        {(() => {
          const imgNode = nodes?.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
          const hasImage = !!imgNode?.data?.imageUrl;
          const imageUrl = imgNode?.data?.imageUrl as string;
          const fileName = (imgNode?.data?.fileName as string) || 'product_photo.jpg';

          if (hasImage && uploadState === 'completed') {
            return (
              <div className="p-3 bg-white rounded-2xl border border-[#E5E0D8] shadow-sm my-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    产品主图已就绪
                  </span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    已连通 DNA
                  </span>
                </div>

                <div className="relative w-full h-32 bg-stone-100 rounded-xl overflow-hidden border border-[#E5E0D8] flex items-center justify-center group">
                  <img src={imageUrl} alt={fileName} className="w-full h-full object-contain p-2" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>更换</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1">
                  <span className="truncate max-w-[180px] font-mono">{fileName}</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[#B28C5A] hover:underline font-bold flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    <span>重新上传</span>
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              onClick={() => {
                if (uploadState !== 'uploading' && uploadState !== 'analyzing') {
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && onUploadFile) {
                  onUploadFile(file);
                }
              }}
              className={`p-4 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center my-3 cursor-pointer group ${
                uploadState === 'uploading' || uploadState === 'analyzing'
                  ? 'border-amber-300 bg-amber-50/40 cursor-wait'
                  : 'border-[#E5E0D8] bg-white/70 hover:bg-white hover:border-[#B28C5A]'
              }`}
            >
              {uploadState === 'uploading' && (
                <div className="flex flex-col items-center py-2">
                  <Loader2 className="w-8 h-8 text-[#B28C5A] animate-spin mb-2" />
                  <p className="text-xs font-bold text-[#2C2A29]">正在上传产品主图...</p>
                </div>
              )}

              {uploadState === 'analyzing' && (
                <div className="flex flex-col items-center py-2">
                  <Sparkles className="w-8 h-8 text-[#B28C5A] animate-pulse mb-2" />
                  <p className="text-xs font-bold text-[#2C2A29]">正在解析 DNA 视觉特征...</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">提取造型、色彩、材质与材质纹理</p>
                </div>
              )}

              {uploadState !== 'uploading' && uploadState !== 'analyzing' && (
                <>
                  <div className="w-10 h-10 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform border border-[#E5E0D8]/60">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-[#2C2A29] mb-0.5">
                    {uploadState === 'completed' ? '重新上传产品主角图' : '点击/拖拽上传产品主角图'}
                  </p>
                  <p className="text-[10px] text-stone-400">支持 PNG, JPG, WEBP · 支持 Ctrl+V 粘贴</p>
                </>
              )}
            </div>
          );
        })()}

        {/* Phase C2: Generate 9-Grid Plan Action Button */}
        {uploadState === 'completed' && activeDna && (
          <div className="my-4 p-4 bg-[#F9F5EF] rounded-2xl border border-[#B28C5A]/40 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[#B28C5A]" />
              <div>
                <h4 className="font-bold text-xs text-[#2C2A29]">9 屏爆款详情页策划</h4>
                <p className="text-[10px] text-stone-500">基于产品 DNA 与行业模型生成全案企划</p>
              </div>
            </div>

            <button
              onClick={() => onGenerateNineGridPlan()}
              disabled={isPlanGenerating}
              className="w-full py-3 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
            >
              {isPlanGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在根据 DNA 生成九屏企划...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{agentRun?.plan ? '重新生成九屏企划' : '生成九屏企划'}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Error Alert if Any */}
        {(errorMessage || planError) && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">操作异常</p>
              <p className="text-[11px] text-rose-700 mt-0.5">{errorMessage || planError}</p>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Fixed Composer Input at Bottom */}
      <div className="p-4 border-t border-[#E5E0D8] bg-white/90 backdrop-blur-md shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="描述你希望生成的企划要求或重新策划建议……"
            className="w-full pl-4 pr-12 py-3 bg-[#F9F5EF]/80 border border-[#E5E0D8] rounded-2xl text-xs text-[#2C2A29] placeholder:text-stone-400 outline-none focus:ring-1 focus:ring-[#B28C5A] focus:border-[#B28C5A] transition-all"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="absolute right-2 p-2 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-40 text-white rounded-xl transition-all shadow-sm active:scale-95"
            title="发送"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <div className="mt-2 text-[10px] text-center text-stone-400 flex items-center justify-center gap-1">
          <CheckCircle className="w-3 h-3 text-emerald-500" />
          <span>MANWAH 视觉企划智能体 · 阶段 C2 企划工作流</span>
        </div>
      </div>

      {/* Full DNA Drawer Overlay inside Agent Panel */}
      {showFullDnaDrawer && activeDna && (
        <div className="absolute inset-0 bg-white z-40 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-[#E5E0D8] flex items-center justify-between bg-[#FDFBF7]">
            <div className="flex items-center gap-2">
              <Dna className="w-5 h-5 text-[#B28C5A]" />
              <h3 className="font-serif font-bold text-sm text-[#2C2A29]">完整 DNA 特征分析</h3>
            </div>
            <button
              onClick={() => setShowFullDnaDrawer(false)}
              className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-stone-700 custom-scrollbar">
            <div className="bg-[#F9F5EF] p-3 rounded-2xl border border-[#E5E0D8]/60">
              <span className="text-[10px] text-stone-400 font-bold block mb-1">识别品类</span>
              <p className="font-bold text-sm text-[#2C2A29]">{activeDna.category}</p>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-[#E5E0D8]">
              <span className="text-[10px] text-stone-400 font-bold block mb-1">主色与色彩搭配</span>
              <p className="font-medium mb-1">主色: <span className="font-bold text-[#2C2A29]">{activeDna.primaryColor}</span></p>
              {activeDna.secondaryColors?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {activeDna.secondaryColors.map((c, idx) => (
                    <span key={idx} className="bg-stone-100 text-stone-600 text-[10px] px-2 py-0.5 rounded-md border border-[#E5E0D8]">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-3 rounded-2xl border border-[#E5E0D8]">
              <span className="text-[10px] text-stone-400 font-bold block mb-1">材质解析</span>
              <div className="flex flex-wrap gap-1">
                {activeDna.materials?.map((mat, idx) => (
                  <span key={idx} className="bg-[#F9F5EF] text-[#B28C5A] text-[10px] px-2 py-0.5 rounded-md font-bold border border-[#E5E0D8]">
                    {mat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
