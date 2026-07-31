import React from 'react';

export interface SvgPreviewerProps {
  dimensions: { width: number; depth: number; height: number };
  imageUrl?: string;
  measurements?: any;
  labelAlignmentMode?: 'default' | 'locked';
  onUpdateDimensions?: (depth: number, height: number) => void;
}

export const SvgPreviewer: React.FC<SvgPreviewerProps> = ({ dimensions, imageUrl, measurements, labelAlignmentMode, onUpdateDimensions }) => {
  return (
    <div className="w-full h-full min-h-[300px] border border-gray-200 rounded-lg flex flex-col items-center justify-center bg-gray-50 overflow-hidden relative">
      {imageUrl ? (
        <div className="relative w-full h-full">
           <img src={imageUrl} alt="Result" className="w-full h-full object-contain" />
           <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <span className="bg-black/50 text-white px-2 py-1 rounded text-xs">Previewer Overlay</span>
           </div>
        </div>
      ) : (
        <div className="text-gray-400 flex flex-col items-center">
           <span className="text-sm">No image available for preview</span>
        </div>
      )}
    </div>
  );
};
