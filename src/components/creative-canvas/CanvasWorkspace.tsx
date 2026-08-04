import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useOnViewportChange,
  useReactFlow,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WelcomeNode } from './WelcomeNode';
import { ProductImageNode } from './ProductImageNode';
import { ProductDnaNode } from './ProductDnaNode';
import { NineGridPlanNode } from './NineGridPlanNode';
import { ScenePlanNode } from './ScenePlanNode';
import { ImageGenerationNode } from './ImageGenerationNode';
import { GeneratedImageNode } from './GeneratedImageNode';
import { NoteNode } from './NoteNode';
import { CanvasToolbar } from './CanvasToolbar';
import { CheckSquare, Square, Trash2, Copy, X, Upload } from 'lucide-react';

interface CanvasWorkspaceProps {
  workspaceId?: string;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  selectedNodeId?: string | null;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onDeleteSelected?: () => void;
  onDuplicateSelected?: () => void;
  onAddCustomNode?: (kind: 'note' | 'scene' | 'prompt' | 'image') => void;
  onUploadFile?: (file: File) => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  selectedNodeId,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onDuplicateSelected,
  onAddCustomNode,
  onUploadFile
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isCanvasDragging, setIsCanvasDragging] = useState<boolean>(false);
  const { fitView } = useReactFlow();

  const selectedCount = useMemo(() => nodes.filter(n => n.selected).length, [nodes]);
  const totalNodesCount = nodes.length;

  // Auto-focus and smooth pan on selected node
  useEffect(() => {
    if (selectedNodeId) {
      const exists = nodes.some(n => n.id === selectedNodeId);
      if (exists) {
        try {
          fitView({ nodes: [{ id: selectedNodeId }], duration: 350, maxZoom: 1.15 });
        } catch (e) {}
      }
    }
  }, [selectedNodeId, fitView]);

  // Global clipboard paste event listener (Ctrl+V) for uploading master image
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file && onUploadFile) {
            e.preventDefault();
            onUploadFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onUploadFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsCanvasDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCanvasDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCanvasDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/') && onUploadFile) {
      onUploadFile(file);
    }
  };

  const nodeTypes = useMemo(
    () => ({
      welcomeNode: WelcomeNode,
      productImageNode: ProductImageNode,
      productDnaNode: ProductDnaNode,
      nineGridPlanNode: NineGridPlanNode,
      scenePlanNode: ScenePlanNode,
      imageGenerationNode: ImageGenerationNode,
      generatedImageNode: GeneratedImageNode,
      noteNode: NoteNode,
      welcome: WelcomeNode,
      productImage: ProductImageNode,
      productDna: ProductDnaNode,
      nineGridPlan: NineGridPlanNode,
      scenePlan: ScenePlanNode,
      imageGeneration: ImageGenerationNode,
      generatedImage: GeneratedImageNode,
      note: NoteNode
    }),
    []
  );

  // Keyboard shortcut listener for Ctrl+A and Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, or contentEditable element
      const activeElement = document.activeElement;
      const isInput =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        onSelectAll?.();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedCount > 0) {
          e.preventDefault();
          onDeleteSelected?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectAll, onDeleteSelected, selectedCount]);

  // Track viewport changes for zoom level display
  useOnViewportChange({
    onChange: useCallback((viewport: { zoom: number }) => {
      setZoomLevel(viewport.zoom);
    }, [])
  });

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-full h-full bg-[#FAF8F5] overflow-hidden select-none transition-colors ${
        isCanvasDragging ? 'bg-[#F4EFE6]' : ''
      }`}
    >
      {/* Drag Over Overlay Banner */}
      {isCanvasDragging && (
        <div className="absolute inset-0 z-40 bg-[#B28C5A]/15 backdrop-blur-xs border-4 border-dashed border-[#B28C5A] flex flex-col items-center justify-center text-[#2C2A29] p-6 animate-fadeIn pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-white shadow-2xl border border-[#B28C5A] text-[#B28C5A] flex items-center justify-center mb-3 animate-bounce">
            <Upload className="w-8 h-8" />
          </div>
          <h2 className="font-serif font-bold text-xl mb-1">释放文件即可上传产品主图</h2>
          <p className="text-xs text-stone-600 bg-white/90 px-3 py-1 rounded-full shadow-xs">
            支持直接将 PNG, JPG, WEBP 文件拖拽放至画布任意位置
          </p>
        </div>
      )}
      {/* Top Floating Selection Inspector Bar */}
      {selectedCount > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-[#2C2622]/95 backdrop-blur-xl text-white px-4 py-2 rounded-2xl shadow-2xl border border-[#B28C5A]/40 text-xs animate-in fade-in slide-in-from-top-4 duration-200">
          <span className="font-mono font-bold text-[#D4AF37]">
            已选择 {selectedCount} / {totalNodesCount} 个节点
          </span>

          <div className="w-[1px] h-4 bg-stone-600" />

          <button
            onClick={selectedCount === totalNodesCount ? onClearSelection : onSelectAll}
            className="flex items-center gap-1.5 hover:text-[#D4AF37] transition-colors"
            title="全选 / 反选 (Ctrl+A)"
          >
            {selectedCount === totalNodesCount ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            <span>{selectedCount === totalNodesCount ? '取消全选' : '全选 (Ctrl+A)'}</span>
          </button>

          {onDuplicateSelected && (
            <button
              onClick={onDuplicateSelected}
              className="flex items-center gap-1.5 hover:text-[#D4AF37] transition-colors"
              title="复制选中节点"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>复制</span>
            </button>
          )}

          {onDeleteSelected && (
            <button
              onClick={onDeleteSelected}
              className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 transition-colors font-bold"
              title="删除选中节点 (Delete)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除选中</span>
            </button>
          )}

          <div className="w-[1px] h-4 bg-stone-600" />

          <button
            onClick={onClearSelection}
            className="p-1 text-stone-400 hover:text-white rounded hover:bg-stone-800 transition-colors"
            title="关闭选择"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        onNodeClick={onNodeClick}
        className="w-full h-full"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#E5E0D8"
          className="bg-[#FAF8F5]"
        />
        <CanvasToolbar
          zoomLevel={zoomLevel}
          selectedCount={selectedCount}
          totalNodesCount={totalNodesCount}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onDeleteSelected={onDeleteSelected}
          onDuplicateSelected={onDuplicateSelected}
          onAddCustomNode={onAddCustomNode}
        />
      </ReactFlow>
    </div>
  );
};
