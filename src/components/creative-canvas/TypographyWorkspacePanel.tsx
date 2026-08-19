import React, { useState, useEffect, useCallback } from 'react';
import { Type, CheckCircle, AlertTriangle, RefreshCw, Save, ShieldAlert, Sliders, Layers } from 'lucide-react';
import { TypographySlotSpec, TypographySpecV1, StructuredCopyContent, TypographySemanticRole, TypographyOverflowPolicy } from '../../types/creativeCanvas';
import { supabase } from '../../lib/supabase';

interface TypographyWorkspacePanelProps {
  projectId: string;
  canvasId: string;
  sceneIndex: number;
  productDnaVersionId?: string;
  assetVersionId?: string;
}

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
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userUuid) headers['x-user-uuid'] = userUuid;
  return headers;
}

export const TypographyWorkspacePanel: React.FC<TypographyWorkspacePanelProps> = ({
  projectId,
  canvasId,
  sceneIndex,
  productDnaVersionId,
  assetVersionId
}) => {
  const sceneKey = `scene-${String(sceneIndex).padStart(2, '0')}`;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copySku, setCopySku] = useState<any>(null);
  const [copyVersion, setCopyVersion] = useState<any>(null);
  const [spec, setSpec] = useState<TypographySpecV1 | null>(null);
  const [slots, setSlots] = useState<TypographySlotSpec[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Fetch Copy SKU/Version and Typography Spec
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const authHeaders = await getAuthHeaders();

      // 1. Fetch current Copy Version for scene
      const copyRes = await fetch(`/api/canvases/${canvasId}/scenes/${sceneKey}/copy`, {
        headers: { ...authHeaders }
      });
      const copyData = await copyRes.json();

      let currentCopyVer = null;
      if (copyData.success) {
        setCopySku(copyData.copySku);
        setCopyVersion(copyData.currentVersion);
        currentCopyVer = copyData.currentVersion;
      }

      // 2. Fetch active Typography Spec for scene
      const specRes = await fetch(`/api/canvases/${canvasId}/scenes/${sceneKey}/typography-spec?projectId=${projectId}`, {
        headers: { ...authHeaders }
      });
      const specData = await specRes.json();

      if (specData.success && specData.spec) {
        setSpec(specData.spec);
        setSlots(specData.spec.slots || []);
      } else if (currentCopyVer) {
        // Auto generate default slots if copy version exists
        const defRes = await fetch('/api/typography-specs/default-from-copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            projectId,
            canvasId,
            sceneKey,
            copySkuId: copyData.copySku.id,
            copyVersionId: currentCopyVer.id,
            productDnaVersionId,
            assetVersionId
          })
        });
        const defData = await defRes.json();
        if (defData.success && defData.spec) {
          setSpec(defData.spec);
          setSlots(defData.spec.slots || []);
        }
      }
    } catch (e: any) {
      console.error('Failed to load Typography Spec:', e);
      setMessage({ type: 'error', text: '加载排版 Spec 失败: ' + (e.message || '网络连接异常') });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, canvasId, sceneKey, productDnaVersionId, assetVersionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Slot property change
  const handleSlotChange = (slotKey: string, field: keyof TypographySlotSpec, value: any) => {
    setSlots(prev =>
      prev.map(s => {
        if (s.slotKey === slotKey) {
          return { ...s, [field]: value };
        }
        return s;
      })
    );
  };

  // Save Spec
  const handleSaveSpec = async () => {
    if (!copySku || !copyVersion) {
      setMessage({ type: 'error', text: '无法保存：未检测到绑定的 Copy Version' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/typography-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          projectId,
          canvasId,
          sceneKey,
          copySkuId: copySku.id,
          copyVersionId: copyVersion.id,
          productDnaVersionId,
          assetVersionId,
          slots
        })
      });

      const data = await res.json();
      if (data.success && data.spec) {
        setSpec(data.spec);
        setSlots(data.spec.slots || []);
        setMessage({
          type: data.spec.status === 'valid' ? 'success' : 'warning',
          text: data.spec.status === 'valid'
            ? '✅ Typography Spec 保存成功，内容校验通过！'
            : `⚠️ Spec 保存成功 (状态: ${data.spec.status})。请关注超长/超行警告。`
        });
      } else {
        setMessage({ type: 'error', text: data.error?.message || '保存失败' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: '保存失败: ' + (e.message || '网络异常') });
    } finally {
      setIsSaving(false);
    }
  };

  // Re-sync from Copy Version
  const handleSyncFromCopy = async () => {
    if (!copySku || !copyVersion) {
      setMessage({ type: 'error', text: '无法同步：场景未绑定 Copy Version' });
      return;
    }

    setIsLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/typography-specs/default-from-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          projectId,
          canvasId,
          sceneKey,
          copySkuId: copySku.id,
          copyVersionId: copyVersion.id,
          productDnaVersionId,
          assetVersionId
        })
      });

      const data = await res.json();
      if (data.success && data.spec) {
        setSpec(data.spec);
        setSlots(data.spec.slots || []);
        setMessage({ type: 'success', text: `✅ 已重新从 ${copyVersion.version_code || 'Copy Version'} 同步全新 Slots！` });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: '重新同步失败' });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-[#B28C5A] mx-auto" />
        <p className="text-xs text-stone-600 font-medium">正在加载 {sceneKey} Typography Spec 契约...</p>
      </div>
    );
  }

  if (!copyVersion) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-[#E5E0D8] text-center space-y-3 my-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="font-serif font-bold text-sm text-[#2C2A29]">场景未创建 Copy Version</h3>
        <p className="text-xs text-stone-600 leading-relaxed">
          {sceneKey} 尚未生成或绑定文案版本。Typography Spec 必须绑定至特定 Copy Version，请先在【文案】栏生成并创建文案版本 (COPY-V001)。
        </p>
      </div>
    );
  }

  const getRoleBadgeColor = (role: TypographySemanticRole) => {
    switch (role) {
      case 'headline': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'subheadline': return 'bg-sky-100 text-sky-800 border-sky-300';
      case 'eyebrow': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'body': return 'bg-stone-100 text-stone-800 border-stone-300';
      case 'selling_point': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'feature_label': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'spec': return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'cta': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'disclaimer': return 'bg-gray-100 text-gray-700 border-gray-300';
      default: return 'bg-stone-100 text-stone-700 border-stone-300';
    }
  };

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* Top Header Card */}
      <div className="p-4 bg-white rounded-2xl border border-[#E5E0D8] shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-[#B28C5A]" />
            <span className="font-bold text-[#2C2A29]">Typography Spec 契约 ({sceneKey})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold bg-[#B28C5A]/10 text-[#8C6F43] px-2 py-0.5 rounded-full border border-[#B28C5A]/20">
              {copyVersion.version_code || 'COPY-V001'}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              spec?.status === 'valid'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : spec?.status === 'manual_review'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {spec?.status === 'valid' ? '校验通过 (valid)' : spec?.status === 'manual_review' ? '需人工审核 (manual_review)' : '超限警告 (overflow_warning)'}
            </span>
          </div>
        </div>

        {/* Status Notification Message */}
        {message && (
          <div className={`p-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
            message.type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
            'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {message.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />}
            {message.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />}
            {message.type === 'error' && <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleSyncFromCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] text-stone-700 font-bold hover:border-[#B28C5A] hover:text-[#B28C5A] transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>从 Copy Version 同步</span>
          </button>
          <button
            onClick={handleSaveSpec}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#B28C5A] text-white font-bold hover:bg-[#8C6F43] transition-all shadow-xs disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>保存 Spec</span>
          </button>
        </div>
      </div>

      {/* Slots List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-stone-500 font-bold text-[11px] px-1">
          <span>内容槽位与限制 (Slots & Limits)</span>
          <span>共 {slots.length} 个槽位</span>
        </div>

        {slots.map((slot) => {
          const contentLen = slot.content ? slot.content.length : 0;
          const isOverflow = slot.enabled && contentLen > slot.maxCharacters;

          return (
            <div
              key={slot.slotKey}
              className={`p-3.5 rounded-2xl border bg-white space-y-2.5 transition-all ${
                isOverflow ? 'border-rose-300 ring-1 ring-rose-200 shadow-xs' : 'border-[#E5E0D8]'
              }`}
            >
              {/* Slot Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={slot.enabled}
                    onChange={(e) => handleSlotChange(slot.slotKey, 'enabled', e.target.checked)}
                    className="w-4 h-4 accent-[#B28C5A] rounded-sm cursor-pointer"
                  />
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeColor(slot.semanticRole)}`}>
                    {slot.semanticRole}
                  </span>
                  <span className="font-mono text-[10px] text-stone-400">P{slot.priority}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isOverflow ? 'bg-rose-100 text-rose-700 font-extrabold' : 'bg-stone-100 text-stone-600'
                  }`}>
                    {contentLen} / {slot.maxCharacters} 字
                  </span>
                </div>
              </div>

              {/* Slot Content Display / Edit */}
              <div>
                <input
                  type="text"
                  value={slot.content}
                  onChange={(e) => handleSlotChange(slot.slotKey, 'content', e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-medium text-[#2C2A29] focus:outline-none ${
                    isOverflow ? 'border-rose-300 bg-rose-50/30' : 'border-[#E5E0D8] bg-[#FAF8F5]'
                  }`}
                  placeholder="槽位文本内容..."
                />
              </div>

              {/* Slot Rules Controls */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#F5F2EC] text-[11px]">
                <div>
                  <label className="text-[10px] text-stone-400 block mb-0.5 font-medium">最大字数</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={slot.maxCharacters}
                    onChange={(e) => handleSlotChange(slot.slotKey, 'maxCharacters', parseInt(e.target.value, 10) || 1)}
                    className="w-full px-2 py-1 rounded-lg border border-[#E5E0D8] text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-400 block mb-0.5 font-medium">最大行数</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={slot.maxLines}
                    onChange={(e) => handleSlotChange(slot.slotKey, 'maxLines', parseInt(e.target.value, 10) || 1)}
                    className="w-full px-2 py-1 rounded-lg border border-[#E5E0D8] text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-400 block mb-0.5 font-medium">超限策略</label>
                  <select
                    value={slot.overflowPolicy}
                    onChange={(e) => handleSlotChange(slot.slotKey, 'overflowPolicy', e.target.value as TypographyOverflowPolicy)}
                    className="w-full px-1.5 py-1 rounded-lg border border-[#E5E0D8] text-[11px] font-sans bg-white"
                  >
                    <option value="truncate">truncate (截断)</option>
                    <option value="shrink">shrink (缩小字号)</option>
                    <option value="hide_low_priority">hide (隐藏)</option>
                    <option value="manual_review">manual (人工审核)</option>
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lineage Info Card */}
      <div className="p-3.5 bg-white rounded-2xl border border-[#E5E0D8] space-y-2 text-[11px]">
        <div className="font-bold text-[#2C2A29] flex items-center gap-1.5 border-b border-[#F5F2EC] pb-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>Spec 血缘关联 (Lineage)</span>
        </div>
        <div className="space-y-1 font-mono text-stone-600 text-[10px]">
          <div className="flex justify-between">
            <span className="text-stone-400">Copy Version:</span>
            <span className="font-bold text-[#8C6F43]">{copyVersion.version_code || 'COPY-V001'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-400">Product DNA Version:</span>
            <span className="truncate max-w-[170px]">{productDnaVersionId || 'DNA-DEFAULT'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-400">Asset Version:</span>
            <span className="truncate max-w-[170px]">{assetVersionId || 'ASSET-DEFAULT'}</span>
          </div>
        </div>
      </div>

      {/* C4B-3 Contract Notice */}
      <div className="p-3 bg-[#F9F5EF] rounded-xl border border-[#E5E0D8] text-[10px] text-[#8C6F43] leading-relaxed flex items-start gap-2">
        <Layers className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#B28C5A]" />
        <div>
          <strong className="font-bold block text-[#2C2A29] mb-0.5">C4B-3 稳定内容契约</strong>
          Typography Spec 作为 Copy Version 到后续 Layout Version 的稳定内容契约。本阶段未创建真实 TextNode，无字体、字号、坐标与几何参数保存。
        </div>
      </div>
    </div>
  );
};

export default TypographyWorkspacePanel;
