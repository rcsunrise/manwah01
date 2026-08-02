import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Sparkles, CheckCircle2, Move } from 'lucide-react';
import { WelcomeNodeData } from '../../types/creativeCanvas';

export const WelcomeNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WelcomeNodeData;

  return (
    <div
      className={`relative w-80 p-5 rounded-2xl bg-white/95 backdrop-blur-md border transition-all shadow-lg ${
        selected
          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30 shadow-[#B28C5A]/10'
          : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
      }`}
    >
      <Handle type="target" position={Position.Left} id="target" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
      
      {/* Node Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E5E0D8]/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8]/50">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-sm text-[#2C2A29]">
              {nodeData?.title || '视觉企划画布'}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                {nodeData?.status || '画布已连接'}
              </span>
            </div>
          </div>
        </div>
        <div className="text-stone-300 hover:text-stone-400 cursor-grab active:cursor-grabbing p-1">
          <Move className="w-4 h-4" />
        </div>
      </div>

      {/* Node Body */}
      <p className="text-xs text-stone-600 leading-relaxed font-sans">
        {nodeData?.description ||
          '上传产品图片后，智能体生成的产品 DNA、九屏方案和渲染结果将在这里形成节点。'}
      </p>

      {/* Footer Info */}
      <div className="mt-4 pt-3 border-t border-[#E5E0D8]/40 flex items-center justify-between text-[10px] text-stone-400">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 独立交互节点
        </span>
        <span className="font-mono text-[#B28C5A]/80 font-medium">可选中 / 可拖拽</span>
      </div>

      <Handle type="source" position={Position.Right} id="source" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
    </div>
  );
};
