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
  Eye
} from 'lucide-react';
import { GeneratedImageNodeData } from '../../types/creativeCanvas';

interface GeneratedImageNodeProps {
  data: GeneratedImageNodeData;
  selected?: boolean;
}

export const GeneratedImageNode: React.FC<GeneratedImageNodeProps> = ({ data, selected }) => {
  const {
    sceneIndex,
    screenTitle,
    imageUrl,
    dimensions = '1024x1365',
    aspectRatio = '3:4',
    model = 'google/gemini-3-pro-image-preview',
    generatedAt,
    version = 1,
    reviewStatus = 'pendingReview',
    onViewDetail,
    onApprove,
    onReject
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
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-xs">
            #{sceneIndex}
          </div>
          <span className="font-bold text-xs text-[#2C2A29] truncate max-w-[100px]">
            渲染结果 v{version}
          </span>
        </div>
        {getReviewBadge()}
      </div>

      {/* Image Preview Container */}
      <div className="relative w-full aspect-[3/4] bg-stone-100 overflow-hidden group">
        <img
          src={imageUrl}
          alt={`分镜 #${sceneIndex} ${screenTitle}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onViewDetail) onViewDetail();
            }}
            className="p-2 bg-white/90 text-[#2C2A29] rounded-xl hover:bg-white text-xs font-bold flex items-center gap-1 shadow-md transition-transform active:scale-95"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>调阅大图</span>
          </button>
        </div>

        {/* Resolution tag */}
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] px-2 py-0.5 rounded-full font-mono">
          {aspectRatio} · {dimensions}
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-2.5 bg-[#FAF8F5] border-t border-[#E5E0D8]/60 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-stone-500">
          <span className="truncate max-w-[130px] font-medium" title={screenTitle}>
            {screenTitle}
          </span>
          <span>{generatedAt || '刚刚'}</span>
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
              if (onViewDetail) onViewDetail();
            }}
            className="py-1 px-2.5 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-50 text-stone-700 border border-[#E5E0D8] flex items-center gap-1"
          >
            <Eye className="w-3 h-3 text-[#B28C5A]" />
            <span>详情</span>
          </button>
        </div>
      </div>
    </div>
  );
};
