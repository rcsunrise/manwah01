import React from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Maximize2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Eye,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { GeneratedImageNodeData } from '../../types/creativeCanvas';

interface GeneratedImageNodeProps {
  data: GeneratedImageNodeData;
  selected?: boolean;
}

export const GeneratedImageNode: React.FC<GeneratedImageNodeProps> = ({ data, selected }) => {
  const [imgError, setImgError] = React.useState(false);
  const {
    sceneIndex,
    screenTitle,
    imageUrl,
    dimensions = '1024x1365',
    sourceWidth,
    sourceHeight,
    sourceAspectRatio,
    aspectRatio = '3:4',
    model = 'google/gemini-3-pro-image-preview',
    generatedAt,
    version = 1,
    assetSkuCode,
    assetVersionCode,
    reviewStatus = 'pendingReview',
    onViewDetail,
    onApprove,
    onReject,
    onOpenAssetVersions
  } = data;

  const getReviewBadge = () => {
    switch (reviewStatus) {
      case 'approved':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> 审核通过
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> 未通过
          </span>
        );
      case 'pendingReview':
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" /> 待人审
          </span>
        );
    }
  };

  const getCssAspectRatio = (ratioStr?: string): string => {
    if (!ratioStr || ratioStr === 'Auto' || ratioStr === 'Custom') return '3/4';
    const parts = ratioStr.split(':');
    if (parts.length === 2) {
      const w = parseFloat(parts[0]);
      const h = parseFloat(parts[1]);
      if (!isNaN(w) && !isNaN(h) && h > 0) {
        return `${w}/${h}`;
      }
    }
    return '3/4';
  };

  const sourceRatioCss = (sourceWidth && sourceHeight && sourceWidth > 0 && sourceHeight > 0)
    ? `${sourceWidth}/${sourceHeight}`
    : getCssAspectRatio(sourceAspectRatio || aspectRatio);

  const displayVersionCode = assetVersionCode || `V00${version}`;

  return (
    <div
      className={`w-[260px] bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md select-none overflow-hidden ${
        selected ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/20' : 'border-[#E5E0D8]'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!w-3 !h-3 !bg-[#B28C5A] !border-2 !border-white"
      />

      {/* Header */}
      <div className="p-3 border-b border-[#E5E0D8]/60 bg-[#FAF8F5] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-xs flex-shrink-0">
            #{sceneIndex}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 font-bold text-xs text-[#2C2A29] truncate">
              <span>渲染结果</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-[#B28C5A] text-white">
                {displayVersionCode}
              </span>
            </div>
            {assetSkuCode && (
              <span className="text-[9px] text-stone-400 font-mono truncate" title={assetSkuCode}>
                {assetSkuCode}
              </span>
            )}
          </div>
        </div>
        {getReviewBadge()}
      </div>

      {/* Image Preview Container with Dynamic Ratio and object-contain */}
      <div
        className="relative w-full bg-stone-100 overflow-hidden group min-h-[160px] flex items-center justify-center"
        style={{ aspectRatio: sourceRatioCss }}
      >
        {!imgError && imageUrl ? (
          <img
            src={imageUrl}
            alt={`分镜 #${sceneIndex} ${screenTitle}`}
            className="w-full h-full object-contain transition-transform duration-300"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-stone-100 text-stone-400 text-center">
            <Sparkles className="w-8 h-8 mb-2 text-[#B28C5A]/40 animate-pulse" />
            <span className="text-xs font-medium text-stone-500">图片资源加载中或已更新</span>
            <span className="text-[10px] text-stone-400 mt-1">请重试或重新生成分镜渲染</span>
          </div>
        )}
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenAssetVersions) onOpenAssetVersions();
              else if (onViewDetail) onViewDetail();
            }}
            className="p-2 bg-white/90 text-[#2C2A29] rounded-xl hover:bg-white text-xs font-bold flex items-center gap-1 shadow-md transition-transform active:scale-95"
          >
            <Layers className="w-3.5 h-3.5 text-[#B28C5A]" />
            <span>版本管理</span>
          </button>
        </div>

        {/* Resolution & Aspect ratio tag */}
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
          <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
          <span>cloud_saved · {sourceAspectRatio || aspectRatio}</span>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-2.5 bg-[#FAF8F5] border-t border-[#E5E0D8]/60 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-stone-500">
          <span className="truncate max-w-[130px] font-medium" title={screenTitle}>
            {screenTitle}
          </span>
          <div className="flex items-center gap-1 font-mono">
            {data.productDnaVersionCode && (
              <span className="text-[9px] text-[#8C6F43] bg-[#B28C5A]/10 px-1 py-0.2 rounded border border-[#B28C5A]/20 font-bold" title={`Bound DNA Version: ${data.productDnaVersionId || ''}`}>
                {data.productDnaVersionCode}
              </span>
            )}
            {data.parentVersionId && (
              <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200" title={`Parent Version ID: ${data.parentVersionId}`}>
                P:{data.parentVersionId.slice(-4)}
              </span>
            )}
            <span>{generatedAt || '刚刚'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1 border-t border-[#E5E0D8]/40">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onApprove) onApprove();
            }}
            className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors ${
              reviewStatus === 'approved'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <ThumbsUp className="w-3 h-3" />
            <span>{reviewStatus === 'approved' ? '已通过' : '通过'}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenAssetVersions) onOpenAssetVersions();
              else if (onViewDetail) onViewDetail();
            }}
            className="py-1 px-2.5 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-50 text-stone-700 border border-[#E5E0D8] flex items-center gap-1"
          >
            <Layers className="w-3 h-3 text-[#B28C5A]" />
            <span>{displayVersionCode} 资产</span>
          </button>
        </div>
      </div>
    </div>
  );
};
