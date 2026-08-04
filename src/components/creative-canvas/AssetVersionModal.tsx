import React, { useState, useEffect } from 'react';
import { Layers, CheckCircle2, Clock, Eye, ArrowRight, ShieldCheck, Plus, Sparkles, RefreshCw } from 'lucide-react';

interface AssetVersion {
  id: string;
  asset_sku_id: string;
  version_number: number;
  version_code: string;
  parent_version_id: string | null;
  source_node_id?: string;
  generation_provider?: string;
  generation_model?: string;
  prompt_snapshot?: string;
  object_key: string;
  checksum: string;
  created_at: string;
  previewUrl?: string;
  isCurrent?: boolean;
}

interface AssetSku {
  id: string;
  sku_code: string;
  scene_key: string;
  current_version_id: string | null;
}

interface AssetVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasId: string;
  projectId: string;
  sceneKey: string;
  nodeId: string;
  currentImageUrl?: string;
  onVersionSwitched?: (skuId: string, versionId: string, previewUrl: string, versionCode: string) => void;
}

export const AssetVersionModal: React.FC<AssetVersionModalProps> = ({
  isOpen,
  onClose,
  canvasId,
  projectId,
  sceneKey = 'scene-01',
  nodeId,
  currentImageUrl,
  onVersionSwitched
}) => {
  const [sku, setSku] = useState<AssetSku | null>(null);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [previewingVersion, setPreviewingVersion] = useState<AssetVersion | null>(null);
  const [derivingV002, setDerivingV002] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch or initialize SKU & Versions on modal open
  useEffect(() => {
    if (!isOpen) return;
    initSkuAndVersions();
  }, [isOpen, canvasId, projectId, sceneKey]);

  const initSkuAndVersions = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const authHeader = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || 'demo-token-123'}`
      };

      // 1. Get or Create SKU
      const skuRes = await fetch('/api/asset-skus/skus', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          projectId: projectId || 'proj_default',
          canvasId: canvasId || 'canvas_default',
          sceneKey: sceneKey || 'scene-01',
          name: `场景资产 (${sceneKey || 'scene-01'})`
        })
      });
      const skuData = await skuRes.json();
      if (!skuData.success || !skuData.sku) {
        throw new Error(skuData.message || '获取/创建 Asset SKU 失败');
      }

      const fetchedSku = skuData.sku;
      setSku(fetchedSku);

      // 2. Fetch Versions for this SKU
      const verRes = await fetch(`/api/asset-skus/skus/${fetchedSku.id}/versions`, {
        headers: authHeader
      });
      const verData = await verRes.json();
      let verList: AssetVersion[] = verData.versions || [];

      // 3. If no versions exist yet, auto-create V001 with current image
      if (verList.length === 0 && currentImageUrl) {
        const createV1Res = await fetch(`/api/asset-skus/skus/${fetchedSku.id}/versions`, {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({
            sourceNodeId: nodeId,
            promptSnapshot: '场景结果初始渲染图 (V001)',
            imageUrl: currentImageUrl,
            checksum: `chk_v1_${Date.now().toString(36)}`
          })
        });
        const v1Data = await createV1Res.json();
        if (v1Data.success && v1Data.version) {
          verList = [v1Data.version];
          fetchedSku.current_version_id = v1Data.version.id;
          setSku({ ...fetchedSku });
        }
      }

      setVersions(verList);
      const activeId = fetchedSku.current_version_id || (verList[0] ? verList[verList.length - 1].id : null);
      setActiveVersionId(activeId);
    } catch (err: any) {
      console.error('[AssetVersionModal] Init error:', err);
      setErrorMsg(err.message || '加载资产版本列表失败');
    } finally {
      setLoading(false);
    }
  };

  // Switch node to chosen version
  const handleSelectVersion = async (targetVersion: AssetVersion) => {
    if (!sku) return;
    try {
      const authHeader = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || 'demo-token-123'}`
      };

      // 1. Select SKU version
      await fetch(`/api/asset-skus/skus/${sku.id}/select-version`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ versionId: targetVersion.id })
      });

      // 2. Update Canvas Node Asset Reference
      await fetch(`/api/canvases/${canvasId}/nodes/${nodeId}/asset-reference`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          skuId: sku.id,
          versionId: targetVersion.id,
          sceneKey
        })
      });

      setActiveVersionId(targetVersion.id);
      if (onVersionSwitched) {
        onVersionSwitched(
          sku.id,
          targetVersion.id,
          targetVersion.previewUrl || currentImageUrl || '',
          targetVersion.version_code
        );
      }
    } catch (err: any) {
      console.error('[AssetVersionModal] Switch version error:', err);
      setErrorMsg(err.message || '切换版本失败');
    }
  };

  // Derive V002 from V001
  const handleCreateDerivedVersionV002 = async () => {
    if (!sku || versions.length === 0) return;
    const v001 = versions.find(v => v.version_code === 'V001') || versions[0];
    setDerivingV002(true);
    setErrorMsg('');

    try {
      const authHeader = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || 'demo-token-123'}`
      };

      // Secondary distinct image data for V002
      const canvasV2Sample = document.createElement('canvas');
      canvasV2Sample.width = 1024;
      canvasV2Sample.height = 1024;
      const ctx = canvasV2Sample.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#2C2A29';
        ctx.fillRect(0, 0, 1024, 1024);
        ctx.fillStyle = '#B28C5A';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText('C4A-2 派生资产 V002 (光影微调精修)', 100, 500);
      }
      const v2SampleB64 = canvasV2Sample.toDataURL('image/jpeg');

      const createV2Res = await fetch(`/api/asset-skus/skus/${sku.id}/versions`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          parentVersionId: v001.id,
          sourceNodeId: nodeId,
          promptSnapshot: '根据V001衍生派生：提升局部暖金光影感与面料纹理细腻度 (V002)',
          imageUrl: v2SampleB64,
          checksum: `chk_v2_derived_${Date.now().toString(36)}`
        })
      });

      const v2Data = await createV2Res.json();
      if (!v2Data.success || !v2Data.version) {
        throw new Error(v2Data.message || '创建衍生版本 V002 失败');
      }

      // Refresh version list
      await initSkuAndVersions();
      // Automatically switch node to V002
      await handleSelectVersion(v2Data.version);
    } catch (err: any) {
      console.error('[AssetVersionModal] Derive V002 error:', err);
      setErrorMsg(err.message || '创建衍生版本失败');
    } finally {
      setDerivingV002(false);
    }
  };

  if (!isOpen) return null;

  const currentVersionObj = versions.find(v => v.id === activeVersionId) || versions[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl border border-[#E5E0D8] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#E5E0D8] bg-[#FAF8F5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#B28C5A]/10 text-[#B28C5A] border border-[#B28C5A]/20 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-[#2C2A29]">场景资产 SKU 版本树</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> cloud_saved
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5 font-mono">
                {sku ? `${sku.sku_code} (${sceneKey})` : '加载资产中...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center font-bold text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-stone-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#B28C5A]" />
              <span className="text-xs">加载资产 SKU 及版本版本数据中...</span>
            </div>
          ) : (
            <>
              {/* Derive V002 Action Banner */}
              <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[#2C2A29] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#B28C5A]" />
                    衍生新版本 (V002)
                  </h4>
                  <p className="text-[11px] text-stone-600 mt-0.5">
                    基于主选版本 <span className="font-bold font-mono text-[#B28C5A]">V001</span> 建立父子关系派生 <span className="font-bold font-mono">V002</span>，保留完整版本追溯。
                  </p>
                </div>
                <button
                  onClick={handleCreateDerivedVersionV002}
                  disabled={derivingV002}
                  className="px-4 py-2 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  {derivingV002 ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>{derivingV002 ? '派生创建中...' : '建立衍生版本 V002'}</span>
                </button>
              </div>

              {/* Version History List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  独立版本时间线 ({versions.length} 个版本)
                </h4>

                <div className="space-y-3">
                  {versions.map((ver) => {
                    const isSelected = ver.id === activeVersionId;
                    const parentVer = versions.find(p => p.id === ver.parent_version_id);

                    return (
                      <div
                        key={ver.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? 'border-[#B28C5A] bg-[#FAF8F5] ring-2 ring-[#B28C5A]/15 shadow-sm'
                            : 'border-[#E5E0D8] bg-white hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          {/* Image preview thumbnail */}
                          <div
                            onClick={() => setPreviewingVersion(ver)}
                            className="w-20 h-20 bg-stone-100 rounded-xl overflow-hidden border border-stone-200 cursor-pointer relative group flex-shrink-0"
                          >
                            <img
                              src={ver.previewUrl || currentImageUrl}
                              alt={ver.version_code}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-4 h-4 text-white" />
                            </div>
                          </div>

                          {/* Meta Information */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-[#2C2A29] font-mono">
                                {ver.version_code}
                              </span>
                              {isSelected && (
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-[#B28C5A] text-white rounded-full">
                                  当前使用
                                </span>
                              )}
                              {ver.parent_version_id && (
                                <span className="text-[10px] font-medium px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full border border-stone-200">
                                  父版本: {parentVer ? parentVer.version_code : 'V001'}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-stone-600 line-clamp-1">
                              {ver.prompt_snapshot || '无变更快照描述'}
                            </p>

                            <div className="flex items-center gap-3 text-[10px] text-stone-400 font-mono">
                              <span>{new Date(ver.created_at).toLocaleString()}</span>
                              <span>·</span>
                              <span>{ver.checksum}</span>
                              <span>·</span>
                              <span className="truncate max-w-[120px]" title={ver.object_key}>
                                {ver.object_key}
                              </span>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="flex flex-col justify-center gap-2">
                            {!isSelected ? (
                              <button
                                onClick={() => handleSelectVersion(ver)}
                                className="px-3 py-1.5 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                              >
                                切换此版本
                              </button>
                            ) : (
                              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 px-2 py-1">
                                <CheckCircle2 className="w-4 h-4" /> 生效中
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E0D8] bg-[#FAF8F5] flex items-center justify-between text-xs text-stone-500">
          <span>完整版本链路可随时无缝切换，不更改或覆盖历史图像文件</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl transition-colors"
          >
            完成
          </button>
        </div>
      </div>

      {/* Big Read-Only Image Preview Modal */}
      {previewingVersion && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-3xl overflow-hidden border border-stone-700 p-4 relative flex flex-col items-center">
            <button
              onClick={() => setPreviewingVersion(null)}
              className="absolute top-4 right-4 text-white bg-stone-800 hover:bg-black w-8 h-8 rounded-full flex items-center justify-center font-bold"
            >
              ✕
            </button>
            <h4 className="font-bold text-stone-800 text-sm mb-3">
              只读预览: {previewingVersion.version_code} ({previewingVersion.checksum})
            </h4>
            <div className="max-h-[60vh] overflow-hidden rounded-2xl border border-stone-200">
              <img
                src={previewingVersion.previewUrl || currentImageUrl}
                alt={previewingVersion.version_code}
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>
            <div className="mt-3 text-xs text-stone-500 font-mono text-center">
              ObjectKey: {previewingVersion.object_key}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
