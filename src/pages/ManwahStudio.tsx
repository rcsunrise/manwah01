import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { fetchAdminStats } from './Dashboard';
import { fetchAdminUsers } from './AdminUsers';
import { fetchProfile } from './Profile';
import { Activity, UploadCloud, Search } from 'lucide-react';
import { ImageUploader } from '../components/ImageUploaderNew';
import { GeneratedView } from '../components/GeneratedViewNew';
import { AEPPanel } from '../components/AEPPanelNew';
import { PromptBuilder } from '../components/PromptBuilderNew';
import { HistoryModal } from '../components/HistoryModalNew';
import { SvgPreviewer } from '../components/SvgPreviewerNew';
import { 
  Wand2, Settings2, Trash2, Loader2, FileText, Plus, Save, X, 
  Brain, Database, History, Sparkles, UserCircle, BookOpen,
  CheckSquare, Square, PlusCircle, Key, Languages, Pause, Play,
  ChevronDown, ChevronUp, ScanFace, Tag, Maximize2, Minimize2, MinusCircle, ArrowDownUp, Lightbulb, ImageIcon
} from '../components/IconsNew';
import { generateEditedImage, generateImageDescription, rewritePrompt, analyzeImageAEP, rewritePromptWithAEP, measureImagePixels, generateVideo } from '../services/geminiService';
import { dbService, MAX_STORAGE_BYTES } from '../services/dbService';
import { supabase } from '../lib/supabase';
import { CRAFT_VOCABULARY, CraftVocabItem } from '../data/craftVocab';
import { ImageAttachment, UIAspRatioOption, Resolution, GeneratedResult, ModelType, SupportedAspectRatio, PromptTemplate, HistoryItem, ProcessingChannel, AEPData, GenerationTask, MAX_HISTORY_TASKS } from '../types';

const API_SUPPORTED_ASPECT_RATIOS = new Set<SupportedAspectRatio>([
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'
]);

const PRESET_0 = `画面重绘，删除画面中的水印。`;
const PRESET_1 = `[SYSTEM_TRIGGER:PATENT_ISOLATION] 对上传的产品图进行工业专利级绝对去背。核心要求：1. 背景必须为完全纯白（HEX #FFFFFF），严禁出现任何地面、地平线、室外场景或灰色渐变环境光。2. 画面仅允许在沙发金属脚正下方保留极轻微的、物理隔离的独立接触阴影（Isolated contact shadows underneath legs），严禁产生大面积地面投影或倒影。3. 100%保持产品本身的几何造型、皮革材质与原有光影，严禁添加任何额外线条或褶皱。4. 像素级锁死沙发所有的五金配件，包括侧面按钮、LOGO标识及功能架，严禁抠图篡改或模糊。`;
const PRESET_2 = `图1的全部产品套用图2的 材质，保留图1整体细节与外观，保留产品比例与透视不变。 光影，造型不变，生成1%浅灰阴影。 The product in Figure 1 adopts the material of Figure 2, retaining the overall details and appearance of Figure 1, while keeping the product's proportion and perspective unchanged. Light and shadow, the shape remains unchanged, generating a 1% light gray shadow.`;
const PRESET_3 = `将窗口1沙发置入到窗口2的场景中，保持窗口1产品不变。删除窗口2左下角、右下角单人沙发、地毯上茶几，按沙发调性更换挂画、边角茶几配饰，地毯为简单款式且完全下压于沙发，自然柔和光线`;
const PRESET_4 = `请根据上传的参考图生成一张专业的六视图。
要求：
1. 以六视图正交投影网格 (2x3) 呈现。
2. 网格排列：顶行 (左-右) 严格正左侧侧视图、严格正视图、严格正右侧侧视图；底行 (左-右) 严格左 45° 视图、严格后视图、严格右 45° 视图。
3. 对于所有视图：严格的正交透视，相机严格水平，严格的平视角度，零度仰角。没有自上而下的透视，没有下降的角度，绝对没有俯视图。
4. 仅在干净白色背景上。
5. 参考上传图样模板的相机角度以实现严格的正交性。
6. 准确识别沙发产品与准确标记沙发的。
特别注意：
1. 比例一致性：严格保持正视图宽度与侧视图深度的比例一致。侧视图绝对不能画窄，否则会导致45°视图空间被压缩变形。
2. 结构完整性：准确识别并保留原图的座包数量。例如3人位沙发必须有至少2条明显的垂直分割缝线，绝不能在45°视图中将3人位画成2人位。`;
const PRESET_5 = `窗口1沙发的精确黑白专利风格线稿，以六视图正交投影网格 (2x3) 呈现。（网格排列：顶行 (左-右) 严格正左侧侧视图、严格正视图、严格正右侧侧视图；底行 (左-右) 严格左 45° 视图、严格后视图、严格右 45° 视图）。（对于所有视图：严格的正交透视，相机严格水平，严格的平视角度，零度仰角。没有自上而下的透视，没有下降的角度，绝对没有俯视图）。仅在干净白色背景上的线稿。（参考窗口2 的相机角度以实现严格的正交性）。准确识别窗口1沙发产品与准确标记窗口1沙发的尺寸。
特别注意（基于MW_PRO_4K_260311_1025标准）：
1. 比例一致性：严格保持正视图宽度与侧视图深度的比例一致。侧视图绝对不能画窄，否则会导致45°视图空间被压缩变形。
2. 结构完整性：准确识别并保留原图的座包数量。例如3人位沙发必须有至少2条明显的垂直分割缝线，绝不能在45°视图中将3人位画成2人位。`;
const PRESET_6 = `为窗口创建产品符合调性的场景图。`;
const PRESET_7 = `[SYSTEM_TRIGGER:LINEART_TRANSFORM] 请根据上传的沙发线稿，严格保持原图 3/4 侧前透视视角、座位配置与功能五金状态。系统自动识别线稿语意：当前几何直线条必须精准还原为“紧致平整的皮面块面”与“精致高档的嵌入式双针明车缝线（Crisp flush contrast topstitching lines）”。皮革表面保持丰满挺括，严禁渲染出任何深陷的拉点、臃肿褶皱或错位阴影，完全对齐高精数码打样标准。单色影棚光。`;

const DEFAULT_ROLE = "Technical Illustrator";
const MAX_TEMPLATES = 50;

const ROLE_CN_MAP: Record<string, string> = {
  'Technical Illustrator': '技术插画师',
  'TECHNICAL ILLUSTRATOR': '技术插画师',
  'Visual Designer': '视觉设计师',
  'VISUAL DESIGNER': '视觉设计师',
  'Industrial Designer': '工业设计师',
  'INDUSTRIAL DESIGNER': '工业设计师',
  'Furniture Designer': '家具设计师',
  'FURNITURE DESIGNER': '家具设计师',
  'Interior Designer': '空间设计师',
  'INTERIOR DESIGNER': '空间设计师',
  '全部': '全部'
};

const getRoleDisplayName = (role: string): string => {
  if (!role) return '';
  const trimmed = role.trim();
  return ROLE_CN_MAP[trimmed] || ROLE_CN_MAP[trimmed.toUpperCase()] || trimmed;
};

const INITIAL_CHANNELS: ProcessingChannel[] = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    name: `产品通道 ${i + 1}`,
    images: [],
    isEnabled: i === 0,
    status: 'idle',
    result: null,
    error: undefined
}));

// 1. 定义全局比例常数
const REFERENCE_WIDTH_MM = 2820; // 基准宽度
const REFERENCE_PX_2K = 357;     // 2K下对应的像素宽度
const K_FACTOR_2K = 7.9;         // 7.9mm/px

/**
 * 核心逻辑：将物理尺寸转化为网格占比像素
 */
const calculateSofaGrid = (w: number, d: number, resolution: Resolution) => {
  // 1K is roughly half of 2K, 4K is double 2K.
  // The user prompt says: "4K 下的像素密度是 2K 的两倍，因此 K 系数需要减半以保持物理尺寸一致"
  let k = K_FACTOR_2K;
  if (resolution === '4K') k = K_FACTOR_2K / 2;
  if (resolution === '1K') k = K_FACTOR_2K * 2; // Assuming 1K is half the resolution of 2K
  if (resolution === '512px') k = K_FACTOR_2K * 4; // Assuming 512px is half of 1K
  
  return {
    wPx: Math.round(w / k),
    dPx: Math.round(d / k),
    // 45°视图投影宽度计算，防止空间挤压导致座包丢失
    isoPx: Math.round((w * 0.707 + d * 0.707) / k),
    unit: `1px ≈ ${k.toFixed(2)}mm`
  };
};

const getSofaPrompt = (dimensions: any, seatCount: number, isRatioLocked: boolean, show6View: boolean) => {
  if (!show6View) {
    return `Single high-quality perspective view of the product.
    Hard Constraint: Maintain ${seatCount} cushions. Each cushion must be separated by distinct vertical lines.`;
  }

  // 1. 基础骨架定义
  const baseStructure = `Create a 2x3 grid showing 6 orthographic and perspective views of the product.
    Top Row (Left to Right): 
    1. Strict Left Profile (Orthographic, sofa facing right).
    2. Strict Front View (Orthographic, sofa facing directly forward).
    3. Strict Right Profile (Orthographic, sofa facing left).
    Bottom Row (Left to Right):
    1. Strict Left 45 degree perspective (Showing front and left side).
    2. Strict Back View (Orthographic, sofa facing away).
    3. Strict Right 45 degree perspective (Showing front and right side).
    
    CRITICAL ANGLE REQUIREMENT: For all views, use strict orthographic perspective, camera strictly horizontal, strict eye-level angle, zero degree elevation. NO top-down perspective, NO downward angle, ABSOLUTELY NO bird's-eye view. Reference the camera angle of the uploaded pattern template to achieve strict orthogonality.`;

  // 2. 物理尺寸约束
  const noTextInstruction = `CRITICAL: DO NOT draw any dimension lines, text labels, measurement arrows, or technical annotations on the image. The image must be a clean line art without any overlaid text or lines.`;
  const ratioD = (dimensions.depth / dimensions.width * 100).toFixed(1);
  const ratioH = (dimensions.height / dimensions.width * 100).toFixed(1);

  const dimConstraint = `[PARAMETRIC MODE] 
      Primary Anchor: Width ${dimensions.width}mm.
      
      // 强制六视图比例对齐
      - Front View: Base reference width.
      - Side View: Draw the side view such that its pixel width is exactly ${ratioD}% (${dimensions.depth}/${dimensions.width}) of the front view width. Do not hallucinate depth.
      - Height: Draw the height such that its pixel height is exactly ${ratioH}% (${dimensions.height}/${dimensions.width}) of the front view width.
      
      // 标注层指示
      ${noTextInstruction}`;

  // 3. 模式特定逻辑
  return `[MODE: PATENT LINE ART]
    ${baseStructure}
    ${dimConstraint}
    Style: Clean black lines, white background, no shading, patent drawing standard.
    Hard Constraint: Maintain ${seatCount} cushions. Each cushion must be separated by distinct vertical lines.
    Technical: Use precise geometric edge following for accurate structure.`;
};

const highlightRedText = (text: string) => {
  if (!text) return text;
  const parts = text.split(/(红笔|红色标记|圈出|红圈|红色|涂抹|标记|红框|红色部位|红圈标记)/g);
  return parts.map((part, i) => 
    /(红笔|红色标记|圈出|红圈|红色|涂抹|标记|红框|红色部位|红圈标记)/.test(part) ? 
    <span key={i} className="text-red-500 font-bold">{part}</span> : part
  );
};

const App: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [channels, setChannels] = useState<ProcessingChannel[]>(INITIAL_CHANNELS);
  const [sceneImages, setSceneImages] = useState<ImageAttachment[]>([]);
  const [isSceneEnabled, setIsSceneEnabled] = useState(true);
  const [generationHistory, setGenerationHistory] = useState<GenerationTask[]>([]);
  const [prompt, setPrompt] = useState<string>(PRESET_0);
  
  const [assistantRole, setAssistantRole] = useState(DEFAULT_ROLE);
  const [assistantIdea, setAssistantIdea] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteSuccess, setRewriteSuccess] = useState(false);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<string | null>(null);
  const [imageAnalysisSuggestions, setImageAnalysisSuggestions] = useState<any[] | null>(null);
  const [selectedSuggestionIndices, setSelectedSuggestionIndices] = useState<number[]>([]);

  const [aspectRatio, setAspectRatio] = useState<UIAspRatioOption | string>('Auto'); 
  const [customAspectRatio, setCustomAspectRatio] = useState<string>('');
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [resolution, setResolution] = useState<Resolution>('2K');
  const [model, setModel] = useState<ModelType>('gemini-3.1-flash-image');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isChannelsCollapsed, setIsChannelsCollapsed] = useState(false);
  const [isSceneCollapsed, setIsSceneCollapsed] = useState(true);
  const [isPromptCollapsed, setIsPromptCollapsed] = useState(true);
  const [isComputeCollapsed, setIsComputeCollapsed] = useState(true);
  const pausedRef = useRef(false);
  
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showCraftLibrary, setShowCraftLibrary] = useState(false);
  const [craftCategoryFilter, setCraftCategoryFilter] = useState('All');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [storageUsed, setStorageUsed] = useState(0);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [libraryCategory, setLibraryCategory] = useState<string>('全部');

  const [dimensions, setDimensions] = useState({ width: 2820, depth: 1000, height: 900 });
  const [isRatioLocked, setIsRatioLocked] = useState(false);
  const [seatCount, setSeatCount] = useState(3);
  const [showDimensionControls, setShowDimensionControls] = useState(false);

  // AEP State
  const [aepData, setAepData] = useState<AEPData | null>(null);
  const [showAEPPanel, setShowAEPPanel] = useState(false);
  const [isAepPanelPinned, setIsAepPanelPinned] = useState(true); // Default pinned
  const [promptMode, setPromptMode] = useState<'auto' | 'manual'>('auto');
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [visibleChannelCount, setVisibleChannelCount] = useState(1);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [isDeepThinking, setIsDeepThinking] = useState(false);
  const [namingPreset, setNamingPreset] = useState<'standard' | 'detailed' | 'custom'>('detailed');
  const [customPrefix, setCustomPrefix] = useState('');
  
  // Check if current depth deviates significantly from AI estimate
  const isDepthDeviating = aepData?.dimensionEstimate && 
    Math.abs(dimensions.depth - aepData.dimensionEstimate.estD) / aepData.dimensionEstimate.estD > 0.2;
  
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle dimension changes with ratio lock
  const handleDimensionChange = (field: 'width' | 'depth' | 'height', value: number) => {
    if (isRatioLocked && field === 'width') {
      setDimensions({
        width: value,
        depth: Math.round(value * 0.375),
        height: Math.round(value * 0.303)
      });
    } else {
      setDimensions(prev => ({ ...prev, [field]: value }));
    }
  };

  useEffect(() => {
    if (promptMode === 'auto') {
      const basePrompt = getSofaPrompt(dimensions, seatCount, isRatioLocked, showDimensionControls);
      if (aepData) {
        // Debounce the rewrite to avoid spamming the API on every keystroke
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(async () => {
            setIsRewriting(true);
            try {
                const newPrompt = await rewritePromptWithAEP(basePrompt, aepData, isDeepThinking, () => {}, showDimensionControls);
                setPrompt(newPrompt);
            } catch (e) {
                console.error(e);
            } finally {
                setIsRewriting(false);
                debounceTimerRef.current = null;
            }
        }, 800);
      } else {
        setPrompt(basePrompt);
      }
    }
  }, [dimensions, seatCount, isRatioLocked, promptMode, aepData, isDeepThinking, showDimensionControls]);

  const handleEditTemplate = (t: PromptTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTemplateId(t.id);
    setEditingContent(t.content);
  };

  const saveEditedTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const template = templates.find(t => t.id === id);
    if (template) {
        const updated = { ...template, content: editingContent };
        await dbService.saveTemplate(updated);
        setTemplates(prev => prev.map(t => t.id === id ? updated : t));
    }
    setEditingTemplateId(null);
  };

  const [isNamingTemplate, setIsNamingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncToBackend = async () => {
    setIsSyncing(true);
    try {
       let hasNewSystem = false;
       for (const t of templates) {
          let st = { ...t };
          if (!st.id.startsWith('p')) {
             st.id = 'p_' + st.id;
             hasNewSystem = true;
          }
          const { error } = await supabase.from('system_prompts').upsert(st);
          if (error) console.warn("Failed to sync template to system_prompts:", error);
          
          if (!t.id.startsWith('p')) {
             // Delete the original personal template so it doesn't duplicate
             await dbService.deleteTemplate(t.id);
          }
       }
       alert("预设已成功同步至后台，所有商企用户均可查看！");
       if (hasNewSystem) {
           refreshTemplates();
       }
    } catch (e) {
       alert("同步失败，请检查网络或权限：" + e);
    }
    setIsSyncing(false);
  };

  useEffect(() => {
    const initData = async () => {
      try {
        await dbService.init();
        refreshTemplates();
        refreshStorageStats();
        
        // Fetch profile
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('nickname, username, role')
            .eq('id', user.id)
            .single();
          setUserProfile(data);
        }
      } catch (e) {
        console.error("Failed to init DB", e);
      }
    };
    initData();
  }, []);

  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);

  const refreshTemplates = async () => {
    const t = await dbService.getTemplates();
    
    // Define all default system presets
    const defaultSystemPresets: PromptTemplate[] = [
         { id: 'p0', name: '起手式：画面重绘', content: PRESET_0, role: DEFAULT_ROLE, timestamp: Date.now() + 6 },
         { id: 'p1', name: '1. 专利级高精去背 TECHNICAL ILLUSTRATOR', content: PRESET_1, role: DEFAULT_ROLE, timestamp: Date.now() + 5 },
         { id: 'p2', name: '2. 换材质', content: PRESET_2, role: DEFAULT_ROLE, timestamp: Date.now() + 4 },
         { id: 'p3', name: '3. 家具融合', content: PRESET_3, role: DEFAULT_ROLE, timestamp: Date.now() + 3 },
         { id: 'p4', name: '4. 产品六视图', content: PRESET_4, role: DEFAULT_ROLE, timestamp: Date.now() + 2 },
         { id: 'p5', name: '5. 线稿六视图', content: PRESET_5, role: 'Technical Illustrator', timestamp: Date.now() + 2 },
         { id: 'p6', name: '6. 场景创建', content: PRESET_6, role: DEFAULT_ROLE, timestamp: Date.now() + 1 },
         { id: 'p7', name: '7. 产品线稿高保真转绘（几何明缝线版）', content: PRESET_7, role: 'Technical Illustrator', timestamp: Date.now() },
    ];

    // Check and add missing or updated default system presets
    let defaultsToSave: PromptTemplate[] = [];
    for (const defaultPreset of defaultSystemPresets) {
      const existingIndex = t.findIndex(existing => existing.id === defaultPreset.id);
      if (existingIndex === -1) {
        t.push(defaultPreset);
        defaultsToSave.push(defaultPreset);
      } else {
        const existing = t[existingIndex];
        if (existing.content !== defaultPreset.content || existing.name !== defaultPreset.name) {
          t[existingIndex] = defaultPreset;
          defaultsToSave.push(defaultPreset);
        }
      }
    }
    
    if (defaultsToSave.length > 0) {
        // Attempt to bootstrap defaults into the DB
        setTimeout(() => {
            Promise.all(defaultsToSave.map(preset => dbService.saveTemplate(preset)))
                .catch(e => console.warn("Bootstrap: Could not save default system templates to DB", e));
        }, 1000);
    }

    const getLeadingNumber = (name: string): number | null => {
      const match = name.trim().match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    };

    const sorted = t.sort((a, b) => {
        const numA = getLeadingNumber(a.name);
        const numB = getLeadingNumber(b.name);

        if (numA !== null && numB !== null) {
            // Both are numbered: sort ascending (1, 2, 3...)
            return numA - numB;
        }
        if (numA !== null) {
            // Numbered first
            return -1;
        }
        if (numB !== null) {
            // Numbered first
            return 1;
        }

        // Both are unnumbered: sort by timestamp ascending (earliest first - "录入时间先后")
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        if (timeA !== timeB) {
            return timeA - timeB;
        }
        return a.name.localeCompare(b.name);
    });
    setTemplates(sorted);
  };

  const refreshStorageStats = async () => {
    const stats = await dbService.getStorageStats();
    setStorageUsed(stats.usedBytes);
    setHistoryItems(await dbService.getHistory());
  };

  const getModelDisplayName = () => {
    if (model.includes('lite')) return '3.1-LITE';
    if (model.includes('pro')) return '3-PRO';
    if (model.includes('flash')) return '3.1-FLASH';
    return model.replace('gemini-', '').toUpperCase();
  };

  const handleApiKeySettings = async () => {
    const aiStudio = (window as any).aistudio;
    if (aiStudio) await aiStudio.openSelectKey();
  };

  const handleAuthError = async (err: any) => {
      const msg = err.message || err.toString();
      if (msg.includes('403') || msg.includes('401') || msg.includes('API Key not found')) {
          const aiStudio = (window as any).aistudio;
          if (aiStudio) { await aiStudio.openSelectKey(); return true; }
      }
      return false;
  };

  const updateChannel = (id: number, updates: Partial<ProcessingChannel>) => {
      setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const updateTask = (taskId: string, updates: Partial<GenerationTask>) => {
      setGenerationHistory(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  };

  const handleDeleteTask = (taskId: string) => {
      setGenerationHistory(prev => prev.filter(t => t.id !== taskId));
  };

  const handleAnalyzeAEP = async () => {
    const activeChannel = channels.find(c => c.isEnabled && c.images.length > 0);
    if (!activeChannel || activeChannel.images.length === 0) {
      setError("请先上传产品图片 (Please upload product images first)");
      return;
    }
    
    setIsThinking(true);
    try {
      const data = await analyzeImageAEP(activeChannel.images[0], isDeepThinking, (msg) => console.log(msg));
      setAepData(data);
      
      // Apply dimension estimates if available
      if (data.dimensionEstimate) {
          setDimensions({
              width: data.dimensionEstimate.estW,
              depth: data.dimensionEstimate.estD,
              height: data.dimensionEstimate.estH
          });
          if (data.dimensionEstimate.confidence > 0.8) {
              setIsRatioLocked(true);
          }
      }

      setShowAEPPanel(true);
      setPromptMode('auto');
      setShowDimensionControls(false);
      // The useEffect will automatically handle rewriting the prompt with the new AEP data
    } catch (e: any) {
      setError("AEP Analysis failed: " + e.message);
    } finally {
      setIsThinking(false);
    }
  };

  const handleAEPUpdate = async (newData: AEPData) => {
    setAepData(newData);
    // The useEffect will automatically handle rewriting the prompt with the new AEP data
  };

  // --- NEW: RESULT FEEDBACK LOOP ---
  const handleSetAsReference = (imageUrl: string) => {
    // Extract MIME type and base64 data safely
    const mimeMatch = imageUrl.match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const base64Data = imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;

    // Create new ImageAttachment from the generated image URL (base64)
    const newImageId = crypto.randomUUID();
    const newImage: ImageAttachment = {
        id: newImageId,
        previewUrl: imageUrl,
        base64Data: base64Data,
        mimeType: mimeType,
        width: 1024, // Default or placeholder, will be updated if needed
        height: 1024,
        isAiOptimized: true
    };

    // Update Channel 1
    setChannels(prev => prev.map(c => {
        if (c.id === 1) {
            // Backup existing images if they are not already backups (or just store the first one as original)
            // For simplicity, we attach the *first* original image as backup to the new image
            // if the current image is NOT already optimized.
            
            const currentImages = c.images;
            let originalBackup: ImageAttachment | undefined;

            if (currentImages.length > 0) {
                // If the current image is already optimized, keep its backup. 
                // If not, the current image IS the original.
                if (currentImages[0].isAiOptimized) {
                    originalBackup = currentImages[0].originalBackup;
                } else {
                    originalBackup = currentImages[0];
                }
            }

            if (originalBackup) {
                newImage.originalBackup = originalBackup;
            }

            return {
                ...c,
                images: [newImage], // Replace with the single optimized image
                isEnabled: true
            };
        }
        return c;
    }));
  };

  const handleRestoreOriginal = (imageId: string) => {
    setChannels(prev => prev.map(c => {
        // Find the channel containing this image
        if (c.images.some(img => img.id === imageId)) {
            const imageToRestore = c.images.find(img => img.id === imageId);
            if (imageToRestore && imageToRestore.isAiOptimized && imageToRestore.originalBackup) {
                // Restore the original backup
                return {
                    ...c,
                    images: [imageToRestore.originalBackup]
                };
            }
        }
        return c;
    }));
  };

  // --- NEW: DISTRIBUTION LOGIC FOR PRODUCT CHANNELS ---
  const handleImagesAddedToChannel = (targetId: number, newImages: ImageAttachment[]) => {
    if (newImages.length === 0) return;

    // If only one image is added, just append it normally to the target channel
    if (newImages.length === 1) {
      setChannels(prev => prev.map(c => 
        c.id === targetId 
          ? { ...c, images: [...c.images, ...newImages], isEnabled: true } 
          : c
      ));
      return;
    }

    // If multiple images are added, distribute them across channels starting from targetId
    setChannels(prev => {
      const newChannels = [...prev];
      const startIndex = newChannels.findIndex(c => c.id === targetId);
      
      newImages.forEach((img, idx) => {
        const currentChannelIdx = startIndex + idx;
        if (currentChannelIdx < newChannels.length) {
          newChannels[currentChannelIdx] = {
            ...newChannels[currentChannelIdx],
            images: [...newChannels[currentChannelIdx].images, img],
            isEnabled: true // Auto-enable the channel when it receives an image
          };
        }
      });
      return newChannels;
    });
    
    // Update visible count to ensure all populated channels are shown
    const startIndex = targetId - 1;
    const maxChannelIndexUsed = Math.min(startIndex + newImages.length - 1, 5); // Max 6 channels (0-5)
    setVisibleChannelCount(prev => Math.max(prev, maxChannelIndexUsed + 1));
  };

  const handleLoadTemplate = (t: PromptTemplate) => {
    setPrompt(t.content);
    if (t.role) setAssistantRole(t.role);
    setShowLibrary(false);
  };

  const handleSaveCurrentToLibrary = async () => {
    if (!prompt.trim()) return;
    if (templates.length >= MAX_TEMPLATES) {
        setError(`预设库已满（上限 ${MAX_TEMPLATES} 组），请先删除部分旧预设。`);
        return;
    }
    setIsNamingTemplate(true);
  };

  const confirmSaveTemplate = async () => {
      if (!newTemplateName.trim()) return;
      const newT: PromptTemplate = {
          id: crypto.randomUUID(),
          name: newTemplateName,
          content: prompt,
          role: assistantRole,
          timestamp: Date.now()
      };
      await dbService.saveTemplate(newT);
      setIsNamingTemplate(false);
      setNewTemplateName('');
      refreshTemplates();
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await dbService.deleteTemplate(id);
      refreshTemplates();
  };

  const handleSmartPrompt = async () => {
    const activeChannel = channels.find(c => c.isEnabled && c.images.length > 0);
    if (!activeChannel && !assistantIdea.trim()) {
      setError("Please provide context or images.");
      return;
    }
    setIsThinking(true);
    try {
       const result = await generateImageDescription(assistantRole, assistantIdea, activeChannel?.images || [], isSceneEnabled ? sceneImages : [], isDeepThinking, () => {});
       setPrompt(result.prompt);
       if (result.features) {
         setImageAnalysisResult(result.features);
       }
       if (result.suggestions && result.suggestions.length > 0) {
         setImageAnalysisSuggestions(result.suggestions);
       }
    } catch (e: any) {
      if (!(await handleAuthError(e))) setError("Assistant error: " + e.message);
    } finally { setIsThinking(false); }
  };

  const handleRewritePrompt = async () => {
      if (!prompt.trim()) return;
      setIsRewriting(true);
      try {
          const optimized = await rewritePrompt(prompt, isDeepThinking, () => {});
          setPrompt(optimized);
          setRewriteSuccess(true);
          setTimeout(() => setRewriteSuccess(false), 3000);
      } catch (e: any) { await handleAuthError(e); } finally { setIsRewriting(false); }
  };

  const toggleSuggestion = (idx: number) => {
    setSelectedSuggestionIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleSyncSuggestions = () => {
    if (selectedSuggestionIndices.length === 0 || !imageAnalysisSuggestions) return;
    
    const clauses = selectedSuggestionIndices.map(idx => {
      const s = imageAnalysisSuggestions[idx];
      // 清理字段末尾可能存在的标点符号，确保拼接顺畅
      const part = s.part.trim().replace(/[，。；]$/, "");
      const inst = s.instruction.trim().replace(/[，。；]$/, "");
      const effect = s.effect.trim().replace(/[，。；]$/, "");
      return `${part}，${inst}，${effect}`;
    });

    const formattedPrompt = `画面重绘，${clauses.join("；")}。其他保持不变。`;
    
    setPrompt(prev => prev ? `${prev}\n${formattedPrompt}` : formattedPrompt);
    setSelectedSuggestionIndices([]); // Clear selection after sync
    setPromptMode('manual'); // Switch to manual mode if it was auto to ensure user can see/edit the merged prompt
  };

  const processTaskGeneration = async (task: GenerationTask) => {
    const channel = channels.find(c => c.id === task.channelId);
    if (!channel) return;
    
    let finalAspectRatio = aspectRatio;

    if (aspectRatio === 'Custom') {
        finalAspectRatio = customAspectRatio;
    } else if (aspectRatio === 'Auto') {
        finalAspectRatio = 'Auto';
    }

    try {
        const inputImages = isSceneEnabled ? [...channel.images, ...sceneImages] : [...channel.images];
        const finalPromptForGen = imageAnalysisResult ? `参考产品的特征标准化描述：\n${imageAnalysisResult}\n\n设计要求：\n${prompt}` : prompt;
        const genResponse = await generateEditedImage(finalPromptForGen, inputImages, finalAspectRatio, resolution, model, seed, () => {});
        let finalResult = genResponse.imageUrl;
        let pointsUsed = genResponse.pointsUsed;
        let finalPrompt = finalPromptForGen;
        let measurements;
        let isBetaRedraw = false;

        if (showDimensionControls) {
          try {
            measurements = await measureImagePixels(finalResult, dimensions.width, () => {});
            
            // Beta Phase: Data Alignment & Secondary Redraw
            if (measurements) {
              const depthDev = Math.abs(measurements.calculatedD - dimensions.depth) / dimensions.depth;
              const heightDev = Math.abs(measurements.calculatedH - dimensions.height) / dimensions.height;

              if (depthDev > 0.05 || heightDev > 0.05) {
                console.log("Alpha phase deviation > 5%. Initiating Beta phase redraw...");
                // Indicate beta phase in UI if needed, though we don't have a specific status for it yet
                
                const betaPrompt = `${prompt}\n\n[BETA CORRECTION - STRICT ENFORCEMENT]:
The previous generation failed the scale audit. 
Measured Depth: ${measurements.calculatedD}mm (Target: ${dimensions.depth}mm, Deviation: ${(depthDev*100).toFixed(1)}%)
Measured Height: ${measurements.calculatedH}mm (Target: ${dimensions.height}mm, Deviation: ${(heightDev*100).toFixed(1)}%)
You MUST adjust the proportions. The side view width MUST be exactly ${Math.round((dimensions.depth / dimensions.width) * 100)}% of the front view width. The height MUST be exactly ${Math.round((dimensions.height / dimensions.width) * 100)}% of the front view width.`;

                const betaResponse = await generateEditedImage(betaPrompt, inputImages, finalAspectRatio, resolution, model, seed, () => {});
                finalResult = betaResponse.imageUrl;
                pointsUsed += betaResponse.pointsUsed;
                finalPrompt = betaPrompt;
                measurements = await measureImagePixels(finalResult, dimensions.width, () => {});
                isBetaRedraw = true;
              }
            }
          } catch (e) {
            console.error("Failed to measure image pixels or perform beta redraw", e);
          }
        }

        const resultObj = { 
            imageUrl: finalResult, 
            prompt: finalPrompt, 
            timestamp: Date.now(),
            cropRetentionRate: genResponse.cropRetentionRate,
            finalFitModeUsed: genResponse.finalFitModeUsed
        };
        const duration = task.startTime ? (Date.now() - task.startTime) / 1000 : 0;

        updateTask(task.id, { 
            result: resultObj, 
            status: 'success', 
            duration, 
            measurements, 
            labelAlignmentMode: isRatioLocked ? 'locked' : 'default',
            isBetaRedraw,
            pointsUsed,
            cropRetentionRate: genResponse.cropRetentionRate,
            finalFitModeUsed: genResponse.finalFitModeUsed
        });
        
        // Also update channel result for reference if needed
        updateChannel(task.channelId, { result: resultObj, status: 'success', measurements }); 
        
        await dbService.saveToHistory({ id: crypto.randomUUID(), imageUrl: finalResult, prompt: finalPrompt, model: (genResponse.actualModel || model) as ModelType, roleUsed: assistantRole, timestamp: Date.now() });
    } catch (err: any) {
        const duration = task.startTime ? (Date.now() - task.startTime) / 1000 : 0;
        if (!(await handleAuthError(err))) updateTask(task.id, { status: 'error', error: err.message, duration });
        throw err;
    }
  };

  const handleGenerate = async () => {
    let active = channels.filter(c => c.isEnabled);

    // Optimization: If no channel is enabled but we have a prompt, 
    // automatically enable the first channel to allow text-to-image generation.
    if (active.length === 0 && prompt.trim() && channels.length > 0) {
        const firstChannel = channels[0];
        updateChannel(firstChannel.id, { isEnabled: true });
        active = [{ ...firstChannel, isEnabled: true }];
    }

    if (!active.length || !prompt.trim()) { setError("Check your inputs."); return; }
    setIsGenerating(true);
    setError(null);
    
    // Create new tasks
    const newTasks: GenerationTask[] = active.map(c => ({
        id: crypto.randomUUID(),
        channelId: c.id,
        channelName: c.name,
        status: 'waiting',
        result: null,
        startTime: Date.now(),
        model: model,
        resolution: resolution,
        dimensions: showDimensionControls ? { ...dimensions } : undefined
    }));

    // Add to history (prepend) and limit to MAX_HISTORY_TASKS
    setGenerationHistory(prev => [...newTasks, ...prev].slice(0, MAX_HISTORY_TASKS));

    try {
        for (const task of newTasks) {
            while (pausedRef.current) await new Promise(r => setTimeout(r, 500));
            updateTask(task.id, { status: 'generating', startTime: Date.now() });
            try { await processTaskGeneration(task); } catch { /* Continue to next */ }
        }
    } finally { setIsGenerating(false); refreshStorageStats(); }
  };

  const handleGenerateVideo = async (imageUrl: string) => {
    try {
      // Find the task to get the prompt, or use current prompt
      const task = generationHistory.find(t => t.result?.imageUrl === imageUrl);
      const videoPrompt = task?.result?.prompt || prompt || 'A high quality video of this scene';
      
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        const dummyImage: ImageAttachment = {
          id: 'video-src',
          file: new File([blob], 'image.jpg', { type: blob.type }),
          previewUrl: imageUrl,
          base64Data: base64data,
          mimeType: blob.type,
          width: 1080,
          height: 1080
        };

        setIsGenerating(true);
        try {
          const videoUrl = await generateVideo(videoPrompt, dummyImage, '16:9', () => {});
          
          // Add a new task for the video result
          const newTask: GenerationTask = {
            id: crypto.randomUUID(),
            channelId: task?.channelId || 1,
            channelName: (task?.channelName || 'Video') + ' (Animation)',
            status: 'success',
            startTime: Date.now(),
            result: {
              imageUrl: videoUrl, // We store videoUrl in imageUrl for simplicity
              prompt: videoPrompt,
              timestamp: Date.now()
            }
          };
          setGenerationHistory(prev => [newTask, ...prev].slice(0, MAX_HISTORY_TASKS));
        } catch (e: any) {
          setError("Video generation failed: " + e.message);
        } finally {
          setIsGenerating(false);
        }
      };
    } catch (e: any) {
      setError("Failed to prepare video generation: " + e.message);
    }
  };

  const handleReset = () => {
    setChannels(INITIAL_CHANNELS);
    setPrompt(PRESET_0);
    setError(null);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  };

  return (
    <div className="flex flex-col h-full md:min-h-screen bg-brand-cream text-brand-charcoal font-sans">
      {/* Header */}
      <header className="hidden md:block sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-brand-taupe premium-shadow">
        <div className="max-w-[1600px] mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gold-gradient rounded-full flex items-center justify-center shadow-sm">
              <span className="font-serif font-bold text-lg text-white">MW</span>
            </div>
            <div className="flex flex-col">
              <h1 className="font-serif font-bold text-xl tracking-tight leading-none">
                MANWAH | <span className="text-brand-gold">AI 国内商品企划中心</span>
              </h1>
              <p className="text-[9px] text-stone-400 tracking-[0.15em] font-bold uppercase mt-1">DOMESTIC PRODUCT PLANNING CENTER</p>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <button 
              onMouseEnter={() => queryClient.prefetchQuery({ queryKey: ['user-profile'], queryFn: fetchProfile, staleTime: 1000 * 60 * 5 })}
              onClick={() => navigate('/profile')} 
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-brand-gold/20 text-brand-gold text-xs font-bold hover:bg-brand-gold/5 transition-all"
            >
              <UserCircle className="w-3.5 h-3.5" /> 
              <span className="hidden md:inline">
                {userProfile ? `欢迎您，${userProfile.nickname || userProfile.username || '用户'}` : '个人中心'}
              </span>
            </button>
            <button 
              onMouseEnter={() => queryClient.prefetchQuery({ queryKey: ['dashboard-stats'], queryFn: fetchAdminStats, staleTime: 1000 * 60 * 5 })}
              onClick={() => navigate('/dashboard')} 
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-brand-gold/20 text-brand-gold text-xs font-bold hover:bg-brand-gold/5 transition-all"
            >
              <Activity className="w-3.5 h-3.5" /> <span className="hidden md:inline">控制面板</span>
            </button>
            {userProfile?.role === 'admin' && (
              <button 
                onMouseEnter={() => queryClient.prefetchQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers, staleTime: 1000 * 60 * 5 })}
                onClick={() => navigate('/admin/users')} 
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-brand-gold/20 text-brand-gold text-xs font-bold hover:bg-brand-gold/5 transition-all"
              >
                <UserCircle className="w-3.5 h-3.5" /> <span className="hidden md:inline">管理账号</span>
              </button>
            )}
            <button onClick={handleApiKeySettings} className="flex items-center gap-2 px-4 py-2 rounded-full border border-brand-gold/20 text-brand-gold text-xs font-bold hover:bg-brand-gold/5 transition-all">
              <Key className="w-3.5 h-3.5" /> <span className="hidden md:inline">API Access</span>
            </button>
            <button onClick={() => setShowHistory(true)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-beige border border-brand-taupe text-xs font-bold text-stone-500 hover:bg-brand-gold/10 transition-colors" title="查看历史记录">
               <History className="w-3.5 h-3.5 text-brand-gold" /> 
               <span className="hidden md:inline">历史记录</span>
               <span className="text-[10px] opacity-70">({formatBytes(storageUsed)})</span>
            </button>
            <div className="hidden sm:block px-4 py-2 rounded-full bg-brand-charcoal text-white text-[10px] font-bold tracking-widest">{getModelDisplayName()}</div>
          </div>
        </div>
      </header>

      {/* Craft Library Modal */}
      {showCraftLibrary && (
        <div className="fixed inset-0 z-[100] bg-brand-charcoal/40 backdrop-blur-sm flex justify-center items-center p-6 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-brand-taupe">
             <div className="p-8 border-b border-brand-taupe flex justify-between items-center bg-brand-beige/30 shrink-0">
                <div className="flex flex-col">
                    <h3 className="font-serif font-bold text-2xl text-brand-charcoal flex items-center gap-3">
                        <Tag className="w-6 h-6 text-brand-gold" />
                        工艺词库 (Craftsmanship Library)
                    </h3>
                    <p className="text-[10px] text-brand-gold font-bold uppercase tracking-widest mt-1">INDUSTRIAL DESIGN VOCABULARY</p>
                </div>
                <button onClick={() => setShowCraftLibrary(false)} className="p-2 bg-white rounded-full text-stone-400 hover:text-brand-charcoal shadow-sm transition-colors border border-stone-200 shrink-0">
                    <X className="w-5 h-5" />
                </button>
             </div>
             
             {/* Categories Filter */}
             <div className="px-8 py-4 border-b border-stone-100 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                 {['All', ...Array.from(new Set(CRAFT_VOCABULARY.map(v => v.category)))].map(cat => (
                     <button
                        key={cat}
                        onClick={() => setCraftCategoryFilter(cat)}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${craftCategoryFilter === cat ? 'bg-brand-charcoal text-white border-brand-charcoal' : 'bg-white text-stone-500 border-stone-200 hover:border-brand-gold hover:text-brand-gold'}`}
                     >
                        {cat}
                     </button>
                 ))}
             </div>

             <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-stone-50/30">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {CRAFT_VOCABULARY.filter(v => craftCategoryFilter === 'All' || v.category === craftCategoryFilter).map((item, idx) => (
                        <div 
                          key={idx} 
                          className="group bg-white p-5 rounded-2xl border border-stone-200 hover:border-brand-gold hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col gap-3 relative overflow-hidden"
                          onClick={() => {
                              const appendText = `${item.zh} (${item.en})`;
                              setPrompt(prev => prev ? prev.replace(/[\n\s]+$/, '') + `\n${appendText}` : appendText);
                              setShowCraftLibrary(false);
                              setPromptMode('manual');
                          }}
                        >
                           <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-brand-gold/10 to-transparent rounded-bl-[2rem] -z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                           <div className="flex flex-col z-10">
                               <span className="font-serif text-sm font-bold text-brand-charcoal line-clamp-2">{item.en}</span>
                               <span className="text-[11px] font-bold text-brand-gold mt-1 uppercase tracking-wider">{item.zh}</span>
                           </div>
                           <p className="text-[10px] text-stone-500 leading-relaxed font-medium z-10">
                               {item.description}
                           </p>
                           <div className="mt-auto pt-4 flex items-center justify-between z-10">
                               <span className="text-[8px] px-2 py-1 bg-stone-100 text-stone-400 rounded-md uppercase font-bold tracking-wider">{item.category.split(' ')[0]}</span>
                               <div className="flex items-center gap-1.5 text-[10px] text-brand-gold font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                   <PlusCircle className="w-3.5 h-3.5" /> 应用
                               </div>
                           </div>
                        </div>
                    ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Library/Preset Modal */}
      {showLibrary && (() => {
        const filteredTemplates = templates.filter(t => {
          const matchesSearch = 
            t.name.toLowerCase().includes(librarySearchQuery.toLowerCase()) || 
            t.content.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
            (t.role && t.role.toLowerCase().includes(librarySearchQuery.toLowerCase()));
          
          const matchesCategory = libraryCategory === '全部' || t.role === libraryCategory;
          return matchesSearch && matchesCategory;
        });

        return (
          <div className="fixed inset-0 z-[100] bg-brand-charcoal/40 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl h-[75vh] flex flex-col shadow-2xl overflow-hidden border border-brand-taupe">
               <div className="p-8 border-b border-brand-taupe flex justify-between items-center bg-brand-beige/30">
                  <div className="flex flex-col">
                      <h3 className="font-serif font-bold text-2xl text-brand-charcoal">指令预设库</h3>
                      <p className="text-[10px] text-brand-gold font-bold uppercase tracking-widest mt-1">{templates.length} / {MAX_TEMPLATES} 组名额已使用</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {userProfile?.role === 'admin' && (
                       <button 
                          onClick={handleSyncToBackend}
                          disabled={isSyncing}
                          className="flex items-center gap-2 px-4 py-2 bg-brand-gold text-white text-xs font-bold rounded-full hover:bg-brand-gold/90 transition-all shadow-md disabled:opacity-50"
                       >
                          <UploadCloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce' : ''}`} />
                          <span className="hidden sm:inline">{isSyncing ? '同步中...' : '同步系统预设至后台'}</span>
                       </button>
                    )}
                    <button onClick={() => { setShowLibrary(false); setLibrarySearchQuery(''); setLibraryCategory('全部'); }} className="p-3 hover:bg-brand-taupe/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
                  </div>
               </div>

               {/* Custom Premium Search Input for Prompt Presets */}
               <div className="px-8 py-4 bg-brand-beige/10 border-b border-brand-taupe/40 flex items-center gap-3">
                  <div className="relative flex-1">
                     <Search className="w-4 h-4 text-brand-gold absolute left-4 top-1/2 -translate-y-1/2" />
                     <input 
                        type="text"
                        placeholder="输入关键词搜索提示词名称或具体指令内容..."
                        value={librarySearchQuery}
                        onChange={(e) => setLibrarySearchQuery(e.target.value)}
                        className="w-full pl-11 pr-10 py-2.5 bg-brand-beige/30 border border-brand-taupe rounded-full text-xs text-brand-charcoal placeholder:text-stone-400 outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold transition-all"
                     />
                     {librarySearchQuery && (
                        <button 
                           onClick={() => setLibrarySearchQuery('')} 
                           className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-brand-charcoal hover:bg-stone-100 rounded-full transition-all"
                        >
                           <X className="w-3.5 h-3.5" />
                        </button>
                     )}
                  </div>
               </div>

               {/* 分类标签检索 (Category Filter) */}
               <div className="px-8 py-3 bg-brand-beige/5 border-b border-brand-taupe/30 flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest shrink-0">分类筛选:</span>
                  {(() => {
                    const uniqueRoles = Array.from(new Set(templates.map(t => t.role).filter((role): role is string => !!role)));
                    const allCategories = ['全部', ...uniqueRoles];
                    return allCategories.map(cat => {
                      const isActive = libraryCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setLibraryCategory(cat)}
                          className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all border shrink-0 ${
                            isActive 
                              ? 'bg-brand-gold text-white border-brand-gold shadow-sm' 
                              : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-brand-beige/20 hover:border-brand-taupe'
                          }`}
                        >
                          {getRoleDisplayName(cat)}
                        </button>
                      );
                    });
                  })()}
               </div>

               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3">
                  {filteredTemplates.map(t => (
                    <div key={t.id} onClick={() => editingTemplateId !== t.id && handleLoadTemplate(t)} className={`p-5 bg-brand-beige/20 hover:bg-brand-beige/50 rounded-[1.5rem] cursor-pointer transition-all border border-transparent hover:border-brand-gold/30 group relative ${editingTemplateId === t.id ? 'ring-2 ring-brand-gold bg-white' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <h4 className="font-bold text-sm text-brand-charcoal">{t.name}</h4>
                          {t.role && <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold font-bold tracking-tight">{getRoleDisplayName(t.role)}</span>}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {(!t.id.startsWith('p') || userProfile?.role === 'admin') && (
                           <>
                             {editingTemplateId === t.id ? (
                                 <button 
                                     onClick={(e) => saveEditedTemplate(t.id, e)}
                                     className="p-2 text-green-500 hover:bg-green-50 rounded-full"
                                     title="保存修改"
                                 >
                                     <CheckSquare className="w-4 h-4" />
                                 </button>
                             ) : (
                                 <button 
                                     onClick={(e) => handleEditTemplate(t, e)} 
                                     className="p-2 text-stone-300 hover:text-brand-gold transition-all rounded-full hover:bg-white"
                                     title="编辑内容"
                                 >
                                     <FileText className="w-4 h-4" />
                                 </button>
                             )}
                             <button 
                                 onClick={(e) => handleDeleteTemplate(t.id, e)} 
                                 className="p-2 text-stone-300 hover:text-red-400 transition-all rounded-full hover:bg-white"
                                 title="删除预设"
                             >
                                 <Trash2 className="w-4 h-4" />
                             </button>
                           </>
                         )}
                        </div>
                      </div>
                      {editingTemplateId === t.id ? (
                         <textarea 
                             value={editingContent}
                             onChange={(e) => setEditingContent(e.target.value)}
                             onClick={(e) => e.stopPropagation()}
                             className="w-full h-24 p-2 text-xs bg-brand-beige/30 border border-brand-taupe rounded-lg focus:ring-1 focus:ring-brand-gold outline-none resize-none"
                         />
                      ) : (
                         <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed italic">"{t.content}"</p>
                      )}
                    </div>
                  ))}

                  {/* Empty state handles */}
                  {templates.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-stone-300 py-20">
                          <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                          <p className="text-sm">暂无保存的预设</p>
                      </div>
                  )}

                  {templates.length > 0 && filteredTemplates.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-stone-400 py-20">
                          <Search className="w-12 h-12 mb-4 opacity-20 text-brand-gold" />
                          <p className="text-sm">未找到与 "{librarySearchQuery}" 相关的任何指令预设</p>
                      </div>
                  )}
               </div>
            </div>
          </div>
        );
      })()}

      {/* Save Template Modal */}
      {isNamingTemplate && (
        <div className="fixed inset-0 z-[110] bg-brand-charcoal/40 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
             <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl border border-brand-taupe">
                <h3 className="font-serif font-bold text-xl mb-6">保存指令至预设库</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 block">预设名称</label>
                        <input 
                            autoFocus
                            type="text" 
                            value={newTemplateName} 
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            placeholder="如：意式轻奢客厅融合..."
                            className="w-full p-4 bg-brand-beige/50 border border-brand-taupe rounded-xl text-sm focus:ring-1 focus:ring-brand-gold outline-none transition-all"
                            onKeyDown={(e) => e.key === 'Enter' && confirmSaveTemplate()}
                        />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button onClick={() => setIsNamingTemplate(false)} className="flex-1 py-3 bg-brand-beige text-stone-500 rounded-xl text-xs font-bold">取消</button>
                        <button onClick={confirmSaveTemplate} className="flex-2 py-3 bg-brand-gold text-white rounded-xl text-xs font-bold shadow-lg shadow-brand-gold/20">确认保存</button>
                    </div>
                </div>
             </div>
        </div>
      )}

      {/* AEP Panel Floating Toggle */}
      {!showAEPPanel && (
         <button 
             onClick={() => setShowAEPPanel(true)}
             className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-r-0 border-brand-taupe shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] text-brand-charcoal pl-2 pr-1 py-4 rounded-l-xl z-30 hover:bg-stone-50 transition-all flex items-center group cursor-pointer"
             title="Open AEP Engine"
         >
            <div className="flex flex-col items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
               <span className="text-[10px] uppercase font-bold text-brand-gold tracking-widest writing-vertical-lr" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>AEP ENGINE</span>
               <span className="text-xl leading-none font-light text-stone-400">‹</span>
            </div>
         </button>
      )}
      
      {/* AEP Panel */}
      <AEPPanel 
        data={aepData} 
        onUpdate={handleAEPUpdate} 
        isOpen={showAEPPanel} 
        onToggle={() => setShowAEPPanel(!showAEPPanel)} 
        isPinned={isAepPanelPinned}
        onPinToggle={() => setIsAepPanelPinned(!isAepPanelPinned)}
        onGenerateImageRouterHub={() => {
           setTimeout(() => {
              handleGenerate();
           }, 0);
        }}
      />

      {/* Main Content Area */}
      <main className={`max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8 h-auto md:h-[calc(100vh-5rem)] transition-all duration-300 ${showAEPPanel && isAepPanelPinned ? 'lg:pr-[400px]' : ''}`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 h-full">
          
          {/* Sidebar - Control Panel */}
          <div className="lg:col-span-4 flex flex-col gap-6 h-auto md:h-full md:overflow-y-auto pr-0 md:pr-2 custom-scrollbar pb-[8rem] md:pb-10">
            
            {/* 1. 产品通道录入 (Window 1) - UPDATED with onAddImages distribution */}
            <div className="sidebar-section premium-shadow">
              <div 
                className="flex items-center justify-between cursor-pointer group select-none"
                onClick={() => setIsChannelsCollapsed(!isChannelsCollapsed)}
              >
                <div className="flex items-center gap-3">
                   <div className="w-7 h-7 rounded-lg bg-brand-gold/10 text-brand-gold flex items-center justify-center text-xs font-bold">1</div>
                   <h3 className="font-serif font-bold text-base">产品通道录入 <span className="text-stone-300 font-sans font-normal text-xs ml-1">Furniture Inputs</span></h3>
                </div>
                {isChannelsCollapsed ? <ChevronDown className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" /> : <ChevronUp className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" />}
              </div>
              
              {!isChannelsCollapsed && (
                <div className="mt-6 space-y-4 animate-fade-in">
                  <div className="px-2 py-1 bg-brand-gold/5 border border-brand-gold/10 rounded-lg mb-2">
                     <p className="text-[9px] text-brand-gold font-bold uppercase tracking-widest text-center">批量录入技巧：框选 6 张图可自动分流至 6 个独立窗口</p>
                  </div>
                  
                  {/* AEP Trigger Button */}
                  <button 
                    onClick={handleAnalyzeAEP}
                    disabled={isThinking}
                    className="w-full py-3 mb-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-lg shadow-purple-200 flex items-center justify-center gap-2 transition-all group"
                  >
                    {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
                    <span className="text-xs font-bold tracking-wide">初始生成 / AEP 分析</span>
                  </button>

                  {channels.slice(0, visibleChannelCount).map((channel, index) => (
                    <div key={channel.id} className="relative">
                      <div className={`p-4 rounded-2xl border transition-all ${channel.isEnabled ? 'bg-white border-brand-taupe shadow-sm' : 'bg-brand-beige border-transparent opacity-50'}`}>
                        <ImageUploader 
                          title={channel.name} 
                          images={channel.images} 
                          onImagesChange={imgs => updateChannel(channel.id, { images: imgs })}
                          onAddImages={newImgs => handleImagesAddedToChannel(channel.id, newImgs)} // New Batch Logic
                          onRestoreOriginal={handleRestoreOriginal} // New Restore Logic
                          maxFiles={6} 
                          enabled={channel.isEnabled}
                          onToggle={val => updateChannel(channel.id, { isEnabled: val })}
                          onQuickWhiteBackground={() => {
                            setPrompt("保留整体产品造型材质，颜色。光影，造型不变，准确识别并不改变产品按钮以及标识，生成白背景，生成1%产品底部浅灰阴影。背景不要出现灰度的背景，必须为白色背景。");
                            setPromptMode('manual');
                          }}
                        />
                      </div>
                      
                      {/* Swap button between Channel 1 and Scene Images */}
                      {index === 0 && (
                        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-10">
                          <button
                            onClick={() => {
                              const channel1Images = channels[0].images;
                              const currentSceneImages = sceneImages;
                              updateChannel(channels[0].id, { images: currentSceneImages });
                              setSceneImages(channel1Images);
                            }}
                            className="w-8 h-8 bg-white border border-brand-taupe rounded-full shadow-md flex items-center justify-center text-stone-400 hover:text-brand-gold hover:border-brand-gold transition-colors"
                            title="与场景/材质素材互换"
                          >
                            <ArrowDownUp className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  <div className="flex gap-3">
                    {visibleChannelCount < 6 && (
                      <button 
                        onClick={() => setVisibleChannelCount(prev => Math.min(prev + 1, 6))}
                        className="flex-1 py-4 border-2 border-dashed border-brand-taupe rounded-2xl flex items-center justify-center gap-2 text-stone-400 hover:text-brand-gold hover:border-brand-gold hover:bg-brand-gold/5 transition-all group"
                      >
                        <PlusCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold">添加产品通道</span>
                      </button>
                    )}
                    
                    {visibleChannelCount > 1 && (
                      <button 
                        onClick={() => setVisibleChannelCount(prev => Math.max(prev - 1, 1))}
                        className="flex-1 py-4 border-2 border-dashed border-brand-taupe rounded-2xl flex items-center justify-center gap-2 text-stone-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50/50 transition-all group"
                      >
                        <MinusCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold">移除产品通道</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. 场景/材质录入 (Window 2) */}
            <div className="sidebar-section premium-shadow">
              <div 
                className="flex items-center justify-between cursor-pointer group select-none"
                onClick={() => setIsSceneCollapsed(!isSceneCollapsed)}
              >
                <div className="flex items-center gap-3">
                   <div className="w-7 h-7 rounded-lg bg-brand-gold/10 text-brand-gold flex items-center justify-center text-xs font-bold">2</div>
                   <h3 className="font-serif font-bold text-base">场景/材质录入 <span className="text-stone-300 font-sans font-normal text-xs ml-1">Scene Context</span></h3>
                </div>
                {isSceneCollapsed ? <ChevronDown className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" /> : <ChevronUp className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" />}
              </div>
              
              {!isSceneCollapsed && (
                <div className="mt-6">
                  <div className={`p-4 rounded-2xl border transition-all ${isSceneEnabled ? 'bg-white border-brand-taupe shadow-sm' : 'bg-brand-beige border-transparent opacity-50'}`}>
                    <ImageUploader 
                      title="材质样图，支持上传场景或材质参考图" 
                      images={sceneImages} 
                      onImagesChange={setSceneImages} 
                      maxFiles={8} 
                      enabled={isSceneEnabled}
                      onToggle={setIsSceneEnabled}
                      builtInLibrary={[{ name: "内置材质 1", url: "/material_sample_1.jpg" }]}
                      forceShowHint={true}
                      onQuickWhiteBackground={() => {
                        setPrompt("保留整体产品造型材质，颜色。光影，造型不变，准确识别并不改变产品按钮以及标识，生成白背景，生成1%产品底部浅灰阴影。背景不要出现灰度的背景，必须为白色背景。");
                        setPromptMode('manual');
                      }}
                      emptyStateHint={
                        <div className="flex items-center gap-3 md:gap-4 flex-col md:flex-row text-center md:text-left">
                          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border border-brand-taupe/50 shrink-0 shadow-sm bg-brand-beige flex items-center justify-center">
                            <div className="text-stone-300">
                              <ImageIcon className="w-8 h-8 md:w-10 md:h-10 opacity-50" />
                            </div>
                          </div>
                          <p className="text-[11px] md:text-xs text-stone-400 font-medium leading-relaxed">
                            <span className="text-brand-gold font-bold text-sm">材质样图</span><br/>
                            <span className="mt-1 inline-block">支持拖拽或截图粘贴录入<br/>场景/材质参考图</span>
                          </p>
                        </div>
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. 设计指令 (Window 3) */}
            <div className="sidebar-section premium-shadow space-y-0">
               <div 
                 className="flex items-center justify-between cursor-pointer group select-none"
                 onClick={() => setIsPromptCollapsed(!isPromptCollapsed)}
               >
                 <div className="flex items-center gap-3">
                   <div className="w-7 h-7 rounded-lg bg-brand-gold/10 text-brand-gold flex items-center justify-center text-xs font-bold">3</div>
                   <h3 className="font-serif font-bold text-base">设计逻辑指令 <span className="text-stone-300 font-sans font-normal text-xs ml-1">Prompt Engine</span></h3>
                 </div>
                 {isPromptCollapsed ? <ChevronDown className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" /> : <ChevronUp className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" />}
               </div>
               
               {!isPromptCollapsed && (
                 <div className="mt-6 space-y-4">
                   <div className="flex items-center justify-end gap-1 mb-2">
                     <div className="flex items-center px-1">
                         <button 
                             onClick={() => setShowDimensionControls(!showDimensionControls)}
                             className={`w-5 h-2.5 rounded-full transition-colors relative shrink-0 ${showDimensionControls ? 'bg-brand-gold' : 'bg-stone-300'}`}
                             title="尺寸对照"
                         >
                             <div className={`w-1.5 h-1.5 bg-white rounded-full absolute top-0.5 transition-transform ${showDimensionControls ? 'translate-x-3' : 'translate-x-0.5'}`} />
                         </button>
                     </div>
                     <button 
                         onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                         className="p-1 text-stone-400 hover:text-brand-gold hover:bg-brand-beige rounded-full transition-colors"
                         title={isPromptExpanded ? "全屏开窗" : "开窗"}
                     >
                         <Maximize2 className="w-3 h-3" />
                     </button>
                     <div className="flex bg-brand-beige rounded-md p-0.5">
                         <button 
                             onClick={() => setPromptMode('auto')}
                             className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm transition-all ${promptMode === 'auto' ? 'bg-white text-brand-charcoal shadow-sm' : 'text-stone-400'}`}
                         >
                             自动
                         </button>
                         <button 
                             onClick={() => setPromptMode('manual')}
                             className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm transition-all ${promptMode === 'manual' ? 'bg-white text-brand-charcoal shadow-sm' : 'text-stone-400'}`}
                         >
                             手动
                         </button>
                     </div>
                     <button onClick={() => setShowCraftLibrary(true)} className="p-1 text-emerald-600 hover:bg-brand-beige rounded-full transition-colors" title="工艺词库"><Tag className="w-3 h-3" /></button>
                     <button onClick={() => setShowLibrary(true)} className="p-1 text-brand-gold hover:bg-brand-beige rounded-full transition-colors" title="指令预设库"><BookOpen className="w-3 h-3" /></button>
                   </div>
              
              <div className={`relative transition-all duration-300 ${isPromptExpanded ? 'fixed inset-0 z-50 bg-white/95 backdrop-blur-md p-10 flex flex-col justify-center' : ''}`}>
                {isPromptExpanded && (
                    <button 
                        onClick={() => setIsPromptExpanded(false)}
                        className="absolute top-8 right-8 p-3 bg-brand-beige rounded-full hover:bg-brand-gold hover:text-white transition-colors"
                    >
                        <Minimize2 className="w-6 h-6" />
                    </button>
                )}

                {/* New Controls for V4.1 Prompt Engine */}
                {showDimensionControls && (
                <div className="flex flex-col gap-4 mb-4 bg-stone-50/80 p-4 rounded-2xl border border-stone-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-stone-500">Seats:</label>
                            <input type="number" value={seatCount} onChange={e => setSeatCount(Number(e.target.value))} className="w-12 p-1.5 text-xs border border-stone-200 rounded-lg text-center focus:ring-1 focus:ring-brand-gold outline-none bg-white shadow-sm" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                        <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setIsRatioLocked(!isRatioLocked)}>
                            <div className={`w-8 h-4 rounded-full transition-colors relative ${isRatioLocked ? 'bg-brand-gold' : 'bg-stone-300'}`}>
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${isRatioLocked ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                            <span className="text-[10px] font-bold text-stone-500 group-hover:text-brand-gold transition-colors">比例关联 (Ratio Lock)</span>
                        </label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="flex items-center gap-1.5">
                            <label className="text-[10px] font-bold text-stone-500 whitespace-nowrap">W (mm):</label>
                            <input type="number" value={dimensions.width} onChange={e => handleDimensionChange('width', Number(e.target.value))} className="w-full min-w-0 p-1.5 text-xs border border-stone-200 rounded-lg text-center focus:ring-1 focus:ring-brand-gold outline-none bg-white shadow-sm" />
                        </div>
                        <div className="flex items-center gap-1.5 relative">
                            <label className={`text-[10px] font-bold whitespace-nowrap ${isDepthDeviating ? 'text-red-500' : 'text-stone-500'}`}>D (mm):</label>
                            <input 
                                type="number" 
                                value={dimensions.depth} 
                                onChange={e => handleDimensionChange('depth', Number(e.target.value))} 
                                disabled={isRatioLocked || !!aepData} 
                                className={`w-full min-w-0 p-1.5 text-xs border rounded-lg text-center focus:ring-1 focus:ring-brand-gold outline-none shadow-sm transition-colors ${
                                    (isRatioLocked || !!aepData) ? 'bg-stone-100 text-stone-400 cursor-not-allowed border-stone-200' : 
                                    isDepthDeviating ? 'bg-red-50 text-red-700 border-red-300 focus:ring-red-500' : 'bg-white border-stone-200'
                                }`} 
                            />
                            {isDepthDeviating && !isRatioLocked && !aepData && (
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 animate-fade-in">
                                    偏离预估比例 &gt;20%
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rotate-45"></div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <label className="text-[10px] font-bold text-stone-500 whitespace-nowrap">H (mm):</label>
                            <input type="number" value={dimensions.height} onChange={e => handleDimensionChange('height', Number(e.target.value))} disabled={isRatioLocked || !!aepData} className={`w-full min-w-0 p-1.5 text-xs border border-stone-200 rounded-lg text-center focus:ring-1 focus:ring-brand-gold outline-none shadow-sm ${(isRatioLocked || !!aepData) ? 'bg-stone-100 text-stone-400 cursor-not-allowed' : 'bg-white'}`} />
                        </div>
                    </div>
                    {aepData?.dimensionEstimate && (
                        <div className="mt-2 flex items-center justify-between bg-stone-50 p-2 rounded-lg border border-stone-100">
                            <div className="flex items-center gap-2">
                                <Brain className="w-3 h-3 text-purple-500" />
                                <span className="text-[9px] text-stone-500">
                                    AI 预估 ({aepData.dimensionEstimate.category}): 
                                    <button onClick={() => handleDimensionChange('width', aepData.dimensionEstimate!.estW)} className="font-mono font-bold text-brand-gold hover:underline ml-1">{aepData.dimensionEstimate.estW}</button> × 
                                    <span className="font-mono font-bold">{aepData.dimensionEstimate.estD}</span> × 
                                    <span className="font-mono font-bold">{aepData.dimensionEstimate.estH}</span>
                                </span>
                            </div>
                            <button 
                                onClick={() => {
                                    setDimensions({
                                        width: aepData.dimensionEstimate!.estW,
                                        depth: aepData.dimensionEstimate!.estD,
                                        height: aepData.dimensionEstimate!.estH
                                    });
                                    if (aepData.dimensionEstimate!.confidence > 0.8) setIsRatioLocked(true);
                                }}
                                className="text-[9px] px-2 py-1 bg-white border border-stone-200 rounded text-brand-gold font-bold hover:bg-brand-gold hover:text-white transition-colors"
                            >
                                同步
                            </button>
                        </div>
                    )}
                    <div className="text-[10px] text-stone-400 font-medium mt-1">
                        * 尺寸将以毫米 (mm) 为单位直接映射到提示词中，以确保精确的比例控制。
                    </div>
                    
                    {/* SVG Previewer */}
                    {(() => {
                        const latestTask = generationHistory.filter(t => t.result?.imageUrl).pop();
                        return (
                            <SvgPreviewer 
                                dimensions={dimensions} 
                                imageUrl={latestTask?.result?.imageUrl}
                                measurements={latestTask?.measurements}
                                labelAlignmentMode={latestTask?.labelAlignmentMode}
                                onUpdateDimensions={(d, h) => setDimensions(prev => ({ ...prev, depth: d, height: h }))}
                            />
                        );
                    })()}
                </div>
                )}
                
                {promptMode === 'auto' && aepData ? (
                    <div className={`w-full ${isPromptExpanded ? 'h-[80vh]' : 'h-40'} p-4 bg-purple-50/50 border border-purple-100 rounded-[1.5rem] overflow-y-auto custom-scrollbar transition-all duration-300 relative resize-y`}>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {aepData.keywords.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-purple-100 rounded-md text-[10px] font-medium text-purple-700 shadow-sm">
                                    <Tag size={10} /> {tag}
                                </span>
                            ))}
                        </div>
                        <p className={`text-brand-charcoal leading-relaxed opacity-80 ${isPromptExpanded ? 'text-lg' : 'text-xs'}`}>{prompt}</p>
                        {isRewriting && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center rounded-[1.5rem]">
                                <div className="flex items-center gap-2 text-purple-600 text-xs font-bold">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Syncing AEP...
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="relative w-full">
                        <textarea 
                          value={prompt} onChange={e => setPrompt(e.target.value)} 
                          className={`w-full ${isPromptExpanded ? 'h-[80vh] text-lg p-10' : 'h-24 md:h-40 p-3 md:p-5 text-xs'} bg-brand-beige/40 border border-brand-taupe rounded-[1.5rem] focus:ring-1 focus:ring-brand-gold transition-all resize-y font-medium leading-relaxed`}
                          placeholder="请输入详细的设计逻辑与材质要求..."
                        />
                    </div>
                )}

                {/* Optimized Button Position - Outside Text Area */}
                {!isPromptExpanded && (
                    <div className="flex justify-end gap-2 mt-2">
                        <button 
                            onClick={() => setShowPromptBuilder(true)}
                            className="p-2 bg-white border border-brand-taupe rounded-lg text-stone-400 hover:text-brand-gold hover:border-brand-gold transition-colors"
                            title="Prompt Builder"
                        >
                            <Wand2 className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setPrompt('')} 
                            className="p-2 bg-white border border-brand-taupe rounded-lg text-stone-400 hover:text-red-400 hover:border-red-200 transition-colors"
                            title="清除当前指令"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={handleSaveCurrentToLibrary} 
                            className="p-2 bg-white border border-brand-taupe rounded-lg text-stone-400 hover:text-brand-gold hover:border-brand-gold transition-colors"
                            title="保存为预设 (上限20组)"
                        >
                            <Save className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={handleRewritePrompt} 
                            className="p-2 bg-white border border-brand-taupe rounded-lg text-stone-400 hover:text-brand-gold hover:border-brand-gold transition-colors" 
                            title="智能翻译/重写"
                        >
                            <Languages className="w-4 h-4" />
                        </button>
                    </div>
                )}
                
                {/* Expanded Mode Buttons */}
                {isPromptExpanded && !promptMode.includes('auto') && (
                     <div className="absolute bottom-10 right-10 flex gap-4">
                        <button 
                            onClick={() => setShowPromptBuilder(true)}
                            className="p-4 bg-white border border-brand-taupe rounded-full text-stone-400 hover:text-brand-gold hover:border-brand-gold transition-colors shadow-lg"
                            title="Prompt Builder"
                        >
                            <Wand2 className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={() => setPrompt('')} 
                            className="p-4 bg-white border border-brand-taupe rounded-full text-stone-400 hover:text-red-400 hover:border-red-200 transition-colors shadow-lg"
                            title="清除当前指令"
                        >
                            <Trash2 className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={handleSaveCurrentToLibrary} 
                            className="p-4 bg-white border border-brand-taupe rounded-full text-stone-400 hover:text-brand-gold hover:border-brand-gold transition-colors shadow-lg"
                            title="保存为预设"
                        >
                            <Save className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={handleRewritePrompt} 
                            className="p-4 bg-white border border-brand-taupe rounded-full text-stone-400 hover:text-brand-gold hover:border-brand-gold transition-colors shadow-lg" 
                            title="智能翻译/重写"
                        >
                            <Languages className="w-6 h-6" />
                        </button>
                     </div>
                )}

                {/* 图像分析结果节点窗口 */}
                <div className="mt-4 p-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl">
                    <div className="flex items-center justify-between mb-3 text-[#1E293B]">
                        <div className="flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-[#3B82F6]" />
                            <span className="text-sm font-bold text-[#1E293B]">录入图特征标准化描述</span>
                        </div>
                        <button 
                            onClick={handleSmartPrompt} 
                            disabled={isThinking}
                            className="p-1.5 rounded-lg bg-white border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#64748B] transition-colors disabled:opacity-50 shadow-sm"
                            title="手动刷新特征数据"
                        >
                            {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>}
                        </button>
                    </div>
                    {imageAnalysisResult ? (
                        <textarea
                            value={imageAnalysisResult}
                            onChange={(e) => setImageAnalysisResult(e.target.value)}
                            className="w-full min-h-[80px] p-3 text-xs text-[#334155] font-medium whitespace-pre-wrap leading-relaxed bg-white/60 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#3B82F6] resize-y"
                        />
                    ) : (
                        <p className="text-xs text-[#94A3B8] font-medium italic py-3 text-center">
                            点击右上角刷新图标，提取参考图特征标准化描述
                        </p>
                    )}
                </div>
                
                {/* 局部修改示例提示便贴 */}
                <div className="mt-4 p-5 bg-[#FDFBF7] border border-[#E5E0D8]/60 rounded-2xl relative overflow-hidden">
                    <div className="flex flex-col gap-2 relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-[#44403C] flex items-center gap-2">
                                <span className="w-5 h-5 flex items-center justify-center bg-[#FDE68A] text-[#B45309] rounded-full text-xs shadow-sm">
                                    {imageAnalysisSuggestions && imageAnalysisSuggestions.length > 0 ? <Lightbulb className="w-3 h-3" /> : '!'}
                                </span>
                                {imageAnalysisSuggestions && imageAnalysisSuggestions.length > 0 ? '基于现状的迭代建议' : '从描述到迭代：局部修改指令参考'}
                            </span>
                            <div className="flex items-center gap-2">
                                {selectedSuggestionIndices.length > 0 && (
                                    <button 
                                        onClick={handleSyncSuggestions}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B28C5A] text-white text-[10px] font-bold rounded-full shadow-lg shadow-[#B28C5A]/20 hover:bg-[#8B6B42] transition-all animate-fade-in"
                                    >
                                        <Save className="w-3 h-3" /> 同步至指令 ({selectedSuggestionIndices.length})
                                    </button>
                                )}
                                <button 
                                    onClick={handleSmartPrompt} 
                                    disabled={isThinking}
                                    className="p-1.5 rounded-lg bg-white border border-[#E5E0D8] hover:bg-[#F5F1EA] text-[#78716C] transition-colors disabled:opacity-50 shadow-sm"
                                    title="手动刷新迭代建议"
                                >
                                    {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>}
                                </button>
                            </div>
                        </div>
                        <p className="text-xs text-[#78716C] mb-2 mt-1 leading-relaxed">
                            {imageAnalysisSuggestions && imageAnalysisSuggestions.length > 0 
                                ? 'AI基你上传的产品图识别出的现状，提供的针对性局部修改灵感：' 
                                : '如果你想基于上传的图片进行修改，可以参考这种“特征+动词+目标”的公式：'
                            }
                        </p>
                        
                        <details className="mt-1 cursor-pointer">
                            <summary className="text-sm font-bold text-[#57534E] list-none flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-[#E5E0D8] shadow-sm hover:bg-[#FAFAF9] transition-colors">
                                <span className="flex items-center gap-2">💡 点击查看局部修改指令参考公式</span>
                                <ChevronDown className="w-4 h-4 text-[#A8A29E] transition-transform details-arrow"/>
                            </summary>
                            <div className="overflow-x-auto custom-scrollbar mt-3">
                                <table className="w-full text-left border-collapse min-w-[500px]">
                                <thead>
                                    <tr className="border-b border-[#E5E0D8] pb-1">
                                        <th className="py-2 text-[11px] font-semibold text-[#78716C] w-8 text-center">
                                            {imageAnalysisSuggestions && imageAnalysisSuggestions.length > 0 && (
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedSuggestionIndices.length === imageAnalysisSuggestions.length && imageAnalysisSuggestions.length > 0}
                                                    onChange={() => {
                                                        if (selectedSuggestionIndices.length === imageAnalysisSuggestions.length) {
                                                            setSelectedSuggestionIndices([]);
                                                        } else {
                                                            setSelectedSuggestionIndices(imageAnalysisSuggestions.map((_, i) => i));
                                                        }
                                                    }}
                                                    className="w-4 h-4 text-[#B28C5A] rounded border-[#D6D3D1] focus:ring-[#B28C5A]"
                                                />
                                            )}
                                        </th>
                                        <th className="py-2 text-[11px] font-semibold text-[#78716C] w-20">修改部位</th>
                                        <th className="py-2 text-[11px] font-semibold text-[#78716C] w-32">原始描述 (As-is)</th>
                                        <th className="py-2 text-[11px] font-semibold text-[#78716C]">修改指令 (To-be)</th>
                                        <th className="py-2 text-[11px] font-semibold text-[#78716C] w-40">预期效果</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[11px] text-[#57534E] divide-y divide-[#E5E0D8]/40">
                                    {(imageAnalysisSuggestions && imageAnalysisSuggestions.length > 0) ? (
                                        imageAnalysisSuggestions.map((suggestion, idx) => (
                                            <tr key={idx} className={`hover:bg-white/60 transition-colors cursor-pointer ${selectedSuggestionIndices.includes(idx) ? 'bg-[#B28C5A]/5' : ''}`} onClick={() => toggleSuggestion(idx)}>
                                                <td className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedSuggestionIndices.includes(idx)} 
                                                        onChange={() => toggleSuggestion(idx)}
                                                        className="w-4 h-4 text-[#B28C5A] rounded border-[#D6D3D1] focus:ring-[#B28C5A]"
                                                    />
                                                </td>
                                                <td className="py-3 pr-2 font-medium text-[#44403C]">{highlightRedText(suggestion.part)}</td>
                                                <td className="py-3 pr-2 text-[#A8A29E]">{highlightRedText(suggestion.original)}</td>
                                                <td className="py-3 pr-2 font-medium text-[#B28C5A] leading-relaxed">{suggestion.modification}</td>
                                                <td className="py-3 text-[#78716C] leading-relaxed">{highlightRedText(suggestion.effect)}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <>
                                            <tr className="hover:bg-white/60 transition-colors">
                                                <td className="py-3 text-center"></td>
                                                <td className="py-3 pr-2 font-medium">靠背 (Backrest)</td>
                                                <td className="py-3 pr-2 text-[#A8A29E]">普通高度，直角边缘</td>
                                                <td className="py-3 pr-2 font-medium text-[#B28C5A]">改为高靠背设计，边缘使用大圆角过渡</td>
                                                <td className="py-3 text-[#78716C]">提升支撑感，视觉更柔和</td>
                                            </tr>
                                            <tr className="hover:bg-white/60 transition-colors">
                                                <td className="py-3 text-center"></td>
                                                <td className="py-3 pr-2 font-medium">扶手 (Armrest)</td>
                                                <td className="py-3 pr-2 text-[#A8A29E]">平直薄垫扶手</td>
                                                <td className="py-3 pr-2 font-medium text-[#B28C5A]">替换为饱满的圆弧外包扶手，增加明显褶皱细节</td>
                                                <td className="py-3 text-[#78716C]">增加体量感与松弛感</td>
                                            </tr>
                                            <tr className="hover:bg-white/60 transition-colors">
                                                <td className="py-3 text-center"></td>
                                                <td className="py-3 pr-2 font-medium">座垫 (Seat)</td>
                                                <td className="py-3 pr-2 text-[#A8A29E]">单层平整座垫</td>
                                                <td className="py-3 pr-2 font-medium text-[#B28C5A]">变更为双层厚垫设计，边缘增加拉点收缩工艺</td>
                                                <td className="py-3 text-[#78716C]">强化包裹感与工艺细节</td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                                </table>
                            </div>
                        </details>
                    </div>
                </div>
              
              <div className="pt-4 border-t border-brand-taupe">
                 <div className="flex gap-3 items-center">
                    <input type="text" value={assistantRole} onChange={e => setAssistantRole(e.target.value)} placeholder="设计师身份" className="flex-1 p-3 text-xs bg-brand-beige/40 border border-brand-taupe rounded-xl outline-none" />
                    <label className="flex items-center gap-2 text-xs font-bold text-stone-500 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={isDeepThinking} 
                            onChange={(e) => setIsDeepThinking(e.target.checked)}
                            className="w-4 h-4 text-brand-gold rounded border-stone-300 focus:ring-brand-gold"
                        />
                        深度思考
                    </label>
                    <button onClick={handleSmartPrompt} className="px-6 py-3 bg-brand-charcoal text-white rounded-xl text-xs font-bold shadow-md hover:bg-brand-gold transition-colors flex items-center gap-2">
                       {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                       <span>AI 解析</span>
                    </button>
                 </div>
              </div>
              
              {/* Removed duplicated Compute Power Tier mapping, relying on Window 4 */}
                  </div>
               </div>
               )}
            </div>

            {showPromptBuilder && (
              <PromptBuilder 
                initialPrompt={prompt} 
                onApply={(p) => { setPrompt(p); setShowPromptBuilder(false); }} 
                onClose={() => setShowPromptBuilder(false)} 
              />
            )}

            {/* Rendering Configuration */}
            <div className="sidebar-section premium-shadow">
               <div 
                 className="flex items-center justify-between cursor-pointer group select-none"
                 onClick={() => setIsComputeCollapsed(!isComputeCollapsed)}
               >
                 <div className="flex items-center gap-3">
                   <div className="w-7 h-7 rounded-lg bg-brand-gold/10 text-brand-gold flex items-center justify-center text-xs font-bold">4</div>
                   <h3 className="font-serif font-bold text-base">渲染引擎配置 <span className="text-stone-300 font-sans font-normal text-xs ml-1">Compute</span></h3>
                 </div>
                 {isComputeCollapsed ? <ChevronDown className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" /> : <ChevronUp className="w-5 h-5 text-stone-300 group-hover:text-brand-gold" />}
               </div>

               {!isComputeCollapsed && (
                 <div className="mt-6 space-y-6">
                   <div className="space-y-3">
                     <p className="text-xs font-bold text-stone-500">算力与画质档位</p>
                     <div className="grid grid-cols-4 gap-2">
                       <button 
                         onClick={() => setModel('gemini-2.5-flash')}
                         className={`p-2 rounded-xl text-center border transition-all ${model === 'gemini-2.5-flash' ? 'bg-brand-charcoal text-white border-brand-charcoal shadow-lg' : 'bg-white border-stone-200 hover:border-brand-taupe'}`}
                       >
                         <div className="text-lg mb-1">🚀</div>
                         <div className="text-[10px] font-bold">极速</div>
                         <div className="text-[8px] opacity-70">v2.5 Flash</div>
                       </button>
                       <button 
                         onClick={() => setModel('gemini-3.1-flash-image')}
                         className={`p-2 rounded-xl text-center border transition-all ${(model === 'gemini-3.1-flash-image' || model === 'gemini-3.1-flash-image-preview') ? 'bg-brand-gold text-white border-brand-gold shadow-lg shadow-brand-gold/20' : 'bg-[#F9F5EF] border-[#B28C5A]/30 text-[#B28C5A] hover:border-[#B28C5A]'}`}
                       >
                         <div className="text-lg mb-1">⚡</div>
                         <div className="text-[10px] font-bold">标准</div>
                         <div className="text-[8px] opacity-70">v3.1 Flash</div>
                       </button>
                       <button 
                         onClick={() => setModel('google/gemini-3-pro-image')}
                         className={`p-2 rounded-xl text-center border transition-all ${(model === 'google/gemini-3-pro-image' || model === 'google/gemini-3-pro-image-preview' || model === 'gemini-3-pro-image' || model === 'gemini-3-pro-image-preview') ? 'bg-brand-charcoal text-white border-brand-charcoal shadow-lg' : 'bg-white border-stone-200 hover:border-brand-taupe'}`}
                       >
                         <div className="text-lg mb-1">✨</div>
                         <div className="text-[10px] font-bold">旗舰</div>
                         <div className="text-[8px] opacity-70">v3.0 Pro</div>
                       </button>
                       <button 
                         onClick={() => setModel('openai/gpt-image-2')}
                         className={`p-2 rounded-xl text-center border transition-all ${model === 'openai/gpt-image-2' ? 'bg-brand-charcoal text-white border-brand-charcoal shadow-lg' : 'bg-white border-stone-200 hover:border-brand-taupe'}`}
                       >
                         <div className="text-lg mb-1 opacity-80">🌌</div>
                         <div className="text-[10px] font-bold">GPT</div>
                         <div className="text-[8px] opacity-70">image-2</div>
                       </button>
                     </div>
                   </div>

                   <div className="space-y-3">
                     <p className="text-xs font-bold text-stone-500">渲染精度 (Resolution)</p>
                     <div className="flex gap-2">
                       {(['1K', '2K', '4K'] as const).map(r => {
                         const isV25 = model.includes('2.5');
                         const isDisabled = isV25 && (r === '2K' || r === '4K');
                         
                         return (
                          <button 
                            key={r} 
                            disabled={isDisabled}
                            onClick={() => {
                              setResolution(r);
                              if ((r === '2K' || r === '4K') && model.includes('2.5')) {
                                 setModel('gemini-3.1-flash-image');
                              }
                            }} 
                            className={`flex-1 relative py-2 rounded-xl text-[10px] font-bold border transition-all ${
                              isDisabled ? 'bg-stone-50 border-stone-200 text-stone-300 cursor-not-allowed' :
                              resolution === r ? 'bg-brand-gold text-white border-brand-gold shadow-lg shadow-brand-gold/10' : 
                              'bg-white border-stone-200 text-stone-500 hover:border-brand-gold/30'
                            }`}
                          >
                            {r}
                            {isDisabled && (
                              <span className="absolute -top-1 -right-1 bg-stone-400 text-[6px] text-white px-1 rounded transform scale-75">锁定</span>
                            )}
                          </button>
                         );
                       })}
                     </div>
                   </div>
                   
                   <div className="space-y-3">
                       <p className="text-xs font-bold text-stone-500">图片比例 (Ratio)</p>
                       <div className="grid grid-cols-4 gap-2">
                         {['Auto', 'Custom', '1:1', '3:2', '4:3', '3:4', '16:9', '9:16', '21:9', '2:3', '4:5', '5:4', '1:4', '1:8', '4:1', '8:1'].map((ratio) => (
                           <button 
                               key={ratio}
                               onClick={() => setAspectRatio(ratio)} 
                               className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${aspectRatio === ratio ? 'bg-stone-700 text-white border-stone-700 shadow-md' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-400'}`}
                           >
                               {ratio}
                           </button>
                         ))}
                       </div>
                       
                       {aspectRatio === 'Custom' && (
                           <input 
                               type="text" 
                               placeholder="e.g. 16:10 or 1920:1080" 
                               value={customAspectRatio}
                               onChange={(e) => setCustomAspectRatio(e.target.value)}
                               className="w-full p-2 text-xs border border-stone-200 rounded-xl focus:ring-1 focus:ring-brand-gold bg-white shadow-sm"
                           />
                       )}
                   </div>

                   <div className="flex items-center gap-3 pt-4 border-t border-stone-100">
                       <label className="text-[10px] font-bold text-stone-400 uppercase w-12 shrink-0">Seed</label>
                       <input 
                           type="number" 
                           placeholder="Random" 
                           value={seed === undefined ? '' : seed}
                           onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : undefined)}
                           className="flex-1 p-2 text-xs border border-stone-200 rounded-xl focus:ring-1 focus:ring-brand-gold bg-white shadow-sm"
                       />
                   </div>

                   <div className="pt-4 border-t border-stone-100 space-y-3">
                       <label className="text-xs font-bold text-stone-500">命名生成预设 (Preset)</label>
                       <div className="flex gap-2">
                         <button onClick={() => setNamingPreset('standard')} className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all ${namingPreset === 'standard' ? 'bg-brand-charcoal text-white border-brand-charcoal shadow-md' : 'bg-white border-stone-200 text-stone-500 hover:border-brand-charcoal'}`}>标准</button>
                         <button onClick={() => setNamingPreset('detailed')} className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all ${namingPreset === 'detailed' ? 'bg-brand-charcoal text-white border-brand-charcoal shadow-md' : 'bg-white border-stone-200 text-stone-500 hover:border-brand-charcoal'}`}>详细 (推荐)</button>
                         <button onClick={() => setNamingPreset('custom')} className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all ${namingPreset === 'custom' ? 'bg-brand-charcoal text-white border-brand-charcoal shadow-md' : 'bg-white border-stone-200 text-stone-500 hover:border-brand-charcoal'}`}>自定义</button>
                       </div>
                       {namingPreset === 'custom' && (
                           <input 
                               type="text" 
                               placeholder="输入自定义前缀 (例如: 广州展会项目_)" 
                               value={customPrefix}
                               onChange={(e) => setCustomPrefix(e.target.value)}
                               className="w-full p-2 text-xs border border-stone-200 rounded-xl focus:ring-1 focus:ring-brand-gold bg-white shadow-sm"
                           />
                       )}
                   </div>
                 </div>
               )}
            </div>

            {error && <div className="p-4 bg-red-50 text-red-500 text-[10px] font-bold rounded-xl border border-red-100 animate-fade-in">{error}</div>}

            {/* Persistent Action Bar */}
            <div className="fixed bottom-[6.5rem] px-4 md:px-0 left-0 right-0 z-40 md:sticky md:bottom-0 md:bg-brand-cream/90 md:backdrop-blur-md md:pt-4 flex justify-center md:justify-start gap-4 pointer-events-none md:pointer-events-auto">
               <button onClick={handleReset} className="w-14 h-14 md:w-auto md:h-auto md:p-5 rounded-2xl bg-white/90 md:bg-white backdrop-blur-md md:backdrop-blur-none border border-brand-taupe text-stone-300 hover:text-red-400 transition-colors shadow-lg md:shadow-sm shrink-0 group pointer-events-auto" title="Reset All"><Trash2 className="w-6 h-6 md:w-6 md:h-6 group-hover:scale-110 transition-transform" /></button>
               {isGenerating ? (
                 <button onClick={() => setIsPaused(!isPaused)} className="flex-1 max-w-[280px] md:max-w-none bg-brand-charcoal text-white rounded-[1.5rem] font-serif font-bold text-[15px] md:text-lg shadow-xl md:shadow-lg flex items-center justify-center gap-3 pointer-events-auto">
                   {isPaused ? <><Play className="w-6 h-6" /> 继续队列</> : <><Pause className="w-6 h-6" /> 暂停渲染</>}
                 </button>
               ) : (
                 <button onClick={handleGenerate} className="flex-1 max-w-[280px] md:max-w-none bg-gold-gradient text-white rounded-[1.5rem] font-serif font-bold text-[15px] md:text-xl shadow-xl shadow-brand-gold/30 md:shadow-sm flex items-center justify-center gap-4 hover:scale-[1.01] active:scale-95 transition-all pointer-events-auto">
                    <Wand2 className="w-6 h-6 md:w-7 md:h-7" /> 开启智能可视化
                 </button>
               )}
            </div>
          </div>

          {/* Result Visualization Canvas */}
          <div className="lg:col-span-8 min-h-[500px] h-full">
            <GeneratedView 
                tasks={generationHistory} 
                isGenerating={isGenerating} 
                onSetAsReference={handleSetAsReference} 
                onDeleteTask={handleDeleteTask}
                onGenerateVideo={handleGenerateVideo}
                namingPreset={namingPreset}
                customPrefix={customPrefix}
                expectedFrontPx={calculateSofaGrid(dimensions.width, dimensions.depth, resolution).wPx}
            />
          </div>

        </div>
      </main>

      <HistoryModal 
        isOpen={showHistory} 
        onClose={() => setShowHistory(false)} 
        historyItems={historyItems} 
        onHistoryUpdated={refreshStorageStats} 
        onUsePrompt={(p) => {
          setPrompt(p);
          setPromptMode('manual');
          setShowHistory(false);
        }}
        onSelectImage={(item) => {
          const newTask: GenerationTask = {
            id: crypto.randomUUID(),
            channelId: 1,
            channelName: '产品通道 1',
            status: 'success',
            result: {
              imageUrl: item.imageUrl,
              prompt: item.prompt,
              timestamp: item.timestamp
            },
            model: item.model,
            startTime: item.timestamp,
            duration: 0
          };
          setGenerationHistory(prev => [newTask, ...prev].slice(0, MAX_HISTORY_TASKS));
          setShowHistory(false);
        }}
      />
    </div>
  );
};

export default App;