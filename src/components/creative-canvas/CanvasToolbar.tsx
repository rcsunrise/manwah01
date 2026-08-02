import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { ZoomIn, ZoomOut, Maximize2, LocateFixed } from 'lucide-react';

interface CanvasToolbarProps {
  zoomLevel: number;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ zoomLevel }) => {
  const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();

  const handleResetCenter = () => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 400 });
  };

  const handleFitView = () => {
    fitView({ duration: 400, padding: 0.2 });
  };

  return (
    <div className="absolute bottom-6 left-6 z-20 flex items-center gap-1 bg-white/90 backdrop-blur-xl p-1.5 rounded-2xl border border-[#E5E0D8] shadow-lg shadow-stone-900/5 select-none">
      <button
        onClick={() => zoomOut({ duration: 200 })}
        className="p-2 rounded-xl text-stone-600 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
        title="缩小"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <span className="px-2 py-1 min-w-[52px] text-center font-mono text-xs font-bold text-stone-700">
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
        title="适应视图"
      >
        <Maximize2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">适应视图</span>
      </button>

      <button
        onClick={handleResetCenter}
        className="p-2 rounded-xl text-stone-600 hover:bg-[#F9F5EF] hover:text-[#B28C5A] active:scale-95 transition-all"
        title="回到中心"
      >
        <LocateFixed className="w-4 h-4" />
      </button>
    </div>
  );
};
