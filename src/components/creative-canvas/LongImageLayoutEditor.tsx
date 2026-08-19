import React, { useState, useEffect, useMemo } from 'react';
import {
  NineScreenLayoutManifest,
  LayoutSlotSpec,
  FitMode,
  NormalizedPoint,
  SafeAreaInsets,
  NormalizedRect,
  LayoutValidationResult
} from '../../types/layoutManifest';
import {
  computeLayoutTransform,
  validateNineScreenLayoutManifest,
  simplifyAspectRatio,
  DEFAULT_SUGGESTED_SLOT_HEIGHTS
} from '../../lib/layoutGeometry';
import { AspectFitPreview } from './AspectFitPreview';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
  Unlock,
  Save,
  RotateCcw,
  Sliders,
  Plus,
  Trash2,
  Eye,
  Layers,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  SplitSquareVertical,
  ChevronRight,
  Maximize2
} from 'lucide-react';

interface LongImageLayoutEditorProps {
  canvasId: string;
  projectId: string;
  productionImages?: Record<string, {
    imageUrl: string;
    width: number;
    height: number;
    aspectRatio?: string;
    assetVersionId?: string;
    subjectBounds?: NormalizedRect | null;
  }>;
  onClose?: () => void;
}

export const LongImageLayoutEditor: React.FC<LongImageLayoutEditorProps> = ({
  canvasId,
  projectId,
  productionImages = {},
  onClose
}) => {
  const [manifest, setManifest] = useState<NineScreenLayoutManifest | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isDeriving, setIsDeriving] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<LayoutValidationResult | null>(null);
  const [lockSafeAreaLinked, setLockSafeAreaLinked] = useState<boolean>(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Initialize or fetch current manifest
  useEffect(() => {
    fetchCurrentManifest();
  }, [canvasId]);

  const fetchCurrentManifest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/canvases/${canvasId}/layout-manifests/current`);
      const data = await res.json();
      if (data.success && data.manifest) {
        setManifest(data.manifest);
        validateCurrent(data.manifest);
      } else {
        // Initialize default draft manifest with 9 scenes
        initDefaultManifest();
      }
    } catch (e) {
      console.warn('Failed to load current manifest, building default:', e);
      initDefaultManifest();
    } finally {
      setIsLoading(false);
    }
  };

  const initDefaultManifest = () => {
    const slots: LayoutSlotSpec[] = Array.from({ length: 9 }).map((_, idx) => {
      const sceneNum = idx + 1;
      const sceneKey = `scene-${String(sceneNum).padStart(2, '0')}` as `scene-${string}`;
      const prod = productionImages[sceneKey] || productionImages[`scene-${sceneNum}`];
      
      const sourceWidth = prod?.width || (idx % 2 === 0 ? 1920 : 1080);
      const sourceHeight = prod?.height || (idx % 2 === 0 ? 1080 : 1440);
      const sourceAspectRatio = prod?.aspectRatio || simplifyAspectRatio(sourceWidth, sourceHeight);
      
      const defaultHeight = DEFAULT_SUGGESTED_SLOT_HEIGHTS[idx]?.slotHeight || 1500;
      const layoutSlotRatio = simplifyAspectRatio(2100, defaultHeight);

      return {
        sceneKey,
        assetVersionId: prod?.assetVersionId || `asset-ver-${sceneKey}-v001`,
        sourceWidth,
        sourceHeight,
        sourceAspectRatio,
        targetWidth: 2100,
        slotHeight: defaultHeight,
        layoutSlotRatio,
        fitMode: 'contain',
        focalPoint: { x: 0.5, y: 0.5 },
        safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
        reservedZones: [
          { x: 0.06, y: 0.06, width: 0.45, height: 0.16, id: `zone-title-${sceneNum}`, label: '分屏主标题区' }
        ],
        subjectBounds: prod?.subjectBounds || { x: 0.2, y: 0.25, width: 0.6, height: 0.55 },
        backgroundColor: '#F7F4EF',
        validationStatus: 'valid',
        warnings: []
      };
    });

    let totalHeight = 0;
    slots.forEach(s => totalHeight += s.slotHeight);

    const defaultManifest: NineScreenLayoutManifest = {
      schemaVersion: 'layout-manifest/v1',
      manifestId: `manifest_${canvasId}_draft_${Date.now()}`,
      projectId,
      canvasId,
      versionNumber: 1,
      versionCode: 'V001',
      widthPx: 2100,
      targetHeightPx: 14800,
      slots,
      totalComputedHeightPx: totalHeight,
      status: 'draft',
      checksum: 'pending_computation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setManifest(defaultManifest);
    validateCurrent(defaultManifest);
    setIsDirty(true);
  };

  const validateCurrent = (m: NineScreenLayoutManifest) => {
    const val = validateNineScreenLayoutManifest(m);
    setValidationResult(val);
  };

  const currentSlot = manifest?.slots[selectedSceneIndex] || null;

  // Handle slot update
  const handleUpdateSlot = (updater: Partial<LayoutSlotSpec>) => {
    if (!manifest || !currentSlot) return;
    const newSlots = [...manifest.slots];
    const updated: LayoutSlotSpec = {
      ...currentSlot,
      ...updater
    };

    // Update layoutSlotRatio if slotHeight or targetWidth changed
    if (updater.slotHeight || updater.targetWidth) {
      updated.layoutSlotRatio = simplifyAspectRatio(updated.targetWidth || 2100, updated.slotHeight);
    }

    newSlots[selectedSceneIndex] = updated;

    let total = 0;
    newSlots.forEach(s => total += s.slotHeight);

    const newManifest: NineScreenLayoutManifest = {
      ...manifest,
      slots: newSlots,
      totalComputedHeightPx: total,
      updatedAt: new Date().toISOString()
    };

    setManifest(newManifest);
    setIsDirty(true);
    validateCurrent(newManifest);
  };

  // Safe area unified update
  const handleSafeAreaChange = (key: keyof SafeAreaInsets, val: number) => {
    if (!currentSlot) return;
    const clamped = Math.max(0, Math.min(0.45, Math.round(val * 100) / 100));
    let newSafeArea: SafeAreaInsets;

    if (lockSafeAreaLinked) {
      newSafeArea = { top: clamped, right: clamped, bottom: clamped, left: clamped };
    } else {
      newSafeArea = { ...currentSlot.safeArea, [key]: clamped };
    }

    handleUpdateSlot({ safeArea: newSafeArea });
  };

  // Reset to standard 14800 height template
  const handleApplyDefaultHeights = () => {
    if (!manifest) return;
    const newSlots = manifest.slots.map((s, idx) => {
      const standardHeight = DEFAULT_SUGGESTED_SLOT_HEIGHTS[idx]?.slotHeight || 1500;
      return {
        ...s,
        slotHeight: standardHeight,
        layoutSlotRatio: simplifyAspectRatio(2100, standardHeight)
      };
    });

    let total = 0;
    newSlots.forEach(s => total += s.slotHeight);

    const newManifest: NineScreenLayoutManifest = {
      ...manifest,
      slots: newSlots,
      totalComputedHeightPx: total,
      updatedAt: new Date().toISOString()
    };

    setManifest(newManifest);
    setIsDirty(true);
    validateCurrent(newManifest);
    setMessage({ text: '已重置 9 屏高度为 14800px 黄金排版模板', type: 'success' });
  };

  // Set all to contain mode
  const handleSetAllContain = () => {
    if (!manifest) return;
    const newSlots = manifest.slots.map(s => ({
      ...s,
      fitMode: 'contain' as FitMode
    }));

    const newManifest: NineScreenLayoutManifest = {
      ...manifest,
      slots: newSlots,
      updatedAt: new Date().toISOString()
    };

    setManifest(newManifest);
    setIsDirty(true);
    validateCurrent(newManifest);
    setMessage({ text: '已将全部 9 屏设为 Contain（无裁切）模式', type: 'success' });
  };

  // Save Draft to Server
  const handleSaveDraft = async () => {
    if (!manifest) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/canvases/${canvasId}/layout-manifests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          slots: manifest.slots,
          widthPx: manifest.widthPx,
          targetHeightPx: manifest.targetHeightPx
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存 Manifest 失败');
      }
      setManifest(data.manifest);
      setIsDirty(false);
      validateCurrent(data.manifest);
      setMessage({ text: `草稿 Manifest ${data.manifest.versionCode} 保存成功！`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || '保存失败', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Approve Manifest
  const handleApprove = async () => {
    if (!manifest) return;
    setIsApproving(true);
    setMessage(null);
    try {
      // First save if dirty
      let activeManifestId = manifest.manifestId;
      if (isDirty || manifest.status !== 'draft') {
        const saveRes = await fetch(`/api/canvases/${canvasId}/layout-manifests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            slots: manifest.slots,
            widthPx: manifest.widthPx,
            targetHeightPx: manifest.targetHeightPx
          })
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok || !saveData.success) throw new Error(saveData.error || '自动保存草稿失败');
        activeManifestId = saveData.manifest.manifestId;
      }

      const res = await fetch(`/api/layout-manifests/${activeManifestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '批准封板失败');
      }
      setManifest(data.manifest);
      setIsDirty(false);
      validateCurrent(data.manifest);
      setMessage({ text: `Manifest ${data.manifest.versionCode} 已成功封板批准！可作为长图合成输入。`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || '批准失败', type: 'error' });
    } finally {
      setIsApproving(false);
    }
  };

  // Derive New Draft
  const handleDerive = async () => {
    if (!manifest) return;
    setIsDeriving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/layout-manifests/${manifest.manifestId}/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '派生新版本失败');
      }
      setManifest(data.manifest);
      setIsDirty(false);
      validateCurrent(data.manifest);
      setMessage({ text: `已从 ${manifest.versionCode} 派生新草稿版本 ${data.manifest.versionCode}`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || '派生失败', type: 'error' });
    } finally {
      setIsDeriving(false);
    }
  };

  // Add Reserved Zone
  const handleAddReservedZone = () => {
    if (!currentSlot) return;
    const newZone: NormalizedRect = {
      id: `zone_${Date.now()}`,
      x: 0.1,
      y: 0.75,
      width: 0.8,
      height: 0.18,
      label: '自定义预留区域'
    };
    handleUpdateSlot({
      reservedZones: [...(currentSlot.reservedZones || []), newZone]
    });
  };

  // Remove Reserved Zone
  const handleRemoveReservedZone = (zoneId?: string) => {
    if (!currentSlot || !zoneId) return;
    handleUpdateSlot({
      reservedZones: (currentSlot.reservedZones || []).filter(z => z.id !== zoneId)
    });
  };

  const totalHeight = manifest?.totalComputedHeightPx || 0;
  const targetHeight = manifest?.targetHeightPx || 14800;
  const heightDelta = totalHeight - targetHeight;
  const isHeightExact = totalHeight === targetHeight;
  const isApproved = manifest?.status === 'approved';

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center">
        <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3 shadow-2xl">
          <RefreshCw className="w-8 h-8 text-[#B28C5A] animate-spin" />
          <span className="text-sm font-bold text-[#2C2A29]">正在加载九屏长图版面 Manifest...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#18181B]/80 backdrop-blur-md flex flex-col text-[#2C2A29] select-none animate-fadeIn">
      {/* 1. Header Toolbar */}
      <header className="h-16 px-6 bg-white border-b border-[#E5E0D8] flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#B28C5A]/10 text-[#8C6F43] border border-[#B28C5A]/20 flex items-center justify-center font-bold">
              <SplitSquareVertical className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-[#2C2A29]">九屏长图版面适配与 Manifest</h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FAF8F5] border border-[#E5E0D8] text-stone-600">
                  {manifest?.versionCode || 'V001'}
                </span>
                {isApproved ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> 已封板 (Approved)
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                    <Unlock className="w-3 h-3" /> 草稿编辑中 (Draft)
                  </span>
                )}
              </div>
              <span className="text-[10px] text-stone-400 font-mono">
                Canvas: {canvasId.slice(0, 12)}... · Checksum: {manifest?.checksum ? manifest.checksum.slice(0, 10) + '...' : '未计算'}
              </span>
            </div>
          </div>

          {/* Height Checker Badge */}
          <div className="h-8 px-3 rounded-xl border flex items-center gap-2 text-xs font-mono font-bold bg-[#FAF8F5]">
            <span className="text-stone-500">九屏总高:</span>
            <span className={isHeightExact ? 'text-emerald-600 font-extrabold' : 'text-amber-600 font-extrabold'}>
              {totalHeight} px
            </span>
            <span className="text-stone-400">/ 14800 px</span>
            {isHeightExact ? (
              <span className="text-emerald-700 bg-emerald-100/70 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> 精确匹配
              </span>
            ) : (
              <span className="text-rose-700 bg-rose-100/80 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> {heightDelta > 0 ? `+${heightDelta}` : heightDelta} px
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleApplyDefaultHeights}
            className="px-3 py-1.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] hover:bg-stone-100 text-xs font-medium flex items-center gap-1 text-stone-700"
            title="一键将 9 屏高度重置为 14800 标准黄金高度模板"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
            <span>默认 14800 高度</span>
          </button>

          <button
            onClick={handleSetAllContain}
            className="px-3 py-1.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] hover:bg-stone-100 text-xs font-medium flex items-center gap-1 text-stone-700"
            title="全部设为 Contain (无裁切) 模式"
          >
            <Eye className="w-3.5 h-3.5 text-stone-500" />
            <span>全设 Contain</span>
          </button>

          <div className="w-[1px] h-6 bg-stone-200 mx-1" />

          {isApproved ? (
            <button
              onClick={handleDerive}
              disabled={isDeriving}
              className="px-3.5 py-1.5 rounded-xl bg-[#FAF8F5] border border-[#B28C5A]/40 text-[#8C6F43] hover:bg-[#B28C5A]/10 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDeriving ? 'animate-spin' : ''}`} />
              <span>派生新草稿 (Derive)</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-[#E5E0D8] hover:bg-stone-50 text-xs font-bold text-stone-700 flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <Save className={`w-3.5 h-3.5 text-[#B28C5A] ${isSaving ? 'animate-pulse' : ''}`} />
                <span>{isSaving ? '保存中...' : '保存草稿'}</span>
              </button>

              <button
                onClick={handleApprove}
                disabled={isApproving || !validationResult?.canApprove}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${
                  validationResult?.canApprove
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
                title={validationResult?.canApprove ? '批准并锁定该版面 Manifest' : '需满足总高 14800 且无阻断错误方可批准'}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isApproving ? '封板中...' : '批准封板 (Approve)'}</span>
              </button>
            </>
          )}

          <div className="w-[1px] h-6 bg-stone-200 mx-1" />

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-stone-100 text-stone-500 hover:text-stone-700"
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Global Message Banner */}
      {message && (
        <div
          className={`px-6 py-2 text-xs font-bold flex items-center justify-between border-b ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : message.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-sky-50 text-sky-800 border-sky-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-stone-400 hover:text-stone-600 font-mono">
            ×
          </button>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden bg-[#F4F1EC]">
        {/* Left Column: 9-Screen Vertical Stitched Long Canvas (Scaled Preview) */}
        <div className="flex-1 flex flex-col border-r border-[#E5E0D8] bg-[#FAF8F5]/80 overflow-y-auto p-8 items-center">
          <div className="w-full max-w-[420px] flex flex-col items-center gap-3">
            <div className="w-full flex items-center justify-between text-xs text-stone-500 font-mono mb-1">
              <span>2100×14800 纵向长图缩放预览 (全 9 屏)</span>
              <span>点击单屏进入精调</span>
            </div>

            {/* Continuous Stitched Canvas Stack */}
            <div className="w-full rounded-2xl overflow-hidden shadow-2xl border-2 border-[#E5E0D8] bg-white divide-y divide-stone-200">
              {manifest?.slots.map((slot, idx) => {
                const isSelected = idx === selectedSceneIndex;
                const prod = productionImages[slot.sceneKey] || productionImages[`scene-${idx + 1}`];
                const slotVal = validationResult?.slotResults.find(r => r.sceneKey === slot.sceneKey);

                return (
                  <div
                    key={slot.sceneKey}
                    onClick={() => setSelectedSceneIndex(idx)}
                    className={`relative cursor-pointer transition-all group ${
                      isSelected
                        ? 'ring-4 ring-[#B28C5A] ring-inset z-10'
                        : 'hover:brightness-95'
                    }`}
                  >
                    {/* Scene Tag Badge */}
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 pointer-events-none">
                      <span className="px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-white text-[10px] font-bold font-mono">
                        #{idx + 1} {slot.sceneKey}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-white/90 text-[9px] font-mono font-bold text-stone-700 shadow-sm">
                        {slot.slotHeight}px · {slot.layoutSlotRatio}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-[9px] font-mono font-bold">
                        {slot.fitMode}
                      </span>
                    </div>

                    {/* Validation indicator */}
                    <div className="absolute top-2 right-2 z-20 pointer-events-none">
                      {slotVal?.validationStatus === 'invalid' ? (
                        <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold flex items-center gap-0.5">
                          <XCircle className="w-2.5 h-2.5" /> 阻断错误
                        </span>
                      ) : slotVal?.validationStatus === 'warning' ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-bold flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> 告警
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600/90 text-white text-[9px] font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> 合规
                        </span>
                      )}
                    </div>

                    {/* Preview Slot */}
                    <AspectFitPreview
                      slot={slot}
                      imageUrl={prod?.imageUrl}
                      targetWidth={2100}
                      showOverlays={isSelected}
                      interactiveFocal={false}
                      className="w-full"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Single Screen Layout Inspector */}
        {currentSlot && (
          <div className="w-[460px] flex-shrink-0 bg-white border-l border-[#E5E0D8] flex flex-col overflow-y-auto">
            {/* Inspector Header */}
            <div className="p-4 border-b border-[#E5E0D8] bg-[#FAF8F5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#B28C5A] text-white flex items-center justify-center font-bold text-xs">
                  #{selectedSceneIndex + 1}
                </div>
                <div>
                  <h3 className="font-bold text-xs text-[#2C2A29]">
                    分屏插槽精调 · {currentSlot.sceneKey}
                  </h3>
                  <span className="text-[10px] text-stone-400 font-mono">
                    原图 {currentSlot.sourceWidth}×{currentSlot.sourceHeight} ({currentSlot.sourceAspectRatio})
                  </span>
                </div>
              </div>

              {/* Scene Switcher buttons */}
              <div className="flex items-center gap-1">
                {Array.from({ length: 9 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedSceneIndex(i)}
                    className={`w-6 h-6 rounded text-[10px] font-mono font-bold transition-all ${
                      selectedSceneIndex === i
                        ? 'bg-[#B28C5A] text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Inspector Content */}
            <div className="p-5 space-y-6 flex-1">
              {/* 1. Large Interactive Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                  <span>排版与裁切交互预览</span>
                  <span className="text-[10px] text-stone-400 font-normal">可在画面拖拽调整焦点</span>
                </div>
                <div className="w-full rounded-2xl overflow-hidden border border-[#E5E0D8] shadow-inner bg-stone-100">
                  <AspectFitPreview
                    slot={currentSlot}
                    imageUrl={
                      productionImages[currentSlot.sceneKey]?.imageUrl ||
                      productionImages[`scene-${selectedSceneIndex + 1}`]?.imageUrl
                    }
                    targetWidth={2100}
                    interactiveFocal={!isApproved}
                    showOverlays={true}
                    onSlotChange={(updated) => handleUpdateSlot(updated)}
                    className="w-full"
                  />
                </div>
              </div>

              {/* 2. Fit Mode Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#2C2A29] flex items-center justify-between">
                  <span>适配模式 (Fit Mode)</span>
                  <span className="text-[10px] text-stone-400 font-mono">默认 Contain</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['contain', 'cover', 'smart_crop'] as FitMode[]).map((mode) => (
                    <button
                      key={mode}
                      disabled={isApproved}
                      onClick={() => handleUpdateSlot({ fitMode: mode })}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1 ${
                        currentSlot.fitMode === mode
                          ? 'bg-[#B28C5A]/10 border-[#B28C5A] text-[#8C6F43]'
                          : 'bg-[#FAF8F5] border-[#E5E0D8] text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <span className="capitalize">{mode}</span>
                      <span className="text-[9px] font-normal text-stone-400">
                        {mode === 'contain'
                          ? '完整留白不裁切'
                          : mode === 'cover'
                          ? '焦点铺满裁切'
                          : '主体避让裁切'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Slot Height & Ratio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                  <label>插槽高度 (Slot Height)</label>
                  <span className="text-[11px] font-mono text-[#B28C5A] font-bold">
                    {currentSlot.slotHeight} px · 比例 {currentSlot.layoutSlotRatio}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={800}
                    max={3200}
                    step={50}
                    disabled={isApproved}
                    value={currentSlot.slotHeight}
                    onChange={(e) => handleUpdateSlot({ slotHeight: Number(e.target.value) })}
                    className="flex-1 accent-[#B28C5A]"
                  />
                  <input
                    type="number"
                    min={400}
                    max={5000}
                    step={10}
                    disabled={isApproved}
                    value={currentSlot.slotHeight}
                    onChange={(e) => handleUpdateSlot({ slotHeight: Number(e.target.value) })}
                    className="w-24 px-2 py-1 border border-[#E5E0D8] rounded-lg text-xs font-mono font-bold text-right"
                  />
                </div>
              </div>

              {/* 4. Focal Point (0..1) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                  <label>裁切焦点坐标 (Focal Point)</label>
                  <span className="text-[10px] font-mono text-stone-500">
                    X: {currentSlot.focalPoint.x.toFixed(2)} | Y: {currentSlot.focalPoint.y.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-stone-400">水平 X (0~1)</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={isApproved}
                      value={currentSlot.focalPoint.x}
                      onChange={(e) =>
                        handleUpdateSlot({
                          focalPoint: { ...currentSlot.focalPoint, x: Number(e.target.value) }
                        })
                      }
                      className="w-full accent-[#B28C5A]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400">垂直 Y (0~1)</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={isApproved}
                      value={currentSlot.focalPoint.y}
                      onChange={(e) =>
                        handleUpdateSlot({
                          focalPoint: { ...currentSlot.focalPoint, y: Number(e.target.value) }
                        })
                      }
                      className="w-full accent-[#B28C5A]"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Safe Area Insets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                  <label>安全保护区边距 (Safe Area)</label>
                  <label className="flex items-center gap-1 text-[10px] text-stone-500 font-normal cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lockSafeAreaLinked}
                      onChange={(e) => setLockSafeAreaLinked(e.target.checked)}
                      className="rounded accent-[#B28C5A]"
                    />
                    <span>等比联动</span>
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['top', 'bottom', 'left', 'right'] as (keyof SafeAreaInsets)[]).map((side) => (
                    <div key={side} className="flex flex-col gap-1">
                      <span className="text-[9px] text-stone-400 capitalize font-mono">{side}</span>
                      <input
                        type="number"
                        min={0}
                        max={0.45}
                        step={0.01}
                        disabled={isApproved}
                        value={currentSlot.safeArea[side]}
                        onChange={(e) => handleSafeAreaChange(side, parseFloat(e.target.value) || 0)}
                        className="w-full px-1.5 py-1 border border-[#E5E0D8] rounded text-xs font-mono text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 6. Background Color for Contain Whitespace */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#2C2A29] flex items-center justify-between">
                  <span>留白填充背景色 (Background Color)</span>
                  <span className="text-[10px] font-mono text-stone-400">{currentSlot.backgroundColor}</span>
                </label>
                <div className="flex items-center gap-2">
                  {['#F7F4EF', '#FFFFFF', '#18181B', '#ECE7DF', '#F2EFEB'].map((color) => (
                    <button
                      key={color}
                      disabled={isApproved}
                      onClick={() => handleUpdateSlot({ backgroundColor: color })}
                      className={`w-7 h-7 rounded-lg border-2 transition-all ${
                        currentSlot.backgroundColor === color
                          ? 'border-[#B28C5A] scale-110 shadow-sm'
                          : 'border-stone-300'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    disabled={isApproved}
                    value={currentSlot.backgroundColor}
                    onChange={(e) => handleUpdateSlot({ backgroundColor: e.target.value })}
                    className="w-7 h-7 rounded border cursor-pointer"
                  />
                </div>
              </div>

              {/* 7. Reserved Zones (Title, Specs, Logo) */}
              <div className="space-y-2 pt-2 border-t border-[#E5E0D8]">
                <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                  <label>文字与规格预留区 ({currentSlot.reservedZones?.length || 0})</label>
                  <button
                    disabled={isApproved}
                    onClick={handleAddReservedZone}
                    className="text-[10px] font-bold text-[#8C6F43] hover:text-[#B28C5A] flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> 新增预留区
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {currentSlot.reservedZones?.map((zone, zIdx) => (
                    <div
                      key={zone.id || zIdx}
                      className="p-2 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8] flex items-center justify-between gap-2 text-xs"
                    >
                      <input
                        type="text"
                        disabled={isApproved}
                        value={zone.label || `预留区 #${zIdx + 1}`}
                        onChange={(e) => {
                          const updated = [...currentSlot.reservedZones];
                          updated[zIdx] = { ...zone, label: e.target.value };
                          handleUpdateSlot({ reservedZones: updated });
                        }}
                        className="bg-transparent font-medium text-stone-700 flex-1 outline-none text-xs"
                      />
                      <span className="text-[10px] font-mono text-stone-400">
                        {Math.round(zone.width * 100)}%×{Math.round(zone.height * 100)}%
                      </span>
                      {!isApproved && (
                        <button
                          onClick={() => handleRemoveReservedZone(zone.id)}
                          className="text-stone-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
