import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ScenePlanNodeData } from '../../types/creativeCanvas';
import { Film, RefreshCw, ChevronRight, CheckCircle2, Trash2, Edit2, Check, Copy } from 'lucide-react';

export const ScenePlanNode: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as ScenePlanNodeData & {
    onDelete?: () => void;
    onDuplicate?: () => void;
    onUpdate?: (updated: Partial<ScenePlanNodeData>) => void;
  };
  const selected = props.selected;

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(data.screenTitle || '');
  const [sellingPoint, setSellingPoint] = useState(data.coreSellingPoint || '');
  const [prompt, setPrompt] = useState(data.promptSuggestion || '');

  const formattedIndex = String(data.screenIndex || 1).padStart(2, '0');

  const handleSaveEdit = () => {
    setIsEditing(false);
    data.onUpdate?.({
      screenTitle: title,
      coreSellingPoint: sellingPoint,
      promptSuggestion: prompt
    });
  };

  return (
    <div
      className={`relative w-[340px] bg-white rounded-2xl p-4 shadow-lg border transition-all duration-200 ${
        selected
          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30 shadow-xl'
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
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-6 h-6 rounded-md bg-[#B28C5A]/10 text-[#8C6F43] font-mono text-xs font-bold flex items-center justify-center shrink-0">
            {formattedIndex}
          </span>
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs font-bold bg-[#FAF8F5] border border-[#B28C5A]/50 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#B28C5A]"
              placeholder="分镜标题..."
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={() => setIsEditing(true)}
              className="font-semibold text-xs text-[#2C2622] truncate max-w-[150px] cursor-pointer hover:text-[#B28C5A]"
              title="双击快速编辑标题"
            >
              {title || data.screenTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {isEditing ? (
            <button
              onClick={handleSaveEdit}
              className="p-1 rounded bg-[#B28C5A] text-white hover:bg-[#8C6F43] transition-colors"
              title="保存编辑"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 rounded hover:bg-[#FAF8F5] text-stone-500 hover:text-[#B28C5A] transition-colors"
              title="编辑分镜"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {data.onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDuplicate?.();
              }}
              className="p-1 rounded hover:bg-[#FAF8F5] text-stone-500 hover:text-[#B28C5A] transition-colors"
              title="复制分镜"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {data.onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.();
              }}
              className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600 transition-colors"
              title="删除分镜"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* C4A Version Bar */}
      <div className="flex items-center justify-between gap-1 text-[10px] font-mono mb-2 pb-1.5 border-b border-[#E5E0D8]/40">
        <span className="text-[#B28C5A] font-bold bg-[#FAF8F5] px-1.5 py-0.5 rounded border border-[#E5E0D8]/50">
          {data.assetSkuCode || `SKU-SCENE-${formattedIndex}`}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-stone-600 font-bold bg-stone-100 px-1.5 py-0.5 rounded">
            {data.assetVersionCode || 'V001'}
          </span>
          {data.productDnaVersionCode && (
            <span className="text-[#8C6F43] bg-[#B28C5A]/10 px-1.5 py-0.5 rounded border border-[#B28C5A]/20 font-bold" title={`Bound DNA Version: ${data.productDnaVersionId || ''}`}>
              {data.productDnaVersionCode}
            </span>
          )}
          {data.parentVersionId && (
            <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200" title={`Parent Version ID: ${data.parentVersionId}`}>
              P: {data.parentVersionId.slice(-4)}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-[10px] font-medium text-[#8C827A] uppercase block">画面目的 / 核心卖点</span>
          {isEditing ? (
            <textarea
              value={sellingPoint}
              onChange={(e) => setSellingPoint(e.target.value)}
              rows={2}
              className="w-full text-xs font-medium text-[#2C2622] bg-[#FAF8F5] border border-[#B28C5A]/50 rounded p-1.5 mt-0.5 outline-none focus:ring-1 focus:ring-[#B28C5A] resize-none"
              placeholder="核心卖点..."
            />
          ) : (
            <p
              onDoubleClick={() => setIsEditing(true)}
              className="text-[#2C2622] font-medium leading-snug line-clamp-2 mt-0.5 cursor-pointer hover:text-[#B28C5A]"
              title="双击编辑核心卖点"
            >
              {sellingPoint || data.coreSellingPoint}
            </p>
          )}
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
          {isEditing ? (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              className="w-full font-mono text-[11px] bg-[#F9F5EF] border border-[#B28C5A]/50 rounded p-1.5 mt-0.5 outline-none focus:ring-1 focus:ring-[#B28C5A] resize-none"
              placeholder="生成提示词..."
            />
          ) : (
            <p
              onDoubleClick={() => setIsEditing(true)}
              className="text-[#625B54] font-mono text-[11px] truncate bg-[#F9F5EF] p-1.5 rounded border border-[#E5E0D8]/50 mt-0.5 cursor-pointer hover:text-[#B28C5A]"
              title="双击编辑提示词"
            >
              {prompt || data.promptSuggestion}
            </p>
          )}
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
