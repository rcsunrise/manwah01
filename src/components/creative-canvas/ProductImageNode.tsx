import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Image, RotateCw, CheckCircle2 } from 'lucide-react';
import { ProductImageNodeData } from '../../types/creativeCanvas';

export const ProductImageNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as ProductImageNodeData;

  return (
    <div
      className={`relative w-80 p-4 rounded-2xl bg-white/95 backdrop-blur-md border transition-all shadow-lg ${
        selected
          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30 shadow-[#B28C5A]/10'
          : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
      }`}
    >
      <Handle type="target" position={Position.Left} id="target" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />

      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#E5E0D8]/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8]/50">
            <Image className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-xs text-[#2C2A29]">产品主图</h3>
            <span className="text-[10px] text-stone-400 block truncate max-w-[140px]">
              {nodeData?.fileName || 'product_photo.jpg'}
            </span>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 已就绪
        </span>
      </div>

      {/* Image Preview Container */}
      <div className="relative w-full h-44 bg-stone-100 rounded-xl overflow-hidden border border-[#E5E0D8]/80 group flex items-center justify-center">
        {nodeData?.imageUrl ? (
          <img
            src={nodeData.imageUrl}
            alt={nodeData.fileName || 'Product Image'}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="text-stone-400 text-xs flex flex-col items-center gap-1">
            <Image className="w-6 h-6 opacity-40" />
            <span>无图像预览</span>
          </div>
        )}
      </div>

      {/* Footer Info & Actions */}
      <div className="mt-3 pt-2.5 border-t border-[#E5E0D8]/40 flex items-center justify-between text-[10px] text-stone-500">
        <span>{nodeData?.uploadedAt || '刚刚'}</span>
        {nodeData?.onReanalyze && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onReanalyze?.();
            }}
            className="flex items-center gap-1 text-[#B28C5A] hover:text-[#9E7A4A] font-bold px-2 py-1 rounded-md bg-[#F9F5EF] hover:bg-[#F2EBDC] transition-all"
          >
            <RotateCw className="w-3 h-3" />
            <span>重新分析</span>
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="source" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
    </div>
  );
};
