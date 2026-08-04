import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Dna, Loader2, AlertCircle, Layers, ShieldCheck, ChevronRight } from 'lucide-react';
import { ProductDnaNodeData } from '../../types/creativeCanvas';
import { mapExistingDnaResultToCanvasNode } from '../../adapters/creativeCanvasDnaAdapter';

export const ProductDnaNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as ProductDnaNodeData;
  const summary = mapExistingDnaResultToCanvasNode(nodeData?.dna);

  const isAnalyzing = nodeData?.status === 'analyzing';
  const isError = nodeData?.status === 'error';

  return (
    <div
      className={`relative w-84 p-4 rounded-2xl bg-white/95 backdrop-blur-md border transition-all shadow-lg ${
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
            <Dna className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-xs text-[#2C2A29]">产品 DNA 节点</h3>
            <span className="text-[10px] text-stone-400 block">AI 视觉语义解析</span>
          </div>
        </div>

        {isAnalyzing && (
          <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium border border-amber-200">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" /> 分析中...
          </span>
        )}
        {isError && (
          <span className="flex items-center gap-1 text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md font-medium border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-500" /> 分析失败
          </span>
        )}
        {nodeData?.status === 'completed' && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-500" /> 已解析
          </span>
        )}
      </div>

      {/* Content */}
      {isAnalyzing && (
        <div className="py-6 flex flex-col items-center justify-center text-center text-stone-500">
          <Loader2 className="w-6 h-6 animate-spin text-[#B28C5A] mb-2" />
          <p className="text-xs font-bold text-[#2C2A29]">正在提取产品 DNA...</p>
          <p className="text-[10px] text-stone-400 mt-1">智能解析造型、色彩、材质与关键结构特征</p>
        </div>
      )}

      {isError && (
        <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 text-xs text-rose-800">
          <p className="font-bold mb-1">DNA 提取未完成：</p>
          <p className="text-[11px] leading-relaxed text-rose-700">{nodeData.errorMsg || '请求出现异常，请重新尝试'}</p>
        </div>
      )}

      {!isAnalyzing && !isError && (
        <div className="space-y-2.5 text-xs text-stone-700">
          {/* C4A-3 Version Control Section */}
          <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#B28C5A]/30 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-stone-500 font-medium flex items-center gap-1">
                <Dna className="w-3 h-3 text-[#B28C5A]" /> DNA 编号:
              </span>
              <span className="font-mono font-bold text-[#2C2A29]">
                {nodeData.dnaCode || 'DNA-DEFAULT'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-stone-500 font-medium">当前版本:</span>
              <span className="font-mono font-bold text-[#B28C5A] bg-[#B28C5A]/10 px-2 py-0.5 rounded border border-[#B28C5A]/20">
                {nodeData.versionCode || 'DNA-V001'}
              </span>
            </div>
            {nodeData.productDnaVersionId && (
              <div className="text-[9px] text-stone-400 font-mono truncate pt-0.5" title={nodeData.productDnaVersionId}>
                ID: {nodeData.productDnaVersionId}
              </div>
            )}
            {nodeData.versions && nodeData.versions.length > 1 && (
              <div className="pt-1 border-t border-[#E5E0D8] flex items-center gap-1">
                <span className="text-[10px] text-stone-400">切换版本:</span>
                <div className="flex flex-wrap gap-1">
                  {nodeData.versions.map(v => (
                    <button
                      key={v.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        nodeData.onSelectDnaVersion?.(v.id);
                      }}
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors ${
                        v.id === nodeData.productDnaVersionId
                          ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-[#B28C5A]'
                      }`}
                    >
                      {v.version_code || `V00${v.version_number}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-[#F9F5EF]/60 p-2 rounded-xl border border-[#E5E0D8]/40">
            <span className="text-stone-400 text-[11px]">品类识别:</span>
            <span className="font-bold text-[#2C2A29]">{summary.category}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-stone-50 p-2 rounded-xl border border-[#E5E0D8]/40">
              <span className="text-stone-400 text-[10px] block mb-0.5">主要基调:</span>
              <span className="font-medium text-xs text-[#2C2A29] truncate block">{summary.primaryColor}</span>
            </div>
            <div className="bg-stone-50 p-2 rounded-xl border border-[#E5E0D8]/40">
              <span className="text-stone-400 text-[10px] block mb-0.5">强约束规则:</span>
              <span className="font-bold text-xs text-[#B28C5A] block">{summary.lockedRulesCount} 条锁定</span>
            </div>
          </div>

          {summary.materials.length > 0 && (
            <div className="bg-stone-50 p-2 rounded-xl border border-[#E5E0D8]/40">
              <span className="text-stone-400 text-[10px] block mb-1">材质特征:</span>
              <div className="flex flex-wrap gap-1">
                {summary.materials.slice(0, 3).map((mat, idx) => (
                  <span key={idx} className="bg-white text-stone-700 text-[10px] px-1.5 py-0.5 rounded border border-[#E5E0D8]">
                    {mat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary.keyStructures.length > 0 && (
            <div className="bg-stone-50 p-2 rounded-xl border border-[#E5E0D8]/40">
              <span className="text-stone-400 text-[10px] block mb-1">结构识别:</span>
              <p className="text-[11px] text-stone-600 line-clamp-2 leading-relaxed">
                {summary.keyStructures.join(' · ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!isAnalyzing && !isError && nodeData?.onViewFullDna && (
        <div className="mt-3 pt-2.5 border-t border-[#E5E0D8]/40 flex items-center justify-between">
          <span className="text-[10px] text-stone-400">{nodeData.analyzedAt || '已同步'}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onViewFullDna?.();
            }}
            className="flex items-center gap-1 text-xs font-bold text-[#B28C5A] hover:text-[#9E7A4A] transition-colors"
          >
            <span>查看完整 DNA</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Right} id="source" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
    </div>
  );
};
