import React, { useState, useRef, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  LocateFixed,
  Plus,
  CheckSquare,
  Square,
  Trash2,
  Copy,
  StickyNote,
  Film,
  Sparkles,
  Image as ImageIcon,
  ChevronDown,
  X
} from 'lucide-react';

interface CanvasToolbarProps {
  zoomLevel: number;
  selectedCount?: number;
  totalNodesCount?: number;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onDeleteSelected?: () => void;
  onDuplicateSelected?: () => void;
  onAddCustomNode?: (kind: 'note' | 'scene' | 'prompt' | 'image') => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  zoomLevel,
  selectedCount = 0,
  totalNodesCount = 0,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onDuplicateSelected,
  onAddCustomNode
}) => {
  const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleResetCenter = () => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 400 });
  };

  const handleFitView = () => {
    fitView({ duration: 400, padding: 0.2 });
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSelected = totalNodesCount > 0 && selectedCount === totalNodesCount;

  return (
    <div className="absolute bottom-6 left-6 z-20 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-xl p-1.5 rounded-2xl border border-[#E5E0D8] shadow-xl shadow-stone-900/5 select-none transition-all">
      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => zoomOut({ duration: 200 })}
          className="p-2 rounded-xl text-stone-600 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <span className="px-2 py-1 min-w-[50px] text-center font-mono text-xs font-bold text-stone-700">
          {Math.round(zoomLevel * 100)}%
        </span>

        <button
          onClick={() => zoomIn({ duration: 200 })}
          className="p-2 rounded-xl text-stone-600 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
          title="放大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-[#E5E0D8] mx-1" />

        <button
          onClick={handleFitView}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
          title="适应视图"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">适应视图</span>
        </button>

        <button
          onClick={handleResetCenter}
          className="p-2 rounded-xl text-stone-600 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
          title="回到原点"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      <div className="w-[1px] h-5 bg-[#E5E0D8] mx-0.5" />

      {/* Add Custom Node Button & Dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B28C5A] text-white hover:bg-[#8C6F43] active:scale-95 rounded-xl font-medium text-xs shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>添加节点</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
        </button>

        {showAddMenu && (
          <div className="absolute bottom-12 left-0 w-48 bg-white/95 backdrop-blur-xl border border-[#E5E0D8] rounded-xl shadow-2xl p-1.5 space-y-1 z-30 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[10px] font-bold text-stone-400 px-2 py-1 uppercase tracking-wider">
              选择新增节点类型
            </div>
            <button
              onClick={() => {
                onAddCustomNode?.('note');
                setShowAddMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-700 hover:bg-[#FAF8F5] hover:text-[#B28C5A] rounded-lg transition-colors text-left"
            >
              <div className="w-6 h-6 rounded bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <StickyNote className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold">企划便签</div>
                <div className="text-[10px] text-stone-400">文字想法与批注说明</div>
              </div>
            </button>

            <button
              onClick={() => {
                onAddCustomNode?.('scene');
                setShowAddMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-700 hover:bg-[#FAF8F5] hover:text-[#B28C5A] rounded-lg transition-colors text-left"
            >
              <div className="w-6 h-6 rounded bg-[#B28C5A]/15 text-[#8C6F43] flex items-center justify-center shrink-0">
                <Film className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold">自定义分镜</div>
                <div className="text-[10px] text-stone-400">添加新的电商场景屏</div>
              </div>
            </button>

            <button
              onClick={() => {
                onAddCustomNode?.('prompt');
                setShowAddMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-700 hover:bg-[#FAF8F5] hover:text-[#B28C5A] rounded-lg transition-colors text-left"
            >
              <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold">AI 绘图提示词</div>
                <div className="text-[10px] text-stone-400">灵感与画面生成指令</div>
              </div>
            </button>

            <button
              onClick={() => {
                onAddCustomNode?.('image');
                setShowAddMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-700 hover:bg-[#FAF8F5] hover:text-[#B28C5A] rounded-lg transition-colors text-left"
            >
              <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <ImageIcon className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold">参考图片节点</div>
                <div className="text-[10px] text-stone-400">提供画面视觉基准</div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Select All Button */}
      <button
        onClick={isAllSelected ? onClearSelection : onSelectAll}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
          isAllSelected
            ? 'bg-[#B28C5A]/15 text-[#8C6F43] border border-[#B28C5A]/30'
            : 'text-stone-700 hover:bg-[#F9F5EF] hover:text-[#B28C5A]'
        }`}
        title={isAllSelected ? '取消全选' : '全选所有节点 (Ctrl+A)'}
      >
        {isAllSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        <span>{isAllSelected ? '已全选' : '全选'}</span>
      </button>

      {/* Selection Operations (Visible when items selected) */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-150">
          <div className="w-[1px] h-4 bg-[#E5E0D8] mx-0.5" />

          <span className="text-[11px] font-mono font-bold text-[#B28C5A] bg-[#B28C5A]/10 px-2 py-0.5 rounded-lg border border-[#B28C5A]/20">
            已选 {selectedCount}
          </span>

          {onDuplicateSelected && (
            <button
              onClick={onDuplicateSelected}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-700 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
              title="复制选中节点"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">复制</span>
            </button>
          )}

          {onDeleteSelected && (
            <button
              onClick={onDeleteSelected}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-600 bg-rose-50/80 hover:bg-rose-100 hover:text-rose-700 active:scale-95 border border-rose-200/60 transition-all"
              title="删除选中节点 (Delete)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除 ({selectedCount})</span>
            </button>
          )}

          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all"
              title="取消选择"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
