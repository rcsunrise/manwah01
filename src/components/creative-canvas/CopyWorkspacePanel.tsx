import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Sparkles,
  Edit3,
  History,
  Save,
  RotateCw,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  ChevronRight,
  Info,
  Clock,
  Dna,
  Layers,
  ArrowLeft
} from 'lucide-react';
import { StructuredCopyContent, CopySkuRecord, CopyVersionRecord } from '../../types/creativeCanvas';
import { supabase } from '../../lib/supabase';

interface CopyWorkspacePanelProps {
  projectId: string;
  canvasId: string;
  sceneIndex: number;
  sceneTitle?: string;
  coreSellingPoint?: string;
  visualComposition?: string;
  productDnaVersionId?: string;
  assetVersionId?: string;
}

export const CopyWorkspacePanel: React.FC<CopyWorkspacePanelProps> = ({
  projectId,
  canvasId,
  sceneIndex,
  sceneTitle,
  coreSellingPoint,
  visualComposition,
  productDnaVersionId,
  assetVersionId
}) => {
  const sceneKey = `scene-${String(sceneIndex).padStart(2, '0')}`;

  const [copySku, setCopySku] = useState<CopySkuRecord | null>(null);
  const [currentVersion, setCurrentVersion] = useState<CopyVersionRecord | null>(null);
  const [historyVersions, setHistoryVersions] = useState<CopyVersionRecord[]>([]);

  const [mode, setMode] = useState<'view' | 'edit' | 'history'>('view');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit form state
  const [editContent, setEditContent] = useState<StructuredCopyContent>({
    eyebrow: '',
    headline: '',
    subheadline: '',
    body: '',
    sellingPoints: [],
    featureLabels: [],
    specs: [],
    cta: '',
    disclaimer: ''
  });

  // Temporary inputs for lists in edit mode
  const [newSellingPoint, setNewSellingPoint] = useState('');
  const [newFeatureLabel, setNewFeatureLabel] = useState('');
  const [newSpecLabel, setNewSpecLabel] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');

  // Fetch Copy SKU and Active Version on scene change or component mount
  const fetchCopySku = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: any = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // First create or get SKU
      const res = await fetch('/api/copy-skus', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          canvasId,
          sceneKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.copySku) {
          setCopySku(data.copySku);
          if (data.currentVersion) {
            setCurrentVersion(data.currentVersion);
            setEditContent(data.currentVersion.content_json);
          } else {
            setCurrentVersion(null);
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson?.error?.message || '获取 Copy SKU 失败');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '网络连接异常');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistoryVersions = async (skuId: string) => {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: any = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/copy-skus/${skuId}/versions`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.versions) {
          setHistoryVersions(data.versions);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (projectId && canvasId && sceneKey) {
      fetchCopySku();
    }
  }, [projectId, canvasId, sceneIndex]);

  // Handle AI Generate Copy (First or Re-generate)
  const handleAIGenerate = async (customPromptStr?: string) => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: any = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/copy/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          canvasId,
          sceneKey,
          sceneTitle,
          coreSellingPoint,
          visualComposition,
          productDnaVersionId,
          assetVersionId,
          customPrompt: customPromptStr || ''
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.copySku) setCopySku(data.copySku);
        if (data.currentVersion) {
          setCurrentVersion(data.currentVersion);
          setEditContent(data.currentVersion.content_json);
          setMode('view');
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson?.error?.message || 'AI 生成文案失败');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'AI 生成网络请求失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Save Manual Edits as New Version
  const handleSaveManualEdit = async () => {
    if (!copySku) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: any = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/copy-skus/${copySku.id}/versions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parentVersionId: currentVersion?.id || null,
          productDnaVersionId,
          assetVersionId,
          contentJson: editContent,
          sourceType: 'manual_edit'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.copySku) setCopySku(data.copySku);
        if (data.version) {
          setCurrentVersion(data.version);
          setMode('view');
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson?.error?.message || '保存文案版本失败');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '保存网络请求异常');
    } finally {
      setIsSaving(false);
    }
  };

  // Switch Active Version
  const handleSelectVersion = async (versionId: string) => {
    if (!copySku) return;
    setIsLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: any = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/copy-skus/${copySku.id}/select-version`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ versionId })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.copySku) setCopySku(data.copySku);
        if (data.activeVersion) {
          setCurrentVersion(data.activeVersion);
          setEditContent(data.activeVersion.content_json);
          setMode('view');
        }
      }
    } catch (e) {
    } finally {
      setIsLoading(false);
    }
  };

  // Edit list helpers
  const addSellingPoint = () => {
    if (newSellingPoint.trim()) {
      setEditContent(prev => ({
        ...prev,
        sellingPoints: [...prev.sellingPoints, newSellingPoint.trim()]
      }));
      setNewSellingPoint('');
    }
  };

  const removeSellingPoint = (idx: number) => {
    setEditContent(prev => ({
      ...prev,
      sellingPoints: prev.sellingPoints.filter((_, i) => i !== idx)
    }));
  };

  const addFeatureLabel = () => {
    if (newFeatureLabel.trim()) {
      setEditContent(prev => ({
        ...prev,
        featureLabels: [...prev.featureLabels, newFeatureLabel.trim()]
      }));
      setNewFeatureLabel('');
    }
  };

  const removeFeatureLabel = (idx: number) => {
    setEditContent(prev => ({
      ...prev,
      featureLabels: prev.featureLabels.filter((_, i) => i !== idx)
    }));
  };

  const addSpec = () => {
    if (newSpecLabel.trim() || newSpecValue.trim()) {
      setEditContent(prev => ({
        ...prev,
        specs: [...prev.specs, { label: newSpecLabel.trim(), value: newSpecValue.trim() }]
      }));
      setNewSpecLabel('');
      setNewSpecValue('');
    }
  };

  const removeSpec = (idx: number) => {
    setEditContent(prev => ({
      ...prev,
      specs: prev.specs.filter((_, i) => i !== idx)
    }));
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center space-y-3 bg-white rounded-2xl border border-[#E5E0D8]">
        <Loader2 className="w-6 h-6 text-[#B28C5A] animate-spin mx-auto" />
        <p className="text-xs text-stone-500 font-bold">正在加载场景文案数据 (scene-0{sceneIndex})...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Info Card */}
      <div className="p-3.5 bg-white rounded-2xl border border-[#E5E0D8] space-y-2 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#B28C5A]" />
            <span className="font-bold text-xs text-[#2C2A29]">
              Scene-0{sceneIndex} 文案 SKU (Copy SKU)
            </span>
          </div>
          {currentVersion ? (
            <span className="text-[10px] font-mono font-bold bg-[#B28C5A]/10 text-[#8C6F43] px-2 py-0.5 rounded-full border border-[#B28C5A]/20">
              {currentVersion.version_code}
            </span>
          ) : (
            <span className="text-[10px] text-stone-400 font-mono bg-stone-100 px-2 py-0.5 rounded-full">
              未生成
            </span>
          )}
        </div>

        <div className="space-y-1 text-xs font-mono text-stone-600">
          <div className="flex justify-between">
            <span className="text-stone-400">Copy SKU Code:</span>
            <span className="font-bold text-[#2C2A29] truncate max-w-[180px]">
              {copySku?.sku_code || `COPY-SKU-SCENE${sceneIndex}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-400">来源类型:</span>
            <span className="font-bold text-[#2C2A29]">
              {currentVersion?.source_type === 'ai_generated' ? '✨ AI 智能生成' : currentVersion?.source_type === 'manual_edit' ? '✏️ 人工二次编辑' : '无'}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-stone-400">绑定 DNA Version:</span>
            <span className="text-stone-600 font-bold">{productDnaVersionId || 'DNA-V001'}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-stone-400">绑定 Asset Version:</span>
            <span className="text-stone-600 font-bold">{assetVersionId || '无'}</span>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2">
          <Info className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Mode Switcher / View Controls */}
      {currentVersion && mode === 'view' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAIGenerate()}
            disabled={isGenerating}
            className="flex-1 py-2 px-3 bg-[#B28C5A] hover:bg-[#8C6F43] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>AI 生成中...</span>
              </>
            ) : (
              <>
                <RotateCw className="w-3.5 h-3.5" />
                <span>AI 重新生成子版本</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setEditContent(currentVersion.content_json);
              setMode('edit');
            }}
            className="py-2 px-3 bg-white hover:bg-[#FAF8F5] text-stone-700 border border-[#E5E0D8] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#B28C5A]" />
            <span>人工编辑</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (copySku) fetchHistoryVersions(copySku.id);
              setMode('history');
            }}
            className="py-2 px-3 bg-white hover:bg-[#FAF8F5] text-stone-700 border border-[#E5E0D8] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
          >
            <History className="w-3.5 h-3.5 text-[#B28C5A]" />
            <span>版本历史</span>
          </button>
        </div>
      )}

      {/* 1. Empty State (No Copy Version) */}
      {!currentVersion && mode === 'view' && (
        <div className="p-6 bg-white rounded-2xl border border-[#E5E0D8] text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center mx-auto border border-[#E5E0D8]">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-serif font-bold text-sm text-[#2C2A29]">场景文案尚未生成</h3>
          <p className="text-xs text-stone-500 leading-relaxed font-medium">
            针对 第 {sceneIndex} 屏【{sceneTitle || '分镜画面'}】生成结构化文案 (COPY-V001)
          </p>

          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={() => handleAIGenerate()}
              disabled={isGenerating}
              className="w-full py-2.5 px-4 bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在调阅 DNA 极速生成文案...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>AI 首次生成文案 (创建 COPY-V001)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditContent({
                  eyebrow: `MINHUA · SCENE-0${sceneIndex}`,
                  headline: sceneTitle || '',
                  subheadline: coreSellingPoint || '',
                  body: '',
                  sellingPoints: [],
                  featureLabels: [],
                  specs: [],
                  cta: '立即开启奢享体验',
                  disclaimer: ''
                });
                setMode('edit');
              }}
              className="w-full py-2 bg-white hover:bg-stone-50 text-stone-700 border border-[#E5E0D8] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#B28C5A]" />
              <span>手动编辑新建文案</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Existing Copy View Mode */}
      {currentVersion && mode === 'view' && (
        <div className="space-y-3">
          {/* Eyebrow & Headline Card */}
          <div className="p-3.5 bg-white rounded-2xl border border-[#E5E0D8] space-y-2 shadow-xs">
            <span className="text-[10px] font-bold text-[#B28C5A] uppercase tracking-wider block font-mono">
              {currentVersion.content_json.eyebrow || `MINHUA · SCENE-0${sceneIndex}`}
            </span>
            <h3 className="font-serif font-bold text-base text-[#2C2A29] leading-snug">
              {currentVersion.content_json.headline || '主标题文案'}
            </h3>
            {currentVersion.content_json.subheadline && (
              <p className="text-xs font-medium text-stone-600">
                {currentVersion.content_json.subheadline}
              </p>
            )}
          </div>

          {/* Body Card */}
          {currentVersion.content_json.body && (
            <div className="p-3.5 bg-white rounded-2xl border border-[#E5E0D8] space-y-1 shadow-xs">
              <span className="text-[10px] font-bold text-stone-400 block">正文描述 (Body)</span>
              <p className="text-xs text-stone-700 leading-relaxed font-normal whitespace-pre-line">
                {currentVersion.content_json.body}
              </p>
            </div>
          )}

          {/* Selling Points */}
          {currentVersion.content_json.sellingPoints?.length > 0 && (
            <div className="p-3.5 bg-white rounded-2xl border border-[#E5E0D8] space-y-1.5 shadow-xs">
              <span className="text-[10px] font-bold text-stone-400 block">核心卖点 (Selling Points)</span>
              <div className="space-y-1">
                {currentVersion.content_json.sellingPoints.map((sp, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-xs text-stone-800 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B28C5A] shrink-0 mt-1.5" />
                    <span>{sp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feature Labels & CTA */}
          <div className="grid grid-cols-2 gap-2">
            {currentVersion.content_json.featureLabels?.length > 0 && (
              <div className="p-3 bg-white rounded-2xl border border-[#E5E0D8] space-y-1">
                <span className="text-[10px] font-bold text-stone-400 block">特性标签</span>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {currentVersion.content_json.featureLabels.map((lbl, idx) => (
                    <span key={idx} className="text-[10px] font-bold bg-[#F9F5EF] text-[#B28C5A] px-2 py-0.5 rounded-md border border-[#E5E0D8]">
                      {lbl}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {currentVersion.content_json.cta && (
              <div className="p-3 bg-white rounded-2xl border border-[#E5E0D8] space-y-1 flex flex-col justify-center text-center">
                <span className="text-[10px] font-bold text-stone-400 block">行动号召 (CTA)</span>
                <span className="text-xs font-bold text-[#2C2A29] bg-[#F9F5EF] py-1 px-2 rounded-xl border border-[#B28C5A]/30">
                  {currentVersion.content_json.cta}
                </span>
              </div>
            )}
          </div>

          {/* Specs */}
          {currentVersion.content_json.specs?.length > 0 && (
            <div className="p-3.5 bg-white rounded-2xl border border-[#E5E0D8] space-y-1.5 shadow-xs">
              <span className="text-[10px] font-bold text-stone-400 block">规格参数 (Specs)</span>
              <div className="grid grid-cols-1 gap-1 font-mono text-xs">
                {currentVersion.content_json.specs.map((s, idx) => (
                  <div key={idx} className="flex justify-between py-1 border-b border-[#E5E0D8]/50 last:border-0">
                    <span className="text-stone-500">{s.label}:</span>
                    <span className="font-bold text-[#2C2A29]">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          {currentVersion.content_json.disclaimer && (
            <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8] text-[10px] text-stone-500 leading-relaxed font-mono">
              {currentVersion.content_json.disclaimer}
            </div>
          )}
        </div>
      )}

      {/* 3. Edit Mode */}
      {mode === 'edit' && (
        <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <span className="font-bold text-xs text-[#2C2A29] flex items-center gap-1.5">
              <Edit3 className="w-4 h-4 text-[#B28C5A]" />
              编辑场景文案 (提交将创建新 Version)
            </span>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="text-xs text-stone-500 hover:text-stone-800 font-bold"
            >
              取消
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* Eyebrow */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">眉题 / 系列标识 (eyebrow)</label>
              <input
                type="text"
                value={editContent.eyebrow}
                onChange={e => setEditContent({ ...editContent, eyebrow: e.target.value })}
                className="w-full p-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs font-mono outline-none focus:border-[#B28C5A]"
                placeholder="例如: MANWAH LUXURY SERIES"
              />
            </div>

            {/* Headline */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">主标题 / 核心爆款卖点 (headline)</label>
              <input
                type="text"
                value={editContent.headline}
                onChange={e => setEditContent({ ...editContent, headline: e.target.value })}
                className="w-full p-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs font-bold outline-none focus:border-[#B28C5A]"
                placeholder="例如: 头层真皮包裹 · 尊享云端坐感"
              />
            </div>

            {/* Subheadline */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">副标题 / 补充利益点 (subheadline)</label>
              <input
                type="text"
                value={editContent.subheadline}
                onChange={e => setEditContent({ ...editContent, subheadline: e.target.value })}
                className="w-full p-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs outline-none focus:border-[#B28C5A]"
                placeholder="例如: 110°-160°无级电动调节，沉浸式放松体验"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">正文长文案 (body)</label>
              <textarea
                value={editContent.body}
                onChange={e => setEditContent({ ...editContent, body: e.target.value })}
                rows={4}
                className="w-full p-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs outline-none focus:border-[#B28C5A] resize-none"
                placeholder="描述场景故事与用户痛点..."
              />
            </div>

            {/* Selling Points */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">核心卖点列表 (sellingPoints)</label>
              <div className="space-y-1 mb-2">
                {editContent.sellingPoints.map((sp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 bg-[#FAF8F5] rounded-lg border border-[#E5E0D8]">
                    <span className="font-medium text-stone-700">{sp}</span>
                    <button type="button" onClick={() => removeSellingPoint(idx)} className="text-rose-500 p-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newSellingPoint}
                  onChange={e => setNewSellingPoint(e.target.value)}
                  placeholder="添加卖点项..."
                  className="flex-1 p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={addSellingPoint}
                  className="px-3 py-1.5 bg-[#B28C5A] text-white rounded-lg text-xs font-bold"
                >
                  添加
                </button>
              </div>
            </div>

            {/* Feature Labels */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">特性标签 (featureLabels)</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {editContent.featureLabels.map((lbl, idx) => (
                  <span key={idx} className="flex items-center gap-1 bg-[#F9F5EF] text-[#B28C5A] text-[10px] font-bold px-2 py-1 rounded-md border border-[#E5E0D8]">
                    {lbl}
                    <button type="button" onClick={() => removeFeatureLabel(idx)} className="text-stone-400 hover:text-rose-500">
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newFeatureLabel}
                  onChange={e => setNewFeatureLabel(e.target.value)}
                  placeholder="添加标签..."
                  className="flex-1 p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={addFeatureLabel}
                  className="px-3 py-1.5 bg-[#B28C5A] text-white rounded-lg text-xs font-bold"
                >
                  添加
                </button>
              </div>
            </div>

            {/* Specs */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">规格参数 (specs)</label>
              <div className="space-y-1 mb-2">
                {editContent.specs.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 bg-[#FAF8F5] rounded-lg border border-[#E5E0D8] font-mono">
                    <span>{s.label}: <strong>{s.value}</strong></span>
                    <button type="button" onClick={() => removeSpec(idx)} className="text-rose-500 p-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newSpecLabel}
                  onChange={e => setNewSpecLabel(e.target.value)}
                  placeholder="参数名 (如 材质)"
                  className="w-1/2 p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs outline-none"
                />
                <input
                  type="text"
                  value={newSpecValue}
                  onChange={e => setNewSpecValue(e.target.value)}
                  placeholder="数值 (如 头层牛皮)"
                  className="w-1/2 p-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={addSpec}
                  className="px-3 py-1.5 bg-[#B28C5A] text-white rounded-lg text-xs font-bold"
                >
                  加
                </button>
              </div>
            </div>

            {/* CTA */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">行动号召按钮 (cta)</label>
              <input
                type="text"
                value={editContent.cta}
                onChange={e => setEditContent({ ...editContent, cta: e.target.value })}
                className="w-full p-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs outline-none focus:border-[#B28C5A]"
                placeholder="例如: 立即解锁首发特惠"
              />
            </div>

            {/* Disclaimer */}
            <div>
              <label className="block font-bold text-stone-600 mb-1">免责声明 (disclaimer)</label>
              <input
                type="text"
                value={editContent.disclaimer}
                onChange={e => setEditContent({ ...editContent, disclaimer: e.target.value })}
                className="w-full p-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl text-xs outline-none focus:border-[#B28C5A]"
                placeholder="例如: *数据来源于敏华实验室"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-[#E5E0D8] flex gap-2">
            <button
              type="button"
              onClick={handleSaveManualEdit}
              disabled={isSaving}
              className="flex-1 py-2.5 bg-[#B28C5A] hover:bg-[#8C6F43] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在保存新版本...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存为新 Copy Version</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 4. History Versions Mode */}
      {mode === 'history' && (
        <div className="p-4 bg-white rounded-2xl border border-[#E5E0D8] space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <button
              type="button"
              onClick={() => setMode('view')}
              className="text-xs text-stone-600 hover:text-stone-900 font-bold flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回当前文案</span>
            </button>
            <span className="font-mono text-xs font-bold text-[#B28C5A]">
              共 {historyVersions.length} 个历史版本
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {historyVersions.map(v => {
              const isActive = v.id === currentVersion?.id;
              return (
                <div
                  key={v.id}
                  className={`p-3 rounded-xl border transition-all space-y-1.5 ${
                    isActive
                      ? 'bg-[#F9F5EF] border-[#B28C5A] shadow-xs'
                      : 'bg-white border-[#E5E0D8] hover:border-[#B28C5A]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-[#2C2A29] flex items-center gap-1.5">
                      {v.version_code}
                      {isActive && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-sans font-bold">
                          当前生效
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {v.created_at ? new Date(v.created_at).toLocaleString() : '保存过'}
                    </span>
                  </div>

                  <div className="text-xs text-stone-700 space-y-0.5">
                    <p className="font-bold truncate">{v.content_json?.headline || '无标题'}</p>
                    <p className="text-[10px] text-stone-500">
                      来源: {v.source_type === 'ai_generated' ? 'AI 智能生成' : '人工二次编辑'} · 父版本: {v.parent_version_id || '无 (初始)'}
                    </p>
                  </div>

                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handleSelectVersion(v.id)}
                      className="w-full py-1 mt-1 bg-white hover:bg-[#FAF8F5] text-[#B28C5A] border border-[#E5E0D8] rounded-lg text-[10px] font-bold transition-all"
                    >
                      切换到此版本
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
