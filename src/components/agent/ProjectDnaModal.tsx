import React, { useState, useEffect } from 'react';
import { CreativeProject, ProductVisualDNA, ProjectAsset, AgentRun, DetailPageTaskBatch, DetailPageCanvasConfig, DetailPageExportResult } from '../../types';
import { ProductDnaCard } from './ProductDnaCard';
import { PlanConfirmation } from './PlanConfirmation';
import { RenderingQueue } from './RenderingQueue';
import { DetailPageCanvasExport } from './DetailPageCanvasExport';
import { X, Plus, Folder, Sparkles, Upload, FileImage, ArrowRight, CheckCircle2, LayoutGrid } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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

interface ProjectDnaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProjectAndDna?: (project: CreativeProject, dna: ProductVisualDNA, assets?: ProjectAsset[]) => void;
}

export const ProjectDnaModal: React.FC<ProjectDnaModalProps> = ({
  isOpen,
  onClose,
  onSelectProjectAndDna
}) => {
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [activeProject, setActiveProject] = useState<CreativeProject | null>(null);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [productDna, setProductDna] = useState<ProductVisualDNA | null>(null);
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [taskBatch, setTaskBatch] = useState<DetailPageTaskBatch | null>(null);
  const [isExecutingAll, setIsExecutingAll] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [uploadedBase64List, setUploadedBase64List] = useState<string[]>([]);

  // Fetch projects on load
  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/projects', {
        headers: { ...authHeaders }
      });
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects || []);
        if (data.projects?.length > 0 && !activeProject) {
          selectProject(data.projects[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectProject = async (project: CreativeProject) => {
    setActiveProject(project);
    setProductDna(null);
    setAssets([]);
    setUploadedBase64List([]);

    try {
      setLoading(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/projects/${project.id}`, {
        headers: { ...authHeaders }
      });
      const data = await res.json();
      if (data.success) {
        setAssets(data.assets || []);
        setProductDna(data.productDna || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      setIsCreatingProject(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          name: newProjectName.trim(),
          project_type: 'detail_page'
        })
      });
      const data = await res.json();
      if (data.success) {
        setProjects(prev => [data.project, ...prev]);
        setNewProjectName('');
        selectProject(data.project);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newBase64s: string[] = [];
    let readCount = 0;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const b64 = event.target?.result as string;
        if (b64) {
          newBase64s.push(b64);
          // Persist to server assets
          if (activeProject) {
            try {
              const authHeaders = await getAuthHeaders();
              await fetch(`/api/projects/${activeProject.id}/assets`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...authHeaders
                },
                body: JSON.stringify({
                  asset_type: 'product_photo',
                  storage_path: b64,
                  mime_type: file.type || 'image/jpeg'
                })
              });
            } catch (e) {
              console.error(e);
            }
          }
        }
        readCount++;
        if (readCount === files.length) {
          setUploadedBase64List(prev => [...prev, ...newBase64s]);
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleExtractDna = async () => {
    if (!activeProject || uploadedBase64List.length === 0) return;
    try {
      setExtracting(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/projects/${activeProject.id}/product-dna/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          imageBase64List: uploadedBase64List
        })
      });
      const data = await res.json();
      if (data.success) {
        setProductDna(data.productDna);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExtracting(false);
    }
  };

  const handleUpdateDna = async (updatedFields: Partial<ProductVisualDNA>) => {
    if (!activeProject) return;
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/projects/${activeProject.id}/product-dna`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(updatedFields)
    });
    const data = await res.json();
    if (data.success) {
      setProductDna(data.productDna);
    }
  };

  const handleConfirmDna = async () => {
    if (!activeProject) return;
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/projects/${activeProject.id}/product-dna/confirm`, {
      method: 'POST',
      headers: {
        ...authHeaders
      }
    });
    const data = await res.json();
    if (data.success) {
      setProductDna(data.productDna);
      if (onSelectProjectAndDna) {
        onSelectProjectAndDna(activeProject, data.productDna, assets);
      }
      // Auto trigger agent run plan creation
      await triggerAgentRunPlan(activeProject.id);
    }
  };

  const triggerAgentRunPlan = async (projectId: string, promptHint = '') => {
    try {
      setGeneratingPlan(true);
      const authHeaders = await getAuthHeaders();
      let currentRunId = agentRun?.id;

      if (!currentRunId) {
        const createRes = await fetch('/api/agent-runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({ projectId })
        });
        const createData = await createRes.json();
        if (createData.success) {
          currentRunId = createData.agentRun.id;
          setAgentRun(createData.agentRun);
        }
      }

      if (currentRunId) {
        const planRes = await fetch(`/api/agent-runs/${currentRunId}/generate-plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({ promptHint })
        });
        const planData = await planRes.json();
        if (planData.success) {
          setAgentRun(planData.agentRun);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!agentRun) return;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent-runs/${agentRun.id}/approve-plan`, {
        method: 'POST',
        headers: {
          ...authHeaders
        }
      });
      const data = await res.json();
      if (data.success) {
        setAgentRun(data.agentRun);
        // Auto initialize Phase 4 tasks upon plan approval
        await handleInitTasks(data.agentRun.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleInitTasks = async (runId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent-runs/${runId}/tasks/generate`, {
        method: 'POST',
        headers: {
          ...authHeaders
        }
      });
      const data = await res.json();
      if (data.success) {
        setTaskBatch(data.batch);
        if (data.agentRun) setAgentRun(data.agentRun);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExecuteTask = async (taskId: string) => {
    if (!agentRun) return;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent-runs/${agentRun.id}/tasks/${taskId}/execute`, {
        method: 'POST',
        headers: {
          ...authHeaders
        }
      });
      const data = await res.json();
      if (data.success) {
        // Refresh batch tasks
        await fetchTaskBatch(agentRun.id);
        if (data.agentRun) setAgentRun(data.agentRun);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExecuteAll = async () => {
    if (!agentRun) return;
    try {
      setIsExecutingAll(true);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent-runs/${agentRun.id}/tasks/execute-all`, {
        method: 'POST',
        headers: {
          ...authHeaders
        }
      });
      const data = await res.json();
      if (data.success) {
        setTaskBatch(data.batch);
        if (data.agentRun) setAgentRun(data.agentRun);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExecutingAll(false);
    }
  };

  const handleRetryTask = async (taskId: string, customPrompt?: string) => {
    if (!agentRun) return;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent-runs/${agentRun.id}/tasks/${taskId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ customPrompt })
      });
      const data = await res.json();
      if (data.success) {
        await fetchTaskBatch(agentRun.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTaskBatch = async (runId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent-runs/${runId}/tasks`, {
        headers: {
          ...authHeaders
        }
      });
      const data = await res.json();
      if (data.success) {
        setTaskBatch(data.batch);
      }
    } catch (e) {
      console.error(e);
    }
  };


  const handleExportCanvas = async (config: DetailPageCanvasConfig): Promise<DetailPageExportResult | null> => {
    if (!agentRun) return null;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent-runs/${agentRun.id}/export-canvas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ config })
      });
      const data = await res.json();
      if (data.success) {
        return data.exportResult;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold">企划项目与产品 DNA 工作室</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-800 rounded-lg transition text-stone-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3">
          {/* Left Panel: Project List */}
          <div className="border-r border-stone-200 bg-stone-50 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500 flex items-center gap-1">
                <Folder className="w-4 h-4 text-stone-600" /> 企划项目
              </span>
            </div>

            {/* Create Project Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="新建企划名称..."
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg flex-1 focus:outline-none focus:ring-1 focus:ring-stone-800"
              />
              <button
                onClick={handleCreateProject}
                disabled={isCreatingProject || !newProjectName.trim()}
                className="bg-stone-900 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-stone-800 transition font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Project List Items */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {projects.map(p => {
                const isSelected = activeProject?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => selectProject(p)}
                    className={`w-full text-left p-3 rounded-xl transition text-xs border ${
                      isSelected
                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                        : 'bg-white text-stone-800 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="font-bold truncate">{p.name}</div>
                    <div className={`text-[10px] mt-1 ${isSelected ? 'text-stone-400' : 'text-stone-500'}`}>
                      {new Date(p.created_at).toLocaleDateString()} · 详情页企划
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Project DNA & Assets Workspace */}
          <div className="md:col-span-2 p-5 overflow-y-auto space-y-6">
            {activeProject ? (
              <>
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="font-bold text-stone-900 text-base">{activeProject.name}</h3>
                    <p className="text-xs text-stone-500">上传多视角产品图，AI 自动提炼不可篡改的产品视觉 DNA</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/creative-canvas/${activeProject.id}`}
                      className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> 打开项目视觉画布
                    </a>

                    {productDna?.confirmed_at && (
                      <button
                        onClick={() => onSelectProjectAndDna && onSelectProjectAndDna(activeProject, productDna, assets)}
                        className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow"
                      >
                        进入 9 屏策划 <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Upload Photos section */}
                <div className="bg-stone-50 border border-dashed border-stone-300 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                      <FileImage className="w-4 h-4 text-stone-500" /> 上传产品素材照片 ({uploadedBase64List.length} 张)
                    </span>
                    <label className="cursor-pointer bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 shadow-sm">
                      <Upload className="w-3.5 h-3.5 text-stone-500" /> 选择图片
                      <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  {/* Thumbnail gallery */}
                  {uploadedBase64List.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {uploadedBase64List.map((img, idx) => (
                        <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 relative group bg-white">
                          <img src={img} alt="Product" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Extract Button */}
                  {uploadedBase64List.length > 0 && !productDna && (
                    <div className="pt-2">
                      <button
                        onClick={handleExtractDna}
                        disabled={extracting}
                        className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-bold text-xs py-2.5 rounded-lg transition shadow flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" /> {extracting ? 'AI 正在深度深度识别与提取 DNA...' : '一键提取产品视觉 DNA'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Product DNA Card */}
                {productDna ? (
                  <div className="space-y-6">
                    <ProductDnaCard
                      dna={productDna}
                      onUpdate={handleUpdateDna}
                      onConfirm={handleConfirmDna}
                      onReExtract={handleExtractDna}
                      isLoading={extracting}
                    />

                    {/* Phase 3 Plan Confirmation Section */}
                    {productDna.confirmed_at && (
                      <div className="pt-4 border-t border-stone-200 space-y-6">
                        {agentRun?.plan ? (
                          <PlanConfirmation
                            plan={agentRun.plan}
                            onApprovePlan={handleApprovePlan}
                            onRegeneratePlan={(hint) => triggerAgentRunPlan(activeProject.id, hint)}
                            isGenerating={generatingPlan}
                          />
                        ) : (
                          <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center space-y-3">
                            <p className="text-xs text-stone-600 font-medium">
                              DNA 已锁定。点击下方按钮，启动 AI Agent 智能规划 9 屏爆款详情页全案。
                            </p>
                            <button
                              onClick={() => triggerAgentRunPlan(activeProject.id)}
                              disabled={generatingPlan}
                              className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-5 py-2.5 rounded-xl transition shadow flex items-center gap-2 mx-auto"
                            >
                              <Sparkles className="w-4 h-4" />
                              {generatingPlan ? 'Agent 正在策划 9 屏视觉方案...' : '一键生成 9 屏详情页全案'}
                            </button>
                          </div>
                        )}

                        {/* Phase 4 Image Generation Queue */}
                        {taskBatch && (
                          <RenderingQueue
                            batch={taskBatch}
                            onExecuteTask={handleExecuteTask}
                            onExecuteAll={handleExecuteAll}
                            onRetryTask={handleRetryTask}
                            isExecutingAll={isExecutingAll}
                          />
                        )}

                        {/* Phase 5 Long Image Stitching, Typography & Export */}
                        {agentRun && taskBatch && taskBatch.completedTasks > 0 && (
                          <DetailPageCanvasExport
                            runId={agentRun.id}
                            onExportCanvas={handleExportCanvas}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-10 border border-stone-100 rounded-xl bg-stone-50/50">
                    <p className="text-stone-400 text-xs">请先上传产品图片，然后点击“一键提取产品视觉 DNA”</p>
                  </div>
                )}

              </>
            ) : (
              <div className="text-center py-20 text-stone-400 text-xs">
                请在左侧选择或新建一个企划项目
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
