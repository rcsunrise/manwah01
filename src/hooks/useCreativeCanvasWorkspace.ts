import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Node, Edge, useNodesState, useEdgesState } from '@xyflow/react';
import { CreativeProject, ProductVisualDNA, AgentRun, ImageAttachment } from '../types';
import { AgentMessage, SceneQueueItem, GenerationBatch, SaveStatus, ViewportState } from '../types/creativeCanvas';
import { mapExistingNineGridResultToCanvasNodes } from '../adapters/creativeCanvasNineGridAdapter';
import { supabase } from '../lib/supabase';
import { parseJsonResponse, assertSerializableRequestPayload } from '../utils/apiUtils';
import { generateEditedImage, resolveClientImageToBase64 } from '../services/geminiService';
import { canvasService } from '../services/canvasService';
import { logCanvasDiagnostic } from '../utils/canvasDiagnostic';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || '';
  const user = data?.session?.user;
  const storedUser = localStorage.getItem('manwah_user');
  let userUuid = user?.id || '';

  if (!userUuid && storedUser) {
    try {
      const parsed = JSON.parse(storedUser);
      userUuid = parsed.id || '';
    } catch (e) {}
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (userUuid) {
    headers['x-user-uuid'] = userUuid;
  }
  return headers;
}

const initialNodes: Node[] = [
  {
    id: 'welcome-1',
    type: 'welcomeNode',
    position: { x: 100, y: 120 },
    data: {
      title: '视觉企划画布',
      description: '上传产品图片后，智能体生成的产品 DNA、九屏方案和渲染结果将在这里形成节点。',
      status: '画布已连接'
    }
  }
];

const initialEdges: Edge[] = [];

export function useCreativeCanvasWorkspace(workspaceIdParam?: string) {
  // Get stable userId for LocalStorage key prefixing
  const userId = useMemo(() => {
    const storedUser = localStorage.getItem('manwah_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.id) return String(parsed.id);
      } catch (e) {}
    }
    return 'default_user';
  }, []);

  const getStorageKey = useCallback((projId: string, canvId: string) => {
    return `creative-canvas:${userId}:${projId}:${canvId}:draft`;
  }, [userId]);

  // C4A-1 Hydration State Machine: idle -> loading -> hydrated -> ready
  const [hydrationState, setHydrationState] = useState<'idle' | 'loading' | 'hydrated' | 'ready'>('idle');
  const hasUserMutationRef = useRef<boolean>(false);
  const isRestoringRef = useRef<boolean>(false);
  const hasExplicitUserClearRef = useRef<boolean>(false);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleNodesChange = useCallback((changes: any) => {
    if (hydrationState === 'ready' && !isRestoringRef.current) {
      hasUserMutationRef.current = true;
    }
    onNodesChange(changes);
  }, [hydrationState, onNodesChange]);

  const handleEdgesChange = useCallback((changes: any) => {
    if (hydrationState === 'ready' && !isRestoringRef.current) {
      hasUserMutationRef.current = true;
    }
    onEdgesChange(changes);
  }, [hydrationState, onEdgesChange]);

  const activeProjectRef = useRef<CreativeProject | null>(null);
  const uploadedBase64Ref = useRef<string | null>(null);

  const [activeProject, setActiveProjectState] = useState<CreativeProject | null>(null);
  const setActiveProject = (proj: CreativeProject | null) => {
    activeProjectRef.current = proj;
    setActiveProjectState(proj);
  };

  const [activeDna, setActiveDna] = useState<ProductVisualDNA | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedBase64, setUploadedBase64State] = useState<string | null>(null);

  const setUploadedBase64 = (b64: string | null) => {
    uploadedBase64Ref.current = b64;
    setUploadedBase64State(b64);
  };

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'analyzing' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFullDnaDrawer, setShowFullDnaDrawer] = useState<boolean>(false);

  // Phase C4A-1 states for Canvas Draft & Revision Persistence
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('cloud_loading');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [currentRevisionNumber, setCurrentRevisionNumber] = useState<number>(0);

  const [showSaveVersionModal, setShowSaveVersionModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSerializedRef = useRef<string>('');

  // Phase C2 states for 9-grid planning
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [isPlanGenerating, setIsPlanGenerating] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null);

  // Model & Resolution config for Image Generation
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-image');
  const [selectedResolution, setSelectedResolution] = useState<'1K' | '2K' | '4K'>('2K');

  // C4B-1 Product DNA Version & Selection Linkage States
  const [dnaCode, setDnaCode] = useState<string | undefined>(undefined);
  const [productDnaVersionCode, setProductDnaVersionCode] = useState<string | undefined>(undefined);
  const [productDnaVersionId, setProductDnaVersionId] = useState<string | undefined>(undefined);
  const [dnaVersions, setDnaVersions] = useState<any[]>([]);

  useEffect(() => {
    if (activeDna) {
      if ((activeDna as any).dnaCode) setDnaCode((activeDna as any).dnaCode);
      if ((activeDna as any).versionCode) setProductDnaVersionCode((activeDna as any).versionCode);
      if ((activeDna as any).productDnaVersionId) setProductDnaVersionId((activeDna as any).productDnaVersionId);
    }
  }, [activeDna]);

  const fetchDnaVersions = useCallback(async () => {
    try {
      const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/projects/${targetProjectId}/product-dna`, {
        headers: { ...authHeaders }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.productDna) {
          if (data.productDna.dna_code) setDnaCode(data.productDna.dna_code);
          if (data.productDna.version_code) setProductDnaVersionCode(data.productDna.version_code);
          if (data.productDna.current_version_id) setProductDnaVersionId(data.productDna.current_version_id);
          if (Array.isArray(data.versions)) setDnaVersions(data.versions);
        }
      }
    } catch (e) {}
  }, [workspaceIdParam]);

  useEffect(() => {
    fetchDnaVersions();
  }, [fetchDnaVersions]);

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'msg-1',
      sender: 'agent',
      text: '你好！我是视觉企划智能体。请上传产品主角图，我将自动提取造型、色彩、材质与结构 DNA 并同步至左侧画布。',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const addAgentMessage = useCallback((text: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: 'agent',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, []);

  const handleSelectDnaVersion = useCallback(async (versionId: string) => {
    try {
      const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
      const authHeaders = await getAuthHeaders();
      const dnaRes = await fetch(`/api/projects/${targetProjectId}/product-dna`, { headers: { ...authHeaders } });
      const dnaData = await dnaRes.json();
      const dnaId = dnaData?.productDna?.id;
      if (!dnaId) return;

      const res = await fetch(`/api/product-dnas/${dnaId}/select-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ versionId })
      });
      const data = await res.json();
      if (data.success && data.version) {
        setProductDnaVersionId(data.version.id);
        const vCode = data.version.version_code || `V00${data.version.version_number}`;
        setProductDnaVersionCode(vCode);
        addAgentMessage(`✅ 已成功将当前 Product DNA 版本切换至 ${vCode}`);
        fetchDnaVersions();
      }
    } catch (e) {
      console.error('Failed to select DNA version:', e);
    }
  }, [workspaceIdParam, addAgentMessage, fetchDnaVersions]);

  const addUserMessage = useCallback((text: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: 'user',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, []);

  // Ensure an active project exists or create one
  const getOrCreateProject = async (): Promise<CreativeProject | null> => {
    if (activeProject) return activeProject;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          name: `画布企划 - ${new Date().toLocaleDateString()}`,
          project_type: 'detail_page'
        })
      });
      const data = await res.json();
      if (data.success && data.project) {
        setActiveProject(data.project);
        return data.project;
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
    return null;
  };

  // Perform DNA Analysis
  const performDnaExtraction = async (project: CreativeProject, base64: string) => {
    setUploadState('analyzing');
    addAgentMessage('正在进行产品 DNA 分析，提取造型、材质与强约束特征...');

    setNodes(prev => {
      const existing = prev.find(n => n.id === 'dna-node-1');
      const dnaNode: Node = {
        id: 'dna-node-1',
        type: 'productDnaNode',
        position: existing?.position || { x: 480, y: 150 },
        data: {
          status: 'analyzing',
          onViewFullDna: () => setShowFullDnaDrawer(true)
        }
      };
      if (existing) {
        return prev.map(n => (n.id === 'dna-node-1' ? dnaNode : n));
      }
      return [...prev, dnaNode];
    });

    setEdges(prev => {
      if (prev.some(e => e.id === 'edge-img-dna')) return prev;
      return [
        ...prev,
        {
          id: 'edge-img-dna',
          source: 'img-node-1',
          target: 'dna-node-1',
          sourceHandle: 'source',
          targetHandle: 'target',
          label: '分析生成',
          labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
          labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
          animated: true,
          style: { stroke: '#B28C5A', strokeWidth: 2 }
        }
      ];
    });

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/projects/${project.id}/product-dna/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          imageBase64List: [base64]
        })
      });

      const data = await parseJsonResponse<{ success?: boolean; productDna?: ProductVisualDNA; error?: string; message?: string }>(res);

      if (data.success && data.productDna) {
        setActiveDna(data.productDna);
        setUploadState('completed');
        addAgentMessage('✅ 产品 DNA 提取完成！点击下方【生成九屏企划】按钮即可启动爆款详情页 9 屏方案策划。');

        setNodes(prev =>
          prev.map(n => {
            if (n.id === 'dna-node-1') {
              return {
                ...n,
                data: {
                  dna: data.productDna,
                  status: 'completed',
                  analyzedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  onViewFullDna: () => setShowFullDnaDrawer(true)
                }
              };
            }
            return n;
          })
        );
      } else {
        const errorText = data.error || data.message || '分析服务未响应有效 DNA 数据';
        setErrorMessage(errorText);
        setUploadState('error');
        addAgentMessage(`❌ DNA 分析未完成：${errorText}`);

        setNodes(prev =>
          prev.map(n => {
            if (n.id === 'dna-node-1') {
              return {
                ...n,
                data: {
                  status: 'error',
                  errorMsg: errorText
                }
              };
            }
            return n;
          })
        );
      }
    } catch (err: any) {
      const errorText = err?.message || '网络连接或服务端响应错误';
      setErrorMessage(errorText);
      setUploadState('error');
      addAgentMessage(`❌ DNA 分析失败：${errorText}`);

      setNodes(prev =>
        prev.map(n => {
          if (n.id === 'dna-node-1') {
            return {
              ...n,
              data: {
                status: 'error',
                errorMsg: errorText
              }
            };
          }
          return n;
        })
      );
    }
  };

  // Format byte size to human readable string
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Upload file & handle pipeline
  const handleUploadFile = async (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('不支持的文件格式。请上传 PNG, JPG 或 WEBP 图片。');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('文件大小超出 20MB 限制。');
      return;
    }

    setUploadState('uploading');
    setErrorMessage(null);
    addUserMessage(`上传产品主图：${file.name}`);

    const formattedSize = formatFileSize(file.size);

    const reader = new FileReader();
    reader.onload = async event => {
      const b64 = event.target?.result as string;
      if (!b64) {
        setUploadState('error');
        setErrorMessage('图片文件读取失败');
        return;
      }

      // Measure dimensions asynchronously
      let dimensions: { width: number; height: number } | undefined;
      try {
        dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = b64;
        });
      } catch (e) {
        console.warn('Failed to calculate image dimensions', e);
      }

      setUploadedBase64(b64);
      setUploadedImageUrl(b64);

      setNodes(prev => {
        const existing = prev.find(n => n.id === 'img-node-1');
        const imgNode: Node = {
          id: 'img-node-1',
          type: 'productImageNode',
          position: existing?.position || { x: 150, y: 150 },
          data: {
            imageUrl: b64,
            fileName: file.name,
            mimeType: file.type,
            fileSize: formattedSize,
            dimensions,
            status: 'analyzing',
            uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            onReanalyze: () => {
              if (activeProject && b64) {
                performDnaExtraction(activeProject, b64);
              }
            },
            onUpload: (f: File) => handleUploadFile(f),
            onRemove: () => handleRemoveProductImage()
          }
        };
        if (existing) {
          return prev.map(n => (n.id === 'img-node-1' ? imgNode : n));
        }
        return [...prev, imgNode];
      });

      const proj = await getOrCreateProject();
      if (proj) {
        try {
          const authHeaders = await getAuthHeaders();
          await fetch(`/api/projects/${proj.id}/assets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders
            },
            body: JSON.stringify({
              asset_type: 'product_photo',
              storage_path: b64,
              mime_type: file.type
            })
          });
        } catch (e) {
          console.error('Failed to save project asset:', e);
        }

        await performDnaExtraction(proj, b64);
      } else {
        setUploadState('error');
        setErrorMessage('创建项目容器失败');
      }
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveProductImage = () => {
    setUploadedBase64(null);
    setUploadedImageUrl(null);
    setActiveDna(null);
    setUploadState('idle');
    setErrorMessage(null);
    setNodes(prev =>
      prev.map(n => {
        if (n.id === 'img-node-1') {
          return {
            ...n,
            data: {
              imageUrl: undefined,
              fileName: undefined,
              mimeType: undefined,
              fileSize: undefined,
              uploadedAt: undefined,
              dimensions: undefined,
              status: 'idle',
              onUpload: (f: File) => handleUploadFile(f),
              onRemove: () => handleRemoveProductImage()
            }
          };
        }
        return n;
      })
    );
    addAgentMessage('已成功移除产品主图，您可以随时重新上传。');
  };

  const handleReanalyze = () => {
    if (activeProject && uploadedBase64) {
      performDnaExtraction(activeProject, uploadedBase64);
    }
  };

  const isPlanGeneratingRef = useRef(false);

  // Phase C2: Generate 9-grid plan
  const handleGenerateNineGridPlan = async (promptHint?: string) => {
    if (isPlanGeneratingRef.current) {
      console.warn('九屏企划生成请求正在进行中，自动忽略重复触发');
      return;
    }

    const proj = activeProject || (await getOrCreateProject());
    if (!proj) {
      setPlanError('无法初始化项目容器');
      return;
    }

    isPlanGeneratingRef.current = true;
    setIsPlanGenerating(true);
    setPlanError(null);
    addAgentMessage('正在使用原程序九屏策划能力与统一 Gemini 模型路由生成 9 屏企划方案...');

    try {
      const authHeaders = await getAuthHeaders();
      let currentRunId = agentRun?.id;

      if (!currentRunId) {
        const createRunPayload = { projectId: proj.id };
        assertSerializableRequestPayload(createRunPayload, 'createRunPayload');

        const createRunRes = await fetch('/api/agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify(createRunPayload)
        });
        const createRunData = await parseJsonResponse<{ success?: boolean; agentRun?: AgentRun; error?: string; message?: string }>(createRunRes);
        if (createRunData.success && createRunData.agentRun) {
          currentRunId = createRunData.agentRun.id;
          setAgentRun(createRunData.agentRun);
        } else {
          throw new Error(createRunData.error || createRunData.message || '创建 Agent 运行实例失败');
        }
      }

      const cleanPromptHint = typeof promptHint === 'string' ? promptHint : '';
      const planPayload = { promptHint: cleanPromptHint };
      assertSerializableRequestPayload(planPayload, 'planPayload');

      const genRes = await fetch(`/api/agent/${currentRunId}/generate-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(planPayload)
      });

      const genData = await parseJsonResponse<{ success?: boolean; agentRun?: AgentRun; error?: string; message?: string }>(genRes);

      if (genData.success && genData.agentRun) {
        const run: AgentRun = genData.agentRun;
        setAgentRun(run);

        const adapterResult = mapExistingNineGridResultToCanvasNodes(run, activeDna, {
          onViewFullPlan: () => {
            setSelectedNodeId('nine-grid-plan-node');
            setSelectedSceneIndex(null);
          },
          onRegenerateAll: () => handleGenerateNineGridPlan(),
          onViewSceneDetail: (idx: number) => {
            setSelectedNodeId(`scene-plan-node-${idx}`);
            setSelectedSceneIndex(idx);
          },
          onReplanScene: (idx: number) => handleReplanSingleScene(idx)
        });

        setNodes(prev => {
          const baseNodes = prev.filter(
            n => n.id === 'welcome-1' || n.id === 'img-node-1' || n.id === 'dna-node-1'
          );
          const newMappedNodes = adapterResult.nodes.map(newN => {
            const existing = prev.find(p => p.id === newN.id);
            if (existing) {
              return { ...newN, position: existing.position };
            }
            return newN;
          });
          return [...baseNodes, ...newMappedNodes];
        });

        setEdges(prev => {
          const baseEdges = prev.filter(e => e.id === 'edge-img-dna');
          return [...baseEdges, ...adapterResult.edges];
        });

        setIsPlanGenerating(false);
        addAgentMessage('🎉 九屏视觉企划方案生成成功！已转换为 1 个总策划节点和 9 个分镜方案节点并同步显示在画布中。');
      } else {
        const errStr = genData.error || genData.message || '服务端生成企划失败';
        setPlanError(errStr);
        setIsPlanGenerating(false);
        addAgentMessage(`❌ 九屏企划生成异常：${errStr}`);
      }
    } catch (err: any) {
      const errStr = err?.message || '网络请求或引擎解析异常';
      setPlanError(errStr);
      setIsPlanGenerating(false);
      addAgentMessage(`❌ 九屏企划生成失败：${errStr}`);
    } finally {
      isPlanGeneratingRef.current = false;
    }
  };

  // Phase C2: Single screen replanning
  const handleReplanSingleScene = async (screenIndex: number, promptHint?: string) => {
    if (isPlanGeneratingRef.current) {
      console.warn('正在生成或修改企划中，自动忽略重复触发');
      return;
    }

    if (!agentRun?.id) {
      setPlanError('缺失 Agent 运行实例');
      return;
    }

    isPlanGeneratingRef.current = true;
    setIsPlanGenerating(true);
    setPlanError(null);
    addAgentMessage(`正在重新策划第 ${screenIndex} 屏分镜...`);

    try {
      const authHeaders = await getAuthHeaders();
      const cleanPromptHint = typeof promptHint === 'string' ? promptHint : '优化核心卖点与构图';
      const replanPayload = { promptHint: cleanPromptHint };
      assertSerializableRequestPayload(replanPayload, 'replanPayload');

      const res = await fetch(`/api/agent/${agentRun.id}/screens/${screenIndex}/replan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(replanPayload)
      });

      const data = await parseJsonResponse<{ success?: boolean; updatedScreen?: any; agentRun?: AgentRun; error?: string; message?: string }>(res);

      if (data.success && data.updatedScreen && data.agentRun) {
        const run: AgentRun = data.agentRun;
        setAgentRun(run);

        const screen = data.updatedScreen;

        setNodes(prev =>
          prev.map(n => {
            if (n.id === `scene-plan-node-${screenIndex}`) {
              return {
                ...n,
                data: {
                  ...n.data,
                  screenTitle: screen.screenTitle,
                  coreSellingPoint: screen.coreSellingPoint,
                  visualComposition: screen.visualComposition,
                  lightingAndAtmosphere: screen.lightingAndAtmosphere,
                  promptSuggestion: screen.promptSuggestion,
                  aspectRatio: screen.aspectRatio || '3:4',
                  status: 'completed',
                  onViewDetail: () => {
                    setSelectedNodeId(`scene-plan-node-${screenIndex}`);
                    setSelectedSceneIndex(screenIndex);
                  },
                  onReplanScene: () => handleReplanSingleScene(screenIndex)
                }
              };
            }
            return n;
          })
        );

        setIsPlanGenerating(false);
        addAgentMessage(`✅ 第 ${screenIndex} 屏分镜（${screen.screenTitle}）重新策划完成！节点已更新。`);
      } else {
        const errStr = data.error || data.message || '单屏重新策划失败';
        setPlanError(errStr);
        setIsPlanGenerating(false);
        addAgentMessage(`❌ 第 ${screenIndex} 屏重新策划失败：${errStr}`);
      }
    } catch (err: any) {
      const errStr = err?.message || '请求失败';
      setPlanError(errStr);
      setIsPlanGenerating(false);
      addAgentMessage(`❌ 单屏重新策划异常：${errStr}`);
    } finally {
      isPlanGeneratingRef.current = false;
    }
  };

  // Phase C3A: Single screen image generation & review
  const generatingScenesRef = useRef<Set<number>>(new Set());

  const handleApproveSceneImage = (screenIndex: number) => {
    const resultNodeId = `gen-img-node-${screenIndex}`;
    setNodes(prev =>
      prev.map(n => {
        if (n.id === resultNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              reviewStatus: 'approved'
            }
          };
        }
        return n;
      })
    );
    addAgentMessage(`🎉 第 ${screenIndex} 屏渲染图片人审标记为：【审核通过】！`);
  };

  const handleRejectSceneImage = (screenIndex: number, feedback: string) => {
    const resultNodeId = `gen-img-node-${screenIndex}`;
    setNodes(prev =>
      prev.map(n => {
        if (n.id === resultNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              reviewStatus: 'rejected',
              reviewFeedback: feedback
            }
          };
        }
        return n;
      })
    );
    addAgentMessage(`⚠️ 第 ${screenIndex} 屏渲染图片已被标记为【未通过】。修改要求：“${feedback}”。可点击【根据反馈重新生成】修正。`);
  };

  const handleGenerateSceneImage = async (
    screenIndex: number, 
    reviewFeedback?: string, 
    overrideModel?: string, 
    overrideResolution?: '1K' | '2K' | '4K'
  ) => {
    if (generatingScenesRef.current.has(screenIndex)) {
      console.warn(`第 ${screenIndex} 屏图片生成正在进行中，忽略重复触发`);
      return;
    }

    const modelToUse = overrideModel || selectedModel || 'gemini-3.1-flash-image';
    const resolutionToUse = overrideResolution || selectedResolution || '2K';
    const isGpt = modelToUse.includes('gpt-image');

    let rawB64 = uploadedBase64Ref.current || uploadedBase64;
    if (!rawB64) {
      const imgNode = nodes.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
      if (imgNode?.data?.imageUrl) {
        rawB64 = imgNode.data.imageUrl as string;
      }
    }

    if (!rawB64) {
      addAgentMessage('❌ 缺少产品主图，请先上传产品主角图后再生成图片。');
      return;
    }

    let dna = activeDna || agentRun?.dna;
    if (!dna) {
      const dnaNode = nodes.find(n => n.id === 'dna-node-1' || n.type === 'productDnaNode');
      if (dnaNode?.data) {
        dna = dnaNode.data as unknown as ProductVisualDNA;
      }
    }

    if (!dna) {
      addAgentMessage('❌ 缺少产品 DNA 数据，请先完成 DNA 提取后再生成海报/图片。');
      return;
    }

    let screen = agentRun?.plan?.screens?.find(s => s.screenIndex === screenIndex);
    if (!screen) {
      const sceneNode = nodes.find(
        n => n.id === `scene-plan-node-${screenIndex}` || n.data?.screenIndex === screenIndex || (n.id === selectedNodeId && n.data?.promptSuggestion)
      );
      if (sceneNode?.data) {
        screen = {
          screenIndex: Number(sceneNode.data.screenIndex) || screenIndex,
          screenTitle: (sceneNode.data.screenTitle as string) || `第 ${screenIndex} 屏分镜`,
          coreSellingPoint: (sceneNode.data.coreSellingPoint as string) || '',
          visualComposition: (sceneNode.data.visualComposition as string) || '',
          lightingAndAtmosphere: (sceneNode.data.lightingAndAtmosphere as string) || '',
          promptSuggestion: (sceneNode.data.promptSuggestion as string) || (sceneNode.data.prompt as string) || '',
          aspectRatio: (sceneNode.data.aspectRatio as string) || '3:4',
          lockedRules: []
        };
      }
    }

    if (!screen || !screen.promptSuggestion) {
      addAgentMessage(`❌ 未找到第 ${screenIndex} 屏分镜策划或提示词信息。`);
      return;
    }

    generatingScenesRef.current.add(screenIndex);
    const modelLabel = isGpt ? 'OpenAI GPT image-2' : modelToUse.includes('3-pro') ? 'Google Gemini v3.0 Pro' : modelToUse.includes('2.5') ? 'Google Gemini v2.5 Flash' : 'Google Gemini v3.1 Flash';
    addAgentMessage(`正在调用 ${modelLabel} (${resolutionToUse}) 渲染引擎生成第 ${screenIndex} 屏画面...`);

    // Determine initial node position
    let sceneNodePos = { x: 1150, y: (screenIndex - 1) * 260 };
    const existingSceneNode = nodes.find(n => n.id === `scene-plan-node-${screenIndex}`);
    if (existingSceneNode) {
      sceneNodePos = existingSceneNode.position;
    }

    const taskId = `task-${Date.now()}`;
    const startTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Create/Update ImageGenerationNode
    const taskNodeId = `img-gen-task-${screenIndex}`;
    setNodes(prev => {
      const existing = prev.find(n => n.id === taskNodeId);
      const taskNode: Node = {
        id: taskNodeId,
        type: 'imageGenerationNode',
        position: existing?.position || { x: sceneNodePos.x + 380, y: sceneNodePos.y },
        data: {
          sceneIndex: screenIndex,
          screenTitle: screen.screenTitle,
          model: modelToUse,
          provider: isGpt ? 'openai' : 'google',
          aspectRatio: screen.aspectRatio || '3:4',
          referenceCount: 1,
          status: 'generating',
          startTime,
          taskId
        }
      };
      if (existing) {
        return prev.map(n => (n.id === taskNodeId ? taskNode : n));
      }
      return [...prev, taskNode];
    });

    // Create edge: ScenePlanNode -> ImageGenerationNode
    const edgeTask = `edge-scene-gen-${screenIndex}`;
    setEdges(prev => {
      if (prev.some(e => e.id === edgeTask)) return prev;
      return [
        ...prev,
        {
          id: edgeTask,
          source: `scene-plan-node-${screenIndex}`,
          target: taskNodeId,
          sourceHandle: 'source',
          targetHandle: 'target',
          label: '生成画面',
          labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
          labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
          animated: true,
          style: { stroke: '#B28C5A', strokeWidth: 2 }
        }
      ];
    });

    try {
      const targetRaw = rawB64 || uploadedBase64Ref.current || uploadedBase64 || '';
      let cleanB64 = await resolveClientImageToBase64(targetRaw);

      if (!cleanB64) {
        const imgNode = nodes.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
        if (imgNode?.data?.imageUrl) {
          cleanB64 = await resolveClientImageToBase64(imgNode.data.imageUrl as string);
        }
      }

      if (cleanB64 && !uploadedBase64Ref.current) {
        uploadedBase64Ref.current = cleanB64;
      }

      let fullPrompt = `${screen.promptSuggestion}\n\n[核心画幅与构图]: ${screen.visualComposition}，光影氛围：${screen.lightingAndAtmosphere}。`;

      if (dna) {
        const styleStr = Array.isArray(dna.style) ? dna.style.join('、') : (dna.style || '');
        const matStr = Array.isArray(dna.materials) ? dna.materials.join('、') : (dna.materials || '');
        const structStr = Array.isArray(dna.structuralFeatures)
          ? dna.structuralFeatures.map(f => `${f.name}: ${f.description}`).join('；')
          : '';
        const lockedStr = Array.isArray(dna.lockedFeatures)
          ? dna.lockedFeatures.map(f => `${f.name}(${f.rule})`).join('；')
          : '';

        fullPrompt += `\n\n[核心产品主角 DNA 强约束 (必须与参考主图完全一致)]:`;
        if (dna.category) fullPrompt += `\n- 产品品类: ${dna.category}`;
        if (dna.primaryColor) fullPrompt += `\n- 主色调与外观色彩: ${dna.primaryColor}`;
        if (matStr) fullPrompt += `\n- 核心材质与触感: ${matStr}`;
        if (styleStr) fullPrompt += `\n- 设计风格: ${styleStr}`;
        if (structStr) fullPrompt += `\n- 关键结构特征: ${structStr}`;
        if (lockedStr) fullPrompt += `\n- 必须锁定规则: ${lockedStr}`;
        fullPrompt += `\n- 极其重要: 画面中的核心家具/产品主体必须100%参照输入参考主图，保持造型结构、扶手样式、靠背弧度、包边缝线、面料材质与色调完全一致，严禁改变产品外观样式。`;
      } else {
        fullPrompt += `\n\n[家具强约束]: 必须保持核心产品结构与造型与参考图完全一致，扶手、靠背缝线、座包材质严格符合 DNA 描述。`;
      }

      if (reviewFeedback) {
        fullPrompt += `\n\n[根据审核反馈重绘调整]: ${reviewFeedback}`;
      }

      fullPrompt += `\n\n严禁在画面中渲染任何文字、尺寸标尺、箭头或 UI 元素。`;

      // Assert serializable DTO before call
      const generatePayload = {
        screenIndex,
        prompt: fullPrompt,
        aspectRatio: screen.aspectRatio || '3:4',
        model: modelToUse,
        hasRefImage: !!cleanB64
      };
      assertSerializableRequestPayload(generatePayload, 'generatePayload');

      const imageAttachments: ImageAttachment[] = cleanB64 ? [
        {
          id: `ref-img-${Date.now()}`,
          previewUrl: cleanB64.startsWith('data:') ? cleanB64 : `data:image/jpeg;base64,${cleanB64}`,
          base64Data: cleanB64,
          mimeType: 'image/jpeg',
          width: 1024,
          height: 1024
        }
      ] : [];

      const result = await generateEditedImage(
        fullPrompt,
        imageAttachments,
        screen.aspectRatio || '3:4',
        resolutionToUse,
        modelToUse as any,
        undefined,
        msg => console.log(`[SceneImage #${screenIndex}]`, msg)
      );

      if (result && result.imageUrl) {
        // Update task node status to completed
        setNodes(prev =>
          prev.map(n => {
            if (n.id === taskNodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  status: 'completed',
                  model: result.actualModel || modelToUse,
                  provider: result.provider || (isGpt ? 'openai' : 'google')
                }
              };
            }
            return n;
          })
        );

        // Create/Update GeneratedImageNode
        const resultNodeId = `gen-img-node-${screenIndex}`;
        setNodes(prev => {
          const existing = prev.find(n => n.id === resultNodeId);
          const version = existing?.data?.version ? Number(existing.data.version) + 1 : 1;
          const genNode: Node = {
            id: resultNodeId,
            type: 'generatedImageNode',
            position: existing?.position || { x: sceneNodePos.x + 720, y: sceneNodePos.y },
            data: {
              sceneIndex: screenIndex,
              screenTitle: screen.screenTitle,
              imageUrl: result.imageUrl,
              dimensions: resolutionToUse === '4K' ? '3840x2160' : resolutionToUse === '2K' ? '2560x1440' : '1024x1365',
              aspectRatio: screen.aspectRatio || '3:4',
              model: result.actualModel || modelToUse,
              provider: result.provider || (isGpt ? 'openai' : 'google'),
              generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              version,
              reviewStatus: 'pendingReview',
              prompt: fullPrompt,
              onViewDetail: () => {
                setSelectedNodeId(resultNodeId);
                setSelectedSceneIndex(screenIndex);
              },
              onApprove: () => handleApproveSceneImage(screenIndex),
              onReject: (feedback: string) => handleRejectSceneImage(screenIndex, feedback)
            }
          };

          if (existing) {
            return prev.map(n => (n.id === resultNodeId ? genNode : n));
          }
          return [...prev, genNode];
        });

        // Edge: ImageGenerationNode -> GeneratedImageNode
        const edgeResult = `edge-gen-result-${screenIndex}`;
        setEdges(prev => {
          if (prev.some(e => e.id === edgeResult)) return prev;
          return [
            ...prev,
            {
              id: edgeResult,
              source: taskNodeId,
              target: resultNodeId,
              sourceHandle: 'source',
              targetHandle: 'target',
              label: '生成结果',
              labelStyle: { fill: '#10B981', fontSize: 10, fontWeight: 700 },
              labelBgStyle: { fill: '#ECFDF5', rx: 4, ry: 4 },
              animated: true,
              style: { stroke: '#10B981', strokeWidth: 2 }
            }
          ];
        });

        addAgentMessage(`✅ 第 ${screenIndex} 屏渲染图片生成成功！已加入画布节点，请在右侧进行审阅。`);
      } else {
        throw new Error('渲染服务未响应有效图片');
      }
    } catch (err: any) {
      const errText = err?.message || '渲染图片失败';
      setNodes(prev =>
        prev.map(n => {
          if (n.id === taskNodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                status: 'error',
                errorMsg: errText
              }
            };
          }
          return n;
        })
      );
      addAgentMessage(`❌ 第 ${screenIndex} 屏渲染图片失败：${errText}`);
    } finally {
      generatingScenesRef.current.delete(screenIndex);
    }
  };

  // Phase C3B: Batch Generation & Controlled Task Queue
  const [batchState, setBatchState] = useState<GenerationBatch | null>(null);
  const [queueItems, setQueueItems] = useState<SceneQueueItem[]>([]);
  const [showBatchConfirmModal, setShowBatchConfirmModal] = useState<boolean>(false);
  const [batchConfirmInfo, setBatchConfirmInfo] = useState<{
    existingCount: number;
    missingCount: number;
    failedCount: number;
    missingSceneNumbers: number[];
  } | null>(null);

  const isBatchPausedRef = useRef<boolean>(false);
  const isBatchCancelledRef = useRef<boolean>(false);
  const activeWorkerCountRef = useRef<number>(0);
  const queueItemsRef = useRef<SceneQueueItem[]>([]);
  queueItemsRef.current = queueItems;

  const handleTriggerBatchMissingModal = useCallback(() => {
    const screens = agentRun?.plan?.screens || [];
    if (screens.length === 0) {
      alert('请先生成九屏企划方案');
      return;
    }

    const missingSceneNumbers: number[] = [];
    let existingCount = 0;
    let failedCount = 0;

    screens.forEach((_, idx) => {
      const sceneNum = idx + 1;
      const hasGenImg = nodes.some(
        n =>
          n.id === `gen-img-node-${sceneNum}` &&
          n.data &&
          typeof n.data.imageUrl === 'string' &&
          (n.data.imageUrl as string).trim() !== ''
      );

      if (hasGenImg) {
        existingCount += 1;
      } else {
        missingSceneNumbers.push(sceneNum);
      }
    });

    if (missingSceneNumbers.length === 0) {
      addAgentMessage('当前九屏均已生成，无缺失画面。');
      return;
    }

    setBatchConfirmInfo({
      existingCount,
      missingCount: missingSceneNumbers.length,
      failedCount,
      missingSceneNumbers
    });
    setShowBatchConfirmModal(true);
  }, [agentRun, nodes, addAgentMessage]);

  const processQueue = useCallback(async () => {
    if (isBatchCancelledRef.current || isBatchPausedRef.current) return;

    const CONCURRENCY_LIMIT = 2;
    const currentItems = queueItemsRef.current;
    const pendingItems = currentItems.filter(i => i.status === 'queued' || i.status === 'pending');

    if (pendingItems.length === 0 && activeWorkerCountRef.current === 0) {
      const totalSuccess = currentItems.filter(i => i.status === 'success').length;
      const totalFailed = currentItems.filter(i => i.status === 'failed').length;
      const totalCancelled = currentItems.filter(i => i.status === 'cancelled').length;

      setBatchState(prev => {
        if (!prev) return null;
        let finalStatus: GenerationBatch['status'] = 'completed';
        if (totalFailed > 0 && totalSuccess > 0) finalStatus = 'partial_failed';
        else if (totalFailed > 0 && totalSuccess === 0) finalStatus = 'partial_failed';
        else if (totalCancelled > 0) finalStatus = 'cancelled';

        return {
          ...prev,
          status: finalStatus,
          running: 0,
          completedAt: new Date().toISOString()
        };
      });

      if (totalFailed > 0) {
        addAgentMessage(`批量生成队列执行完毕：完成 ${totalSuccess} 屏，失败 ${totalFailed} 屏。可在队列控制区重试失败项。`);
      } else if (totalSuccess > 0) {
        addAgentMessage(`🎉 九屏批量生成任务已全部顺利完成！所有 ${totalSuccess} 屏画面已呈现于画布支线。`);
      }
      return;
    }

    while (activeWorkerCountRef.current < CONCURRENCY_LIMIT) {
      if (isBatchPausedRef.current || isBatchCancelledRef.current) break;

      const nextItemIndex = queueItemsRef.current.findIndex(i => i.status === 'queued' || i.status === 'pending');
      if (nextItemIndex === -1) break;

      const taskItem = queueItemsRef.current[nextItemIndex];
      activeWorkerCountRef.current += 1;

      setQueueItems(prev => {
        const updated = [...prev];
        updated[nextItemIndex] = { ...updated[nextItemIndex], status: 'generating' };
        queueItemsRef.current = updated;
        return updated;
      });

      setBatchState(prev => (prev ? { ...prev, running: activeWorkerCountRef.current } : null));

      // Asynchronously process single scene task
      (async () => {
        try {
          await handleGenerateSceneImage(taskItem.sceneNumber);

          setQueueItems(prev => {
            const updated = prev.map(i =>
              i.sceneNumber === taskItem.sceneNumber ? { ...i, status: 'success' as const } : i
            );
            queueItemsRef.current = updated;
            return updated;
          });

          setBatchState(prev => (prev ? { ...prev, success: prev.success + 1, pending: Math.max(0, prev.pending - 1) } : null));
        } catch (err: any) {
          console.error(`[BatchQueue] Scene #${taskItem.sceneNumber} failed:`, err);

          if (err?.message?.includes('429') && taskItem.attempt === 0) {
            console.log(`[BatchQueue] Retrying scene #${taskItem.sceneNumber} due to 429 rate limit...`);
            setQueueItems(prev => {
              const updated = prev.map(i =>
                i.sceneNumber === taskItem.sceneNumber
                  ? { ...i, status: 'queued' as const, attempt: i.attempt + 1 }
                  : i
              );
              queueItemsRef.current = updated;
              return updated;
            });
          } else {
            setQueueItems(prev => {
              const updated = prev.map(i =>
                i.sceneNumber === taskItem.sceneNumber
                  ? {
                      ...i,
                      status: 'failed' as const,
                      error: { message: err?.message || '生成图片失败' }
                    }
                  : i
              );
              queueItemsRef.current = updated;
              return updated;
            });

            setBatchState(prev => (prev ? { ...prev, failed: prev.failed + 1, pending: Math.max(0, prev.pending - 1) } : null));
          }
        } finally {
          activeWorkerCountRef.current -= 1;
          setBatchState(prev => (prev ? { ...prev, running: activeWorkerCountRef.current } : null));

          setTimeout(() => {
            processQueue();
          }, 300);
        }
      })();
    }
  }, [handleGenerateSceneImage, addAgentMessage]);

  const handleStartBatchGeneration = useCallback(() => {
    if (!batchConfirmInfo || batchConfirmInfo.missingSceneNumbers.length === 0) return;
    setShowBatchConfirmModal(false);

    const batchId = `batch_${Date.now()}`;
    const missingNums = batchConfirmInfo.missingSceneNumbers;

    const items: SceneQueueItem[] = missingNums.map(num => ({
      sceneId: `scene-plan-node-${num}`,
      sceneNumber: num,
      status: 'queued',
      attempt: 0
    }));

    const batch: GenerationBatch = {
      batchId,
      sceneIds: missingNums.map(n => `scene-plan-node-${n}`),
      status: 'running',
      total: missingNums.length,
      pending: missingNums.length,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString()
    };

    setQueueItems(items);
    queueItemsRef.current = items;
    setBatchState(batch);

    isBatchPausedRef.current = false;
    isBatchCancelledRef.current = false;
    activeWorkerCountRef.current = 0;

    addAgentMessage(
      `已启动九屏批量生成任务，队列中有 ${missingNums.length} 屏待生成（已自动跳过已有图片的 ${batchConfirmInfo.existingCount} 屏），并发数为 2。`
    );

    setTimeout(() => {
      processQueue();
    }, 100);
  }, [batchConfirmInfo, addAgentMessage, processQueue]);

  const handlePauseBatch = useCallback(() => {
    isBatchPausedRef.current = true;
    setBatchState(prev => (prev ? { ...prev, status: 'paused' } : null));
    addAgentMessage('已暂停九屏批量生成队列。当前正在运行的任务将继续完成，排队中的任务暂停启动。');
  }, [addAgentMessage]);

  const handleResumeBatch = useCallback(() => {
    isBatchPausedRef.current = false;
    setBatchState(prev => (prev ? { ...prev, status: 'running' } : null));
    addAgentMessage('已恢复九屏批量生成队列。');
    setTimeout(() => {
      processQueue();
    }, 100);
  }, [addAgentMessage, processQueue]);

  const handleCancelBatch = useCallback(() => {
    isBatchCancelledRef.current = true;
    setQueueItems(prev => {
      const updated = prev.map(i =>
        i.status === 'queued' || i.status === 'pending' ? { ...i, status: 'cancelled' as const } : i
      );
      queueItemsRef.current = updated;
      return updated;
    });
    setBatchState(prev => (prev ? { ...prev, status: 'cancelled' } : null));
    addAgentMessage('已取消批量生成队列中所有排队中的任务。已成功的图片及节点已安全保留。');
  }, [addAgentMessage]);

  const handleRetryFailedBatch = useCallback(() => {
    const failedItems = queueItemsRef.current.filter(i => i.status === 'failed');
    if (failedItems.length === 0) return;

    setQueueItems(prev => {
      const updated = prev.map(i =>
        i.status === 'failed' ? { ...i, status: 'queued' as const, attempt: 0, error: undefined } : i
      );
      queueItemsRef.current = updated;
      return updated;
    });

    setBatchState(prev =>
      prev
        ? {
            ...prev,
            status: 'running',
            pending: prev.pending + failedItems.length,
            failed: prev.failed - failedItems.length
          }
        : null
    );

    isBatchPausedRef.current = false;
    isBatchCancelledRef.current = false;

    addAgentMessage(`开始重试 ${failedItems.length} 个失败的分镜画面生成...`);

    setTimeout(() => {
      processQueue();
    }, 100);
  }, [addAgentMessage, processQueue]);

  const handleSelectSceneIndex = useCallback((idx: number | null) => {
    setSelectedSceneIndex(idx);
    let targetNodeId: string | null = null;
    if (idx !== null) {
      const sceneNode = nodes.find(n => n.id === `scene-plan-node-${idx}`);
      const genNode = nodes.find(n => n.id === `gen-img-node-${idx}`);
      targetNodeId = sceneNode?.id || genNode?.id || `scene-plan-node-${idx}`;
      setNodes(prev => prev.map(n => ({
        ...n,
        selected: n.id === targetNodeId || (genNode && n.id === genNode.id)
      })));
    } else {
      setNodes(prev => prev.map(n => ({ ...n, selected: false })));
    }
    setSelectedNodeId(targetNodeId);

    try {
      const ns = workspaceIdParam ? `c4b1_${workspaceIdParam}` : 'c4b1_default';
      if (idx !== null) {
        sessionStorage.setItem(`${ns}_selectedSceneIndex`, String(idx));
      } else {
        sessionStorage.removeItem(`${ns}_selectedSceneIndex`);
      }
      if (targetNodeId) {
        sessionStorage.setItem(`${ns}_selectedNodeId`, targetNodeId);
      } else {
        sessionStorage.removeItem(`${ns}_selectedNodeId`);
      }
    } catch (e) {}
  }, [nodes, setNodes, workspaceIdParam]);

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setNodes(prev => prev.map(n => ({ ...n, selected: n.id === node.id })));
    let foundIdx: number | null = null;
    if (node.id.startsWith('scene-plan-node-') || node.id.startsWith('gen-img-node-') || node.id.startsWith('img-gen-task-')) {
      const idxStr = node.id.replace(/^(scene-plan-node-|gen-img-node-|img-gen-task-)/, '');
      const parsed = parseInt(idxStr, 10);
      if (!isNaN(parsed)) foundIdx = parsed;
    }
    if (foundIdx === null && node.data?.screenIndex) {
      const parsed = parseInt(String(node.data.screenIndex), 10);
      if (!isNaN(parsed)) foundIdx = parsed;
    }
    setSelectedSceneIndex(foundIdx);

    try {
      const ns = workspaceIdParam ? `c4b1_${workspaceIdParam}` : 'c4b1_default';
      sessionStorage.setItem(`${ns}_selectedNodeId`, node.id);
      if (foundIdx !== null) {
        sessionStorage.setItem(`${ns}_selectedSceneIndex`, String(foundIdx));
      } else {
        sessionStorage.removeItem(`${ns}_selectedSceneIndex`);
      }
    } catch (e) {}
  };

  // Safe recovery/fallback for selected node per canvas namespace
  useEffect(() => {
    if (nodes.length > 0) {
      const ns = workspaceIdParam ? `c4b1_${workspaceIdParam}` : 'c4b1_default';
      try {
        const storedNodeId = sessionStorage.getItem(`${ns}_selectedNodeId`);
        const storedSceneIndex = sessionStorage.getItem(`${ns}_selectedSceneIndex`);

        if (storedNodeId) {
          const exists = nodes.some(n => n.id === storedNodeId);
          if (exists) {
            if (selectedNodeId !== storedNodeId) {
              setSelectedNodeId(storedNodeId);
            }
          } else {
            // Node does not exist on this canvas - safely fallback
            if (selectedNodeId === storedNodeId) {
              setSelectedNodeId(null);
            }
            sessionStorage.removeItem(`${ns}_selectedNodeId`);
          }
        }

        if (storedSceneIndex !== null) {
          const parsed = parseInt(storedSceneIndex, 10);
          if (!isNaN(parsed) && selectedSceneIndex !== parsed) {
            setSelectedSceneIndex(parsed);
          }
        }
      } catch (e) {}
    }
  }, [workspaceIdParam, nodes.length]);

  // Phase C4-Edit: Canvas Selection, Deletion, Addition, Duplication, and Inline Editing
  const selectAllNodes = useCallback(() => {
    setNodes(prev => prev.map(n => ({ ...n, selected: true })));
  }, [setNodes]);

  const clearSelection = useCallback(() => {
    setNodes(prev => prev.map(n => ({ ...n, selected: false })));
  }, [setNodes]);

  const deleteNodeById = useCallback((nodeId: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const deleteSelectedNodes = useCallback(() => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      const selectedIds = new Set(prev.filter(n => n.selected).map(n => n.id));
      if (selectedIds.size === 0) return prev;

      setEdges(prevEdges =>
        prevEdges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target))
      );

      return prev.filter(n => !selectedIds.has(n.id));
    });
  }, [setNodes, setEdges]);

  const duplicateNodeById = useCallback((nodeId: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      const target = prev.find(n => n.id === nodeId);
      if (!target) return prev;
      const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newNode: Node = {
        ...target,
        id: newId,
        position: {
          x: (target.position?.x || 0) + 40,
          y: (target.position?.y || 0) + 40
        },
        selected: true,
        data: {
          ...target.data,
          ...(target.data?.screenTitle ? { screenTitle: `${target.data.screenTitle} (副本)` } : {}),
          ...(target.data?.title ? { title: `${target.data.title} (副本)` } : {})
        }
      };
      return [...prev.map(n => ({ ...n, selected: false })), newNode];
    });
  }, [setNodes]);

  const duplicateSelectedNodes = useCallback(() => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      const selectedList = prev.filter(n => n.selected);
      if (selectedList.length === 0) return prev;

      const newNodes = selectedList.map(n => {
        const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        return {
          ...n,
          id: newId,
          position: {
            x: (n.position?.x || 0) + 40,
            y: (n.position?.y || 0) + 40
          },
          selected: true,
          data: {
            ...n.data,
            ...(n.data?.screenTitle ? { screenTitle: `${n.data.screenTitle} (副本)` } : {}),
            ...(n.data?.title ? { title: `${n.data.title} (副本)` } : {})
          }
        };
      });

      const unselectedOld = prev.map(n => ({ ...n, selected: false }));
      return [...unselectedOld, ...newNodes];
    });
  }, [setNodes]);

  const updateNodeData = useCallback((nodeId: string, partialData: any) => {
    hasUserMutationRef.current = true;
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...partialData } } : n))
    );
  }, [setNodes]);

  const addCustomNode = useCallback((nodeKind: 'note' | 'scene' | 'prompt' | 'image', customParams?: any) => {
    hasUserMutationRef.current = true;
    const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    setNodes(prev => {
      let spawnX = 220;
      let spawnY = 180;

      if (prev.length > 0) {
        const lastNode = prev[prev.length - 1];
        spawnX = (lastNode.position?.x || 100) + 50;
        spawnY = (lastNode.position?.y || 100) + 50;
      }

      let newNode: Node;

      if (nodeKind === 'note') {
        newNode = {
          id: newId,
          type: 'noteNode',
          position: { x: spawnX, y: spawnY },
          selected: true,
          data: {
            title: customParams?.title || '自定义企划便签',
            text: customParams?.text || '双击或点击编辑按钮输入调整意见、重点强调或选型标注...',
            color: customParams?.color || 'amber'
          }
        };
      } else if (nodeKind === 'prompt') {
        newNode = {
          id: newId,
          type: 'noteNode',
          position: { x: spawnX, y: spawnY },
          selected: true,
          data: {
            title: customParams?.title || 'AI 绘图提示词',
            text: customParams?.text || 'cinematic lighting, ultra-realistic product photography, 8k resolution, cozy atmosphere...',
            color: 'blue'
          }
        };
      } else if (nodeKind === 'scene') {
        const sceneIndex = prev.filter(n => n.type === 'scenePlanNode' || n.type === 'scenePlan').length + 1;
        newNode = {
          id: newId,
          type: 'scenePlanNode',
          position: { x: spawnX, y: spawnY },
          selected: true,
          data: {
            screenIndex: sceneIndex,
            screenTitle: customParams?.title || `第 ${sceneIndex} 屏：自定义视觉场景`,
            coreSellingPoint: customParams?.sellingPoint || '展示产品核心卖点与材质细节',
            visualComposition: customParams?.composition || '特写与家居环境组合视角',
            lightingAndAtmosphere: customParams?.lighting || '自然日光与高端奢华氛围',
            promptSuggestion: customParams?.prompt || 'detailed product close-up shot, warm luxury living room setting'
          }
        };
      } else {
        newNode = {
          id: newId,
          type: 'productImageNode',
          position: { x: spawnX, y: spawnY },
          selected: true,
          data: {
            fileName: customParams?.fileName || '参考元素.jpg',
            imageUrl: customParams?.imageUrl || '',
            uploadedAt: '刚刚'
          }
        };
      }

      const deselectPrev = prev.map(n => ({ ...n, selected: false }));
      return [...deselectPrev, newNode];
    });

    return newId;
  }, [setNodes]);

  // Re-bind interactive handlers for restored nodes
  const attachNodeHandlers = useCallback(
    (nodeList: Node[]): Node[] => {
      return nodeList.map(node => {
        const data = { ...(node.data || {}) };

        // Bind universal edit & delete handlers to every node
        data.onDelete = () => deleteNodeById(node.id);
        data.onDuplicate = () => duplicateNodeById(node.id);
        data.onChange = (updated: any) => updateNodeData(node.id, updated);
        data.onUpdate = (updated: any) => updateNodeData(node.id, updated);

        if (node.id === 'dna-node-1' || node.type === 'productDnaNode') {
          data.onViewFullDna = () => setShowFullDnaDrawer(true);
          data.dnaCode = dnaCode || data.dnaCode || 'DNA-178229';
          data.versionCode = productDnaVersionCode || data.versionCode || 'DNA-V001';
          data.productDnaVersionId = productDnaVersionId || data.productDnaVersionId;
          data.versions = dnaVersions.length > 0 ? dnaVersions : data.versions;
          data.onSelectDnaVersion = handleSelectDnaVersion;
        } else if (node.id === 'nine-grid-plan-node' || node.type === 'nineGridPlanNode') {
          data.onViewFullPlan = () => {
            setSelectedNodeId('nine-grid-plan-node');
            setSelectedSceneIndex(null);
          };
          data.onRegenerateAll = () => handleGenerateNineGridPlan();
          data.onGenerateMissingImages = () => handleTriggerBatchMissingModal();
          if (batchState) {
            data.batchProgress = {
              completed: batchState.success + batchState.failed,
              total: batchState.total,
              status: batchState.status
            };
          }
        } else if (node.id.startsWith('scene-plan-node-') || node.type === 'scenePlanNode') {
          const idxStr = node.id.replace('scene-plan-node-', '');
          const idx: number = parseInt(idxStr, 10) || Number(data.screenIndex) || 1;
          const formattedIdx = String(idx).padStart(2, '0');
          data.assetSkuCode = data.assetSkuCode || `SKU-SCENE-${formattedIdx}`;
          data.assetVersionCode = data.assetVersionCode || 'V001';
          data.productDnaVersionCode = productDnaVersionCode || 'DNA-V001';
          data.productDnaVersionId = productDnaVersionId;
          data.onViewDetail = () => {
            setSelectedNodeId(node.id);
            setSelectedSceneIndex(idx);
          };
          data.onReplanScene = () => handleReplanSingleScene(idx);
          data.onGenerateImage = () => handleGenerateSceneImage(idx);
        } else if (node.id.startsWith('img-gen-task-') || node.type === 'imageGenerationNode') {
          const idxStr = node.id.replace('img-gen-task-', '');
          const idx: number = parseInt(idxStr, 10) || Number(data.screenIndex) || 1;
          data.onGenerate = () => handleGenerateSceneImage(idx);
        } else if (node.id.startsWith('gen-img-node-') || node.type === 'generatedImageNode') {
          const idxStr = node.id.replace('gen-img-node-', '');
          const idx: number = parseInt(idxStr, 10) || Number(data.screenIndex) || 1;
          const formattedIdx = String(idx).padStart(2, '0');
          data.assetSkuCode = data.assetSkuCode || `SKU-SCENE-${formattedIdx}`;
          data.assetVersionCode = data.assetVersionCode || `V00${data.version || 1}`;
          data.productDnaVersionCode = productDnaVersionCode || 'DNA-V001';
          data.productDnaVersionId = productDnaVersionId;
          data.onViewDetail = () => {
            setSelectedNodeId(node.id);
            setSelectedSceneIndex(idx);
          };
          data.onApprove = () => handleApproveSceneImage(idx);
          data.onReject = (feedback: string) => handleRejectSceneImage(idx, feedback);
        } else if (node.id === 'img-node-1' || node.type === 'productImageNode') {
          data.onReanalyze = () => handleReanalyze();
        }

        return { ...node, data };
      });
    },
    [
      deleteNodeById,
      duplicateNodeById,
      updateNodeData,
      handleGenerateNineGridPlan,
      handleReplanSingleScene,
      handleGenerateSceneImage,
      handleApproveSceneImage,
      handleRejectSceneImage,
      handleReanalyze,
      handleTriggerBatchMissingModal,
      batchState
    ]
  );

  const displayNodes = useMemo(() => {
    return attachNodeHandlers(nodes);
  }, [nodes, attachNodeHandlers]);

  // 1. Initial Hydrate from Server API or LocalStorage
  useEffect(() => {
    let isMounted = true;

    async function hydrateCanvas() {
      setHydrationState('loading');
      setSaveStatus('cloud_loading');

      const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
      const targetCanvasId = `canvas_${targetProjectId}`;
      const localKey = getStorageKey(targetProjectId, targetCanvasId);

      logCanvasDiagnostic({
        projectId: targetProjectId,
        canvasId: targetCanvasId,
        source: 'page_enter_hydration_start',
        localKey
      });

      let serverSuccess = false;

      try {
        const serverCanvas = await canvasService.getCanvas(targetCanvasId);
        if (
          isMounted &&
          serverCanvas &&
          Array.isArray(serverCanvas.nodes_draft || serverCanvas.nodesDraft) &&
          (serverCanvas.nodes_draft || serverCanvas.nodesDraft)!.length > 0
        ) {
          const loadedNodes = serverCanvas.nodes_draft || serverCanvas.nodesDraft || [];
          const loadedEdges = serverCanvas.edges_draft || serverCanvas.edgesDraft || [];
          const loadedViewport = serverCanvas.viewport_draft || serverCanvas.viewportDraft || { x: 0, y: 0, zoom: 1 };

          setNodes(loadedNodes);
          setEdges(loadedEdges);
          setViewport(loadedViewport);

          // Restore uploaded image state if present
          const imgNode = loadedNodes.find((n: any) => n.id === 'img-node-1' || n.type === 'productImageNode');
          if (imgNode?.data?.imageUrl) {
            setUploadedImageUrl(imgNode.data.imageUrl as string);
            if (typeof imgNode.data.imageUrl === 'string' && imgNode.data.imageUrl.startsWith('data:image/')) {
              setUploadedBase64(imgNode.data.imageUrl as string);
            }
          }
          try {
            const rawLocal = localStorage.getItem(localKey) || localStorage.getItem('manwah_canvas_latest');
            if (rawLocal) {
              const localSnapshot = JSON.parse(rawLocal);
              if (localSnapshot?.uploadedBase64 && !uploadedBase64Ref.current) {
                setUploadedBase64(localSnapshot.uploadedBase64);
              }
            }
          } catch (e) {}

          setCurrentRevisionNumber(serverCanvas.current_revision || serverCanvas.currentRevision || 0);
          setLastSavedAt(serverCanvas.last_saved_at || serverCanvas.lastSavedAt || new Date().toISOString());
          setSaveStatus('cloud_saved');

          prevSerializedRef.current = JSON.stringify({
            nodes: loadedNodes,
            edges: loadedEdges,
            viewport: loadedViewport
          });

          hasUserMutationRef.current = false;
          serverSuccess = true;

          logCanvasDiagnostic({
            projectId: targetProjectId,
            canvasId: targetCanvasId,
            storageMode: (serverCanvas as any).storageMedium || 'cloud',
            nodesCount: loadedNodes.length,
            edgesCount: loadedEdges.length,
            source: 'hydrate_from_server_success'
          });
        }
      } catch (err: any) {
        console.warn('Failed to load canvas draft from API, checking local storage:', err);
        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          error: err?.message,
          source: 'hydrate_from_server_failed'
        });
      }

      if (!serverSuccess && isMounted) {
        // Fallback to LocalStorage
        try {
          const raw = localStorage.getItem(localKey) || (targetProjectId !== 'new' ? localStorage.getItem('manwah_canvas_latest') : null);
          if (raw) {
            const snapshot = JSON.parse(raw);
            if (snapshot && Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0) {
              if (snapshot.activeProject) setActiveProject(snapshot.activeProject);
              if (snapshot.activeDna) setActiveDna(snapshot.activeDna);
              if (snapshot.uploadedImageUrl) setUploadedImageUrl(snapshot.uploadedImageUrl);
              if (snapshot.uploadedBase64) setUploadedBase64(snapshot.uploadedBase64);
              if (snapshot.uploadState && snapshot.uploadState !== 'uploading' && snapshot.uploadState !== 'analyzing') {
                setUploadState(snapshot.uploadState);
              } else if (snapshot.uploadedBase64) {
                setUploadState('completed');
              }
              if (snapshot.agentRun) setAgentRun(snapshot.agentRun);
              if (snapshot.messages && Array.isArray(snapshot.messages) && snapshot.messages.length > 0) {
                const seenMsgIds = new Set<string>();
                const sanitizedMsgs = snapshot.messages.map((m: any, idx: number) => {
                  let msgId = m.id || `msg-${idx}`;
                  if (seenMsgIds.has(msgId)) {
                    msgId = `${msgId}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
                  }
                  seenMsgIds.add(msgId);
                  return { ...m, id: msgId };
                });
                setMessages(sanitizedMsgs);
              }
              setEdges(snapshot.edges || []);
              setNodes(snapshot.nodes);
              if (snapshot.viewport) setViewport(snapshot.viewport);
              if (snapshot.selectedNodeId) setSelectedNodeId(snapshot.selectedNodeId);
              if (typeof snapshot.selectedSceneIndex === 'number') setSelectedSceneIndex(snapshot.selectedSceneIndex);

              prevSerializedRef.current = JSON.stringify({
                nodes: snapshot.nodes,
                edges: snapshot.edges || [],
                viewport: snapshot.viewport || { x: 0, y: 0, zoom: 1 }
              });

              hasUserMutationRef.current = false;
              setSaveStatus('local_saved');

              logCanvasDiagnostic({
                projectId: targetProjectId,
                canvasId: targetCanvasId,
                nodesCount: snapshot.nodes.length,
                source: 'hydrate_from_local_storage_fallback'
              });
            } else {
              // Default Canvas Initialization
              setNodes(initialNodes);
              setEdges(initialEdges);
              prevSerializedRef.current = JSON.stringify({
                nodes: initialNodes,
                edges: initialEdges,
                viewport: { x: 0, y: 0, zoom: 1 }
              });
              hasUserMutationRef.current = false;
              setSaveStatus('cloud_saved');

              logCanvasDiagnostic({
                projectId: targetProjectId,
                canvasId: targetCanvasId,
                source: 'default_canvas_initialized_reason',
                reason: 'server_and_local_both_empty'
              });
            }
          } else {
            // Default Canvas Initialization
            setNodes(initialNodes);
            setEdges(initialEdges);
            prevSerializedRef.current = JSON.stringify({
              nodes: initialNodes,
              edges: initialEdges,
              viewport: { x: 0, y: 0, zoom: 1 }
            });
            hasUserMutationRef.current = false;
            setSaveStatus('cloud_saved');

            logCanvasDiagnostic({
              projectId: targetProjectId,
              canvasId: targetCanvasId,
              source: 'default_canvas_initialized_reason',
              reason: 'no_local_snapshot'
            });
          }
        } catch (err: any) {
          console.error('Failed to hydrate canvas workspace state from local:', err);
          setSaveStatus('save_failed');
        }
      }

      if (isMounted) {
        setHydrationState('hydrated');
        setTimeout(() => {
          if (isMounted) {
            setHydrationState('ready');
          }
        }, 100);
      }
    }

    hydrateCanvas();

    return () => {
      isMounted = false;
    };
  }, [workspaceIdParam, getStorageKey, setNodes, setEdges]);

  // Helper to serialize nodes strictly for JSON draft
  const getCleanSerializableNodes = useCallback((rawNodeList: Node[]) => {
    return rawNodeList.map(n => {
      const cleanData: Record<string, any> = {};
      const data = n.data || {};
      for (const k of Object.keys(data)) {
        if (typeof data[k] !== 'function' && !k.startsWith('on')) {
          cleanData[k] = data[k];
        }
      }
      return {
        id: String(n.id),
        type: String(n.type || 'default'),
        position: { x: Number(n.position?.x || 0), y: Number(n.position?.y || 0) },
        width: n.width ? Number(n.width) : undefined,
        height: n.height ? Number(n.height) : undefined,
        data: cleanData
      };
    });
  }, []);

  const getCleanSerializableEdges = useCallback((rawEdgeList: Edge[]) => {
    return rawEdgeList.map(e => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      sourceHandle: e.sourceHandle ? String(e.sourceHandle) : null,
      targetHandle: e.targetHandle ? String(e.targetHandle) : null,
      type: e.type ? String(e.type) : undefined,
      animated: Boolean(e.animated),
      style: e.style
    }));
  }, []);

  // 2. Debounced Auto-Save Draft Effect (1000ms debounce)
  useEffect(() => {
    if (hydrationState !== 'ready' || isRestoringRef.current || !hasUserMutationRef.current) {
      return;
    }

    const cleanNodes = getCleanSerializableNodes(nodes);
    const cleanEdges = getCleanSerializableEdges(edges);

    const serializedPayload = JSON.stringify({
      nodes: cleanNodes,
      edges: cleanEdges,
      viewport
    });

    if (serializedPayload === prevSerializedRef.current) {
      return;
    }

    setSaveStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 1000ms debounce
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
        const targetCanvasId = `canvas_${targetProjectId}`;

        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          source: 'auto_save_triggered',
          nodesCount: cleanNodes.length,
          edgesCount: cleanEdges.length
        });

        // Save to Server Draft API
        const res = await canvasService.saveCanvasDraft(targetCanvasId, {
          nodesDraft: cleanNodes,
          edgesDraft: cleanEdges,
          viewportDraft: viewport,
          hasExplicitUserClear: hasExplicitUserClearRef.current
        });

        // Backup to LocalStorage
        const localKey = getStorageKey(targetProjectId, targetCanvasId);
        let localSuccess = false;
        try {
          const localSnapshot = {
            version: 1,
            updatedAt: res.lastSavedAt,
            projectId: targetProjectId,
            canvasId: targetCanvasId,
            activeProject: activeProjectRef.current,
            activeDna,
            uploadedImageUrl,
            uploadedBase64: uploadedBase64Ref.current,
            uploadState,
            agentRun,
            messages,
            nodes: cleanNodes,
            edges: cleanEdges,
            viewport
          };
          localStorage.setItem(localKey, JSON.stringify(localSnapshot));
          localStorage.setItem('manwah_canvas_latest', JSON.stringify(localSnapshot));
          localSuccess = true;
        } catch (e) {
          console.warn('LocalStorage draft backup skipped or full:', e);
        }

        prevSerializedRef.current = serializedPayload;
        hasExplicitUserClearRef.current = false;

        if (res.storageMedium === 'cloud') {
          setSaveStatus('cloud_saved');
        } else if (localSuccess) {
          setSaveStatus('local_saved');
        } else {
          setSaveStatus('memory_only');
        }

        setLastSavedAt(res.lastSavedAt);
      } catch (err: any) {
        console.error('Canvas auto-save to server failed:', err);
        if (err?.code === 'CANVAS_STALE_OR_SUSPICIOUS_OVERWRITE' || err?.message?.includes('CANVAS_STALE_OR_SUSPICIOUS_OVERWRITE')) {
          setSaveStatus('version_conflict');
          setErrorMessage('检测到云端画布包含完整规划，已阻止异常覆盖。');
        } else {
          // Try fallback to LocalStorage
          try {
            const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
            const targetCanvasId = `canvas_${targetProjectId}`;
            const localKey = getStorageKey(targetProjectId, targetCanvasId);
            const localSnapshot = {
              version: 1,
              updatedAt: new Date().toISOString(),
              projectId: targetProjectId,
              canvasId: targetCanvasId,
              nodes: cleanNodes,
              edges: cleanEdges,
              viewport
            };
            localStorage.setItem(localKey, JSON.stringify(localSnapshot));
            setSaveStatus('local_saved');
            setLastSavedAt(localSnapshot.updatedAt);
          } catch (e) {
            setSaveStatus('save_failed');
          }
        }
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    hydrationState,
    nodes,
    edges,
    viewport,
    messages,
    activeDna,
    agentRun,
    uploadState,
    uploadedImageUrl,
    workspaceIdParam,
    getCleanSerializableNodes,
    getCleanSerializableEdges,
    getStorageKey
  ]);

  // 3. Manual Action: Save Immutable Revision
  const handleSaveVersion = useCallback(async (versionName: string, changeSummary: string = '', versionTag: string = '正式版') => {
    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = `canvas_${targetProjectId}`;

    const cleanNodes = getCleanSerializableNodes(nodes);
    const cleanEdges = getCleanSerializableEdges(edges);

    const revision = await canvasService.createCanvasRevision(targetCanvasId, {
      versionName,
      changeSummary,
      versionTag,
      nodesSnapshot: cleanNodes,
      edgesSnapshot: cleanEdges,
      viewportSnapshot: viewport
    });

    const revNum = revision.revision_number || revision.revisionNumber || currentRevisionNumber + 1;
    setCurrentRevisionNumber(revNum);
    setSaveStatus(revision.storageMedium === 'cloud' ? 'cloud_saved' : 'local_saved');
    setLastSavedAt(revision.created_at || revision.createdAt || new Date().toISOString());
    return revision;
  }, [nodes, edges, viewport, workspaceIdParam, currentRevisionNumber, getCleanSerializableNodes, getCleanSerializableEdges]);

  // 4. Manual Action: Restore Working Draft from Immutable Revision Snapshot
  const handleRestoreRevision = useCallback(async (revisionId: string) => {
    isRestoringRef.current = true;
    hasUserMutationRef.current = false;

    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = `canvas_${targetProjectId}`;

    try {
      logCanvasDiagnostic({
        projectId: targetProjectId,
        canvasId: targetCanvasId,
        revisionId,
        source: 'handle_restore_revision_start'
      });

      const restored = await canvasService.restoreCanvasFromRevision(targetCanvasId, revisionId);

      const parseJson = (val: any, fallback: any) => {
        if (!val) return fallback;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch (e) { return fallback; }
        }
        return val;
      };

      const restoredNodes = parseJson(restored?.nodes, []);
      const restoredEdges = parseJson(restored?.edges, []);
      const restoredViewport = parseJson(restored?.viewport, { x: 0, y: 0, zoom: 1 });

      if (Array.isArray(restoredNodes) && restoredNodes.length > 0) {
        const cleanNodes = getCleanSerializableNodes(restoredNodes as any);
        const cleanEdges = getCleanSerializableEdges(restoredEdges as any);

        setNodes(cleanNodes as any);
        setEdges(cleanEdges as any);
        if (restoredViewport) {
          setViewport(restoredViewport);
        }

        const localKey = getStorageKey(targetProjectId, targetCanvasId);
        const localSnapshot = {
          version: 1,
          updatedAt: new Date().toISOString(),
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          nodes: cleanNodes,
          edges: cleanEdges,
          viewport: restoredViewport
        };

        try {
          localStorage.setItem(localKey, JSON.stringify(localSnapshot));
          localStorage.setItem('manwah_canvas_latest', JSON.stringify(localSnapshot));
        } catch (e) {}

        prevSerializedRef.current = JSON.stringify({
          nodes: cleanNodes,
          edges: cleanEdges,
          viewport: restoredViewport
        });

        setSaveStatus(restored.storageMedium === 'cloud' ? 'cloud_saved' : 'local_saved');
        setLastSavedAt(new Date().toISOString());

        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          revisionId,
          nodesCount: cleanNodes.length,
          edgesCount: cleanEdges.length,
          snapshotChecksum: restored.snapshotChecksum,
          source: 'handle_restore_revision_success'
        });
      } else {
        throw new Error('恢复的历史版本未包含有效的节点数据');
      }
    } catch (err: any) {
      console.error('Failed to restore revision:', err);
      setSaveStatus('restore_failed');
      throw err;
    } finally {
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 300);
    }
  }, [workspaceIdParam, setNodes, setEdges, getCleanSerializableNodes, getCleanSerializableEdges, getStorageKey]);

  const clearCanvasWorkspace = useCallback(async () => {
    hasExplicitUserClearRef.current = true;
    hasUserMutationRef.current = true;

    const newProjectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newCanvasId = `canvas_${newProjectId}`;

    const newProjectObj: CreativeProject = {
      id: newProjectId,
      owner_id: userId,
      name: '新建立体视觉企划案',
      project_type: 'detail_page',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setActiveProject(newProjectObj);
    setActiveDna(null);
    setUploadedImageUrl(null);
    setUploadedBase64(null);
    setUploadState('idle');
    setAgentRun(null);
    setSelectedNodeId(null);
    setSelectedSceneIndex(null);

    const defaultWelcomeMessage: AgentMessage = {
      id: `msg-${Date.now()}-welcome`,
      sender: 'agent',
      text: '你好！我是视觉企划智能体。请上传产品主角图，我将自动提取造型、色彩、材质与结构 DNA 并同步至左侧画布。',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([defaultWelcomeMessage]);

    setNodes(initialNodes);
    setEdges(initialEdges);
    setViewport({ x: 0, y: 0, zoom: 1 });

    const localKey = getStorageKey(activeProject?.id || '', workspaceIdParam || '');
    if (localKey) localStorage.removeItem(localKey);
    localStorage.removeItem('manwah_canvas_latest');

    try {
      await canvasService.saveCanvasDraft(newCanvasId, {
        nodesDraft: initialNodes as any,
        edgesDraft: [],
        viewportDraft: { x: 0, y: 0, zoom: 1 },
        canvasName: '新建立体视觉企划案',
        hasExplicitUserClear: true
      });
      setSaveStatus('cloud_saved');
    } catch (err) {
      console.warn('Failed to save fresh draft to server:', err);
      setSaveStatus('local_saved');
    }

    return newProjectId;
  }, [getStorageKey, activeProject, workspaceIdParam, setNodes, setEdges]);

  return {
    nodes: displayNodes,
    rawNodes: nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    uploadState,
    errorMessage,
    messages,
    activeDna,
    showFullDnaDrawer,
    setShowFullDnaDrawer,
    handleUploadFile,
    handleRemoveProductImage,
    handleReanalyze,
    addUserMessage,
    addAgentMessage,
    clearCanvasWorkspace,

    // C2 Exports
    agentRun,
    isPlanGenerating,
    planError,
    selectedNodeId,
    selectedSceneIndex,
    setSelectedNodeId,
    setSelectedSceneIndex,
    onSelectSceneIndex: handleSelectSceneIndex,
    handleGenerateNineGridPlan,
    handleReplanSingleScene,
    handleNodeClick,

    // C4B-1 DNA Version Exports
    dnaCode,
    productDnaVersionCode,
    productDnaVersionId,
    dnaVersions,
    onSelectDnaVersion: handleSelectDnaVersion,

    // C3A Exports
    selectedModel,
    setSelectedModel,
    selectedResolution,
    setSelectedResolution,
    generatingScenes: generatingScenesRef.current,
    handleGenerateSceneImage,
    handleApproveSceneImage,
    handleRejectSceneImage,

    // C3B Exports
    batchState,
    queueItems,
    showBatchConfirmModal,
    setShowBatchConfirmModal,
    batchConfirmInfo,
    handleTriggerBatchMissingModal,
    handleStartBatchGeneration,
    handlePauseBatch,
    handleResumeBatch,
    handleCancelBatch,
    handleRetryFailedBatch,

    // C4-Edit Exports
    selectAllNodes,
    clearSelection,
    deleteSelectedNodes,
    deleteNodeById,
    duplicateSelectedNodes,
    duplicateNodeById,
    addCustomNode,
    updateNodeData,

    // C4A-1 Exports
    saveStatus,
    lastSavedAt,
    currentRevisionNumber,
    showSaveVersionModal,
    setShowSaveVersionModal,
    showHistoryModal,
    setShowHistoryModal,
    handleSaveVersion,
    handleRestoreRevision,
    viewport,
    setViewport,
    canvasId: `canvas_${activeProject?.id || activeProjectRef.current?.id || workspaceIdParam || 'latest'}`
  };
}
