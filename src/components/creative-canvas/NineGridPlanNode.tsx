import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { NineGridPlanNodeData } from '../../types/creativeCanvas';
import { Sparkles, LayoutGrid, RotateCw, ChevronRight, ImagePlus, Loader2 } from 'lucide-react';

export const NineGridPlanNode: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as NineGridPlanNodeData;
  const selected = props.selected;

  const isBatchRunning = data.batchProgress?.status === 'running';

  return (
    <div
      className={`w-[360px] bg-white rounded-2xl p-4 shadow-xl border transition-all duration-200 ${
        selected
          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/20 shadow-2xl'
          : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#E5E0D8]/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#F9F5EF] flex items-center justify-center text-[#B28C5A]">
            <LayoutGrid className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm text-[#2C2622]">九屏视觉企划</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] text-xs font-medium">
          <Sparkles className="w-3 h-3" />
          <span>{data.status === 'planning' ? '策划中' : '全案就绪'}</span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2.5">
        <div>
          <span className="text-[11px] font-medium text-[#8C827A] uppercase tracking-wider">企划主题</span>
          <h4 className="text-sm font-semibold text-[#2C2622] leading-snug mt-0.5">{data.themeTitle}</h4>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/40">
            <span className="text-[10px] text-[#8C827A] block">目标受众</span>
            <span className="font-medium text-[#2C2622] truncate block mt-0.5">{data.targetAudience}</span>
          </div>
          <div className="bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/40">
            <span className="text-[10px] text-[#8C827A] block">视觉调性</span>
            <span className="font-medium text-[#2C2622] truncate block mt-0.5">{data.overallStyle}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 bg-[#B28C5A]/10 text-[#8C6F43] rounded font-mono text-[11px] font-semibold">
              9 屏全案
            </span>
            <span className="text-[11px] text-[#8C827A]">{data.sceneDirection}</span>
          </div>
        </div>

        {/* Batch Image Generation Primary Callout */}
        <div className="pt-2 border-t border-[#E5E0D8]/60 space-y-2">
          {data.batchProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-stone-600 font-medium">
                <span>批量生成进度</span>
                <span className="font-mono font-bold text-[#B28C5A]">
                  {data.batchProgress.completed} / {data.batchProgress.total}
                </span>
              </div>
              <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden border border-[#E5E0D8]">
                <div
                  className="bg-[#B28C5A] h-full transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (data.batchProgress.completed / Math.max(1, data.batchProgress.total)) * 100
                    )}%`
                  }}
                />
              </div>
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onGenerateMissingImages?.();
            }}
            disabled={isBatchRunning}
            className="w-full py-2 px-3 bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isBatchRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>批量生成进行中...</span>
              </>
            ) : (
              <>
                <ImagePlus className="w-3.5 h-3.5" />
                <span>生成缺失画面 (九屏队列)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-3 pt-2.5 border-t border-[#E5E0D8]/60 flex items-center justify-between text-xs">
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onRegenerateAll?.();
          }}
          className="flex items-center gap-1 text-[#8C827A] hover:text-[#B28C5A] transition-colors"
        >
          <RotateCw className="w-3 h-3" />
          <span>重新策划九屏</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onViewFullPlan?.();
          }}
          className="flex items-center gap-0.5 font-medium text-[#B28C5A] hover:text-[#8C6F43] transition-colors"
        >
          <span>查看完整企划</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white"
      />
    </div>
  );
};
