import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { ImageGenerationNodeData } from '../../types/creativeCanvas';
import { Loader2 as Spinner, AlertTriangle, CheckCircle, Clock as ClockIcon, XCircle, Sliders as SlidersIcon } from 'lucide-react';

interface ImageGenerationNodeProps {
  data: ImageGenerationNodeData;
  selected?: boolean;
}

export const ImageGenerationNode: React.FC<ImageGenerationNodeProps> = ({ data, selected }) => {
  const {
    sceneIndex,
    screenTitle,
    model = 'google/gemini-3-pro-image-preview',
    aspectRatio = '3:4',
    referenceCount = 1,
    status = 'generating',
    startTime,
    taskId,
    errorMsg
  } = data;

  const getStatusBadge = () => {
    switch (status) {
      case 'queued':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            <ClockIcon className="w-3 h-3 animate-pulse" /> 排队中
          </span>
        );
      case 'preparing':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
            <Spinner className="w-3 h-3 animate-spin" /> 准备参数
          </span>
        );
      case 'generating':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-[#B28C5A]/10 text-[#B28C5A] border border-[#B28C5A]/30 px-2 py-0.5 rounded-full">
            <Spinner className="w-3 h-3 animate-spin" /> 渲染绘制中
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle className="w-3 h-3" /> 任务完成
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" /> 生成失败
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> 已取消
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`w-[260px] bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md select-none ${
        selected ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/20' : 'border-[#E5E0D8]'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!w-3 !h-3 !bg-[#B28C5A] !border-2 !border-white"
      />

      {/* Card Header */}
      <div className="p-3 border-b border-[#E5E0D8]/60 bg-[#FAF8F5] rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#F9F5EF] text-[#B28C5A] border border-[#E5E0D8] flex items-center justify-center font-bold text-xs">
            #{sceneIndex}
          </div>
          <span className="font-bold text-xs text-[#2C2A29] truncate max-w-[120px]">
            图片任务
          </span>
        </div>
        {getStatusBadge()}
      </div>

      {/* Content Body */}
      <div className="p-3 space-y-2 text-xs">
        <div>
          <span className="text-[10px] text-stone-400 font-bold block">分镜主题</span>
          <p className="font-semibold text-[#2C2A29] truncate mt-0.5">{screenTitle}</p>
        </div>

        <div className="bg-[#FAF8F5] p-2 rounded-xl border border-[#E5E0D8]/60 space-y-1 text-[11px]">
          <div className="flex justify-between text-stone-600">
            <span className="text-stone-400">使用的模型:</span>
            <span className="font-medium text-[#2C2A29] truncate max-w-[130px]" title={`${data.provider || 'openai'} / ${model}`}>
              {data.provider ? `${data.provider} / ${model}` : (model === 'gpt-image-2' ? 'openai / gpt-image-2' : model)}
            </span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span className="text-stone-400">画幅比例:</span>
            <span className="font-medium text-[#2C2A29]">{aspectRatio}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span className="text-stone-400">参考图数量:</span>
            <span className="font-medium text-[#2C2A29]">{referenceCount} 张主图</span>
          </div>
        </div>

        {status === 'generating' && (
          <div className="pt-1 flex items-center gap-2 text-amber-700 bg-amber-50/80 p-2 rounded-xl border border-amber-200/60">
            <Spinner className="w-4 h-4 animate-spin shrink-0 text-[#B28C5A]" />
            <span className="text-[10px] leading-tight font-medium">
              正在调用旗舰渲染引擎生成画面，请稍候...
            </span>
          </div>
        )}

        {status === 'error' && errorMsg && (
          <div className="pt-1 text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200 text-[10px] leading-relaxed break-words">
            <span className="font-bold block mb-0.5">错误摘要：</span>
            {errorMsg}
          </div>
        )}

        <div className="pt-1 flex items-center justify-between text-[10px] text-stone-400 border-t border-[#E5E0D8]/40">
          <span>{startTime || '刚刚'}</span>
          {taskId && <span className="font-mono text-[9px]">ID: {taskId.slice(-6)}</span>}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!w-3 !h-3 !bg-[#B28C5A] !border-2 !border-white"
      />
    </div>
  );
};
