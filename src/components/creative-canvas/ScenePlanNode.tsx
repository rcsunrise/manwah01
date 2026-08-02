import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ScenePlanNodeData } from '../../types/creativeCanvas';
import { Film, RefreshCw, ChevronRight, CheckCircle2 } from 'lucide-react';

export const ScenePlanNode: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as ScenePlanNodeData;
  const selected = props.selected;

  const formattedIndex = String(data.screenIndex).padStart(2, '0');

  return (
    <div
      className={`w-[340px] bg-white rounded-2xl p-4 shadow-lg border transition-all duration-200 ${
        selected
          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/20 shadow-xl'
          : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#E5E0D8]/60">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-[#B28C5A]/10 text-[#8C6F43] font-mono text-xs font-bold flex items-center justify-center">
            {formattedIndex}
          </span>
          <span className="font-semibold text-xs text-[#2C2622] truncate max-w-[170px]">
            {data.screenTitle}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-[#10B981] font-medium bg-[#10B981]/10 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          <span>策划完成</span>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-[10px] font-medium text-[#8C827A] uppercase block">画面目的 / 核心卖点</span>
          <p className="text-[#2C2622] font-medium leading-snug line-clamp-2 mt-0.5">
            {data.coreSellingPoint}
          </p>
        </div>

        <div className="bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/40 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#8C827A]">构图视角</span>
            <span className="text-[#2C2622] font-medium truncate max-w-[180px]">{data.visualComposition}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#8C827A]">光影氛围</span>
            <span className="text-[#2C2622] font-medium truncate max-w-[180px]">{data.lightingAndAtmosphere}</span>
          </div>
        </div>

        <div>
          <span className="text-[10px] text-[#8C827A] block">生成提示词摘要</span>
          <p className="text-[#625B54] font-mono text-[11px] truncate bg-[#F9F5EF] p-1.5 rounded border border-[#E5E0D8]/50 mt-0.5">
            {data.promptSuggestion}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-[#E5E0D8]/60 flex items-center justify-between text-xs">
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onReplanScene?.();
          }}
          className="flex items-center gap-1 text-[#8C827A] hover:text-[#B28C5A] transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>重新策划本屏</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onViewDetail?.();
          }}
          className="flex items-center gap-0.5 font-medium text-[#B28C5A] hover:text-[#8C6F43] transition-colors"
        >
          <span>查看详情</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white"
      />
    </div>
  );
};
