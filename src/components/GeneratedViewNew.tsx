import React, { useState, useRef, useEffect } from 'react';
import { GenerationTask } from '../types';
import { Download, ImageIcon, ZoomIn, ZoomOut, RotateCcw, X, Maximize2, Sparkles, CheckSquare, Square, Trash2, ArrowLeftSquare, Clock } from './IconsNew';

import { generateImageFileName, NamingPreset } from '../utils/fileHelperNew';

interface GeneratedViewProps {
  tasks: GenerationTask[];
  isGenerating: boolean;
  onSetAsReference: (imageUrl: string) => void;
  onDeleteTask: (taskId: string) => void;
  onGenerateVideo?: (imageUrl: string) => void;
  namingPreset?: NamingPreset;
  customPrefix?: string;
  expectedFrontPx?: number;
}

const GenerationTimer: React.FC<{ startTime?: number }> = ({ startTime }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!startTime) return;
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-1 text-[10px] font-mono text-brand-gold bg-brand-gold/10 px-2 py-1 rounded-full mt-2">
            <Clock className="w-3 h-3" />
            <span>{formatTime(elapsed)}</span>
        </div>
    );
};

export const GeneratedView: React.FC<GeneratedViewProps> = ({ tasks, isGenerating, onSetAsReference, onDeleteTask, onGenerateVideo, namingPreset = 'detailed', customPrefix = '', expectedFrontPx }) => {
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Auto-focus logic: if a new task finishes successfully and it's the only one or top one?
  // With history, auto-focus might be annoying if it jumps around. Let's disable auto-focus for now or only if it's the very first one.
  // Actually, let's keep it simple: No auto-focus on history updates to avoid jarring UX.

  const focusedTask = focusedTaskId !== null ? tasks.find(t => t.id === focusedTaskId) : null;

  let viewMode: 'empty' | 'single' | 'grid' = 'empty';
  if (tasks.length === 0) viewMode = 'empty';
  else if (focusedTask) viewMode = 'single';
  else viewMode = 'grid';

  const handleDownload = async (task: GenerationTask) => {
    if (!task.result) return;
    const fileName = generateImageFileName(
      namingPreset as NamingPreset, 
      customPrefix, 
      task.model || 'unknown', 
      task.resolution || 'unknown'
    );
    
    try {
      const imageBlob = await fetch(task.result.imageUrl).then(r => r.blob());
      const link = document.createElement('a');
      link.href = URL.createObjectURL(imageBlob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Failed to download image:", error);
      // Fallback
      const link = document.createElement('a');
      link.href = task.result.imageUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allSuccessfulIds = tasks
      .filter(t => t.status === 'success')
      .map(t => t.id);
    
    if (selectedIds.length === allSuccessfulIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allSuccessfulIds);
    }
  };

  const handleBulkDownload = () => {
    selectedIds.forEach(id => {
      const task = tasks.find(t => t.id === id);
      if (task?.result) {
        handleDownload(task);
      }
    });
  };

  if (viewMode === 'empty') {
    return (
      <div className="h-full flex flex-col bg-white rounded-[3rem] border border-brand-gold/10 shadow-2xl items-center justify-center p-12 text-center select-none relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-gold/5 via-transparent to-transparent pointer-events-none opacity-50"></div>
         
         {/* Dynamic Ghosting Placeholder */}
         {expectedFrontPx && (
             <div className="absolute bottom-1/4 w-full flex flex-col items-center opacity-30 pointer-events-none">
                 <div 
                    className="h-32 bg-purple-200/50 border-2 border-dashed border-purple-400 rounded-lg transition-all duration-500 ease-in-out flex items-center justify-center"
                    style={{ width: `${expectedFrontPx}px` }}
                 >
                     <span className="text-purple-600 font-mono text-sm font-bold tracking-widest">
                         {expectedFrontPx}px
                     </span>
                 </div>
                 <div className="mt-2 text-[10px] text-purple-500 font-bold uppercase tracking-widest">
                     Expected Front View Width
                 </div>
             </div>
         )}

         <div className="w-32 h-32 rounded-full bg-brand-beige mx-auto mb-10 flex items-center justify-center border-2 border-brand-gold/10 shadow-inner group transition-transform duration-700 hover:rotate-12 relative z-10">
            <Sparkles className="w-14 h-14 text-brand-gold/40 transition-colors duration-500 group-hover:text-brand-gold" />
         </div>
         <div className="space-y-4 max-w-md relative z-10">
           <h2 className="font-serif text-3xl font-bold text-brand-charcoal">设计成果将在此时呈现</h2>
           <p className="text-stone-400 font-light leading-relaxed">
             请在左侧配置您的空间场景与产品渠道，启动 AI 引擎以生成高品质室内视觉方案。
           </p>
           <div className="pt-8">
              <p className="font-serif italic text-brand-gold text-lg">"Where Craftsmanship Meets Artificial Intelligence"</p>
           </div>
         </div>
      </div>
    );
  }

  if (viewMode === 'single' && focusedTask) {
    return (
        <SingleImageView 
            task={focusedTask} 
            onBack={() => setFocusedTaskId(null)}
            onDownload={() => focusedTask.result && handleDownload(focusedTask)}
            onSetAsReference={() => focusedTask.result && onSetAsReference(focusedTask.result.imageUrl)}
            onGenerateVideo={onGenerateVideo && focusedTask.result ? () => onGenerateVideo(focusedTask.result!.imageUrl) : undefined}
        />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-[3rem] border border-brand-gold/10 shadow-2xl overflow-hidden relative">
        <div className="px-10 py-8 border-b border-brand-beige flex justify-between items-center bg-white z-10">
            <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-brand-gold" />
                <h2 className="font-serif font-bold text-brand-charcoal text-2xl">
                    可视化方案展示 <span className="text-brand-gold/40 text-sm font-sans font-normal ml-2">Rendering Gallery</span>
                </h2>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em]">{tasks.length} Results</div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-brand-beige/30 custom-scrollbar pb-32">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {tasks.map(task => {
                    const isSelected = selectedIds.includes(task.id);
                    const canSelect = task.status === 'success';

                    return (
                        <div 
                            key={task.id} 
                            className={`flex flex-col bg-white rounded-[2.5rem] border p-2 transition-all duration-500 group relative ${
                                isSelected ? 'border-brand-gold shadow-xl shadow-brand-gold/10 scale-[1.03]' : 'border-white premium-shadow hover:scale-[1.02]'
                            }`}
                        >
                            {/* Delete Button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                                className="absolute top-6 right-6 z-20 p-2 rounded-xl bg-white/80 text-stone-300 hover:text-red-500 hover:bg-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                title="Delete Result"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>

                            {/* Selection Checkbox */}
                            {canSelect && (
                                <button 
                                    onClick={() => toggleSelection(task.id)}
                                    className={`absolute top-6 left-6 z-20 p-2 rounded-xl transition-all duration-300 ${
                                        isSelected ? 'bg-brand-gold text-white scale-110 shadow-lg' : 'bg-white/80 text-stone-300 hover:text-brand-gold hover:bg-white backdrop-blur-sm'
                                    }`}
                                >
                                    {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                </button>
                            )}

                            <div className="px-6 py-4 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-serif font-bold transition-colors ${isSelected ? 'text-brand-gold' : 'text-brand-charcoal'}`}>
                                        {task.channelName}
                                    </span>
                                    {task.isBetaRedraw && (
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase tracking-wider border border-blue-200" title="Beta Phase Redraw Applied">
                                            Beta
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[9px] px-3 py-1 rounded-full font-bold tracking-widest uppercase shadow-sm ${
                                    task.status === 'success' ? 'bg-brand-gold text-brand-charcoal' :
                                    task.status === 'generating' ? 'bg-brand-charcoal text-white' :
                                    'bg-stone-100 text-stone-400'
                                }`}>
                                    {task.status}
                                </span>
                            </div>
                            
                            <div className="aspect-[4/5] relative bg-brand-beige rounded-[2rem] overflow-hidden flex items-center justify-center">
                                {task.result ? (
                                    <>
                                        <img 
                                            src={task.result.imageUrl} 
                                            alt={task.channelName} 
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer"
                                            onClick={() => setFocusedTaskId(task.id)}
                                        />
                                        <div className="absolute inset-0 bg-brand-charcoal/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <div className="px-6 py-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white text-xs font-bold flex items-center gap-2">
                                                <Maximize2 className="w-4 h-4" /> Expand Details
                                            </div>
                                        </div>
                                    </>
                                ) : task.status === 'generating' ? (
                                    <div className="flex flex-col items-center gap-5">
                                        <div className="relative">
                                            <div className="w-16 h-16 border-4 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Sparkles className="w-6 h-6 text-brand-gold animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="text-center space-y-1 flex flex-col items-center">
                                            <span className="text-sm font-serif italic text-brand-charcoal">Designing Experience...</span>
                                            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Applying AI Fusion</p>
                                            <GenerationTimer startTime={task.startTime} />
                                        </div>
                                    </div>
                                ) : task.status === 'waiting' ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-1 bg-stone-100 rounded-full overflow-hidden relative">
                                            <div className="absolute top-0 left-0 h-full w-1/3 bg-brand-gold rounded-full animate-[progress_2s_ease-in-out_infinite]"></div>
                                        </div>
                                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">In Design Queue</span>
                                    </div>
                                ) : (
                                    <div className="px-10 text-center">
                                        <X className="w-10 h-10 text-red-300 mx-auto mb-3" />
                                        <span className="text-xs text-red-500 font-bold uppercase tracking-widest">{task.error || 'Rendering Failed'}</span>
                                    </div>
                                )}
                            </div>
                            {task.result && (
                                <div className="mt-2 flex flex-col gap-1 px-2 text-[9px] text-stone-400 font-mono">
                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                        <span>⏱ {task.duration ? task.duration.toFixed(1) : '--'}s</span>
                                        <span>🤖 {task.model?.includes('pro') ? 'PRO' : task.model?.includes('lite') ? 'LITE' : 'STD'}</span>
                                        <span>📏 {task.resolution || '未知'}</span>
                                        {task.pointsUsed !== undefined && <span>🪙 {(task.pointsUsed / 10000).toFixed(2)}W</span>}
                                    </div>
                                    {task.cropRetentionRate !== undefined && (
                                        <div className={task.cropRetentionRate >= 95 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                                            🎯 画面完整度: {task.cropRetentionRate}% ({task.finalFitModeUsed === 'fill' ? '100%保留/无裁切' : '裁切'})
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Bulk Action Bar - Floating at bottom */}
        {selectedIds.length > 0 && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[30] animate-slide-up">
                <div className="bg-brand-charcoal/90 backdrop-blur-xl rounded-full px-8 py-4 shadow-2xl border border-white/10 flex items-center gap-8 min-w-[400px]">
                    <div className="flex flex-col">
                        <span className="text-white text-xs font-bold">已选择 {selectedIds.length} 项成果</span>
                        <button onClick={handleSelectAll} className="text-[10px] text-brand-gold font-bold uppercase tracking-widest text-left hover:underline">
                            {selectedIds.length === tasks.filter(t => t.status === 'success').length ? '取消全选' : '选择全部成功方案'}
                        </button>
                    </div>
                    
                    <div className="h-8 w-px bg-white/10"></div>
                    
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setSelectedIds([])}
                            className="p-3 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-all"
                            title="清除选择"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={handleBulkDownload}
                            className="flex items-center gap-3 px-6 py-3 bg-brand-gold hover:bg-white hover:text-brand-charcoal text-brand-charcoal rounded-full text-xs font-bold transition-all shadow-lg shadow-brand-gold/20"
                        >
                            <Download className="w-4 h-4" />
                            下载所选方案
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

const DimensionOverlay: React.FC<{ dimensions: { width: number, depth: number, height: number } }> = ({ dimensions }) => {
    const projWidth = Math.round(dimensions.width * 0.707 + dimensions.depth * 0.707);

    return (
        <div className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {/* Front View Dimension (Top Middle Cell) */}
            <div className="absolute top-[4%] left-[33.33%] w-[33.33%] flex justify-center">
                <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-black/5 text-brand-charcoal text-[11px] font-bold font-mono tracking-wider">
                    W: {dimensions.width}mm
                </div>
            </div>

            {/* Side View Dimension (Top Left Cell) */}
            <div className="absolute top-[4%] left-0 w-[33.33%] flex justify-center">
                <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-black/5 text-brand-charcoal text-[11px] font-bold font-mono tracking-wider">
                    D: {dimensions.depth}mm
                </div>
            </div>

            {/* Height Dimension (Top Right Cell) */}
            <div className="absolute top-[4%] left-[66.66%] w-[33.33%] flex justify-center">
                <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-black/5 text-brand-charcoal text-[11px] font-bold font-mono tracking-wider">
                    H: {dimensions.height}mm
                </div>
            </div>

            {/* 45 Degree View Dimension (Bottom Left Cell) */}
            <div className="absolute top-[54%] left-0 w-[33.33%] flex justify-center">
                <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-black/5 text-brand-charcoal text-[11px] font-bold font-mono tracking-wider">
                    Proj: {projWidth}mm
                </div>
            </div>

            {/* Back View Dimension (Bottom Middle Cell) */}
            <div className="absolute top-[54%] left-[33.33%] w-[33.33%] flex justify-center">
                <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-black/5 text-brand-charcoal text-[11px] font-bold font-mono tracking-wider">
                    W: {dimensions.width}mm
                </div>
            </div>

            {/* Right 45 Degree View Dimension (Bottom Right Cell) */}
            <div className="absolute top-[54%] left-[66.66%] w-[33.33%] flex justify-center">
                <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-black/5 text-brand-charcoal text-[11px] font-bold font-mono tracking-wider">
                    Proj: {projWidth}mm
                </div>
            </div>
        </div>
    );
};

const SingleImageView: React.FC<{ 
    task: GenerationTask; 
    onBack: () => void;
    onDownload: () => void;
    onSetAsReference: () => void;
    onGenerateVideo?: () => void;
}> = ({ task, onBack, onDownload, onSetAsReference, onGenerateVideo }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.5, 5));
    const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.5, 0.5));
    const handleResetZoom = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const onWheel = (e: React.WheelEvent) => {
        const delta = -e.deltaY;
        const zoomFactor = 0.002;
        setScale(Math.min(Math.max(0.5, scale + delta * zoomFactor), 5));
    };

    const onMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            e.preventDefault();
            setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    return (
        <div className="h-full flex flex-col bg-white rounded-[3rem] border border-brand-gold/10 shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b border-brand-beige flex justify-between items-center bg-white z-10">
                <div className="flex items-center gap-5">
                    <button onClick={onBack} className="p-3 bg-brand-beige hover:bg-brand-gold hover:text-brand-charcoal rounded-full transition-all text-brand-gold shadow-sm">
                        <RotateCcw className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="font-serif font-bold text-brand-charcoal text-2xl">{task.channelName}</h2>
                            {task.isBetaRedraw && (
                                <span className="text-[10px] px-2 py-1 rounded bg-blue-100 text-blue-700 font-bold uppercase tracking-wider border border-blue-200" title="Beta Phase Redraw Applied">
                                    Beta Redraw
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] text-brand-gold font-bold uppercase tracking-[0.2em] mt-1">Refined Visualization Result</p>
                    </div>
                </div>
                {task.result && (
                    <div className="flex items-center gap-3">
                        {onGenerateVideo && (
                            <button
                                onClick={onGenerateVideo}
                                className="flex items-center gap-2 px-6 py-3 text-xs font-bold text-brand-charcoal bg-brand-beige hover:bg-brand-gold hover:text-white rounded-full transition-all border border-brand-gold/20 shadow-sm group"
                                title="制作动画 (Veo)"
                            >
                                <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                制作动画
                            </button>
                        )}
                        <button
                            onClick={onSetAsReference}
                            className="flex items-center gap-2 px-6 py-3 text-xs font-bold text-brand-charcoal bg-brand-beige hover:bg-brand-gold hover:text-white rounded-full transition-all border border-brand-gold/20 shadow-sm group"
                            title="回传至产品通道并替换素材"
                        >
                            <ArrowLeftSquare className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            设为参考图
                        </button>
                        <button
                            onClick={onDownload}
                            className="flex items-center gap-3 px-8 py-3 text-xs font-bold text-white bg-brand-charcoal hover:bg-brand-gold hover:text-brand-charcoal rounded-full transition-all border border-brand-gold/20 shadow-xl"
                        >
                            <Download className="w-4 h-4" />
                            Download Portfolio Piece
                        </button>
                    </div>
                )}
            </div>

            <div 
                className="flex-1 relative bg-brand-beige overflow-hidden flex items-center justify-center touch-none" 
                onWheel={onWheel}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                style={{ cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
            >
                {task.result ? (
                    <>
                        <div 
                            className="relative transition-transform duration-75 ease-out origin-center will-change-transform"
                            style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
                        >
                            <div className="premium-shadow rounded-[2rem] overflow-hidden bg-white p-3 border-8 border-white/50 relative">
                                <div className="relative inline-block">
                                    <img
                                        src={task.result.imageUrl}
                                        alt="Generated"
                                        className="max-w-full max-h-[65vh] object-contain block pointer-events-none select-none"
                                        draggable={false}
                                    />
                                    {task.dimensions && <DimensionOverlay dimensions={task.dimensions} />}
                                </div>
                                {/* 图像下方的信息记录 */}
                                <div className="mt-3 flex flex-col md:flex-row md:items-center justify-between px-3 py-2 text-[10px] text-stone-500 font-mono bg-stone-50/80 rounded-xl border border-stone-100 gap-2">
                                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    <span>⏱ 生成耗时: {task.duration ? task.duration.toFixed(1) : '--'}s</span>
                                    <span>🤖 模型: {task.model?.includes('pro') ? 'PRO' : task.model?.includes('lite') ? 'LITE' : 'STD'}</span>
                                    <span>📏 规格: {task.resolution || '未知'}</span>
                                    {task.pointsUsed !== undefined && <span>🪙 消耗点数: {(task.pointsUsed / 10000).toFixed(2)}W</span>}
                                    {task.cropRetentionRate !== undefined && (
                                      <span className={task.cropRetentionRate >= 95 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                                        🎯 画面完整度: {task.cropRetentionRate}% ({task.finalFitModeUsed === 'fill' ? '100%保留/无裁切' : '裁切'})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                    记录时间: {new Date(task.result.timestamp).toLocaleString()}
                                  </div>
                                </div>
                            </div>
                        </div>
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-brand-charcoal text-white rounded-full shadow-2xl p-2 flex items-center gap-4 z-20 border border-brand-gold/20" onMouseDown={e => e.stopPropagation()}>
                            <button onClick={handleZoomOut} className="p-3 hover:bg-white/10 rounded-full transition-colors text-brand-gold"><ZoomOut className="w-5 h-5" /></button>
                            <div className="h-6 w-px bg-white/20"></div>
                            <button onClick={handleResetZoom} className="px-4 py-1 text-xs font-bold font-mono tracking-widest text-brand-gold">{Math.round(scale * 100)}%</button>
                            <div className="h-6 w-px bg-white/20"></div>
                            <button onClick={handleZoomIn} className="p-3 hover:bg-white/10 rounded-full transition-colors text-brand-gold"><ZoomIn className="w-5 h-5" /></button>
                        </div>
                    </>
                ) : (
                    <div className="font-serif italic text-stone-300 text-xl">Empty Result Layer</div>
                )}
            </div>
        </div>
    );
};