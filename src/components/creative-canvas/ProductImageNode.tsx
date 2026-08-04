import React, { useRef, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Image as ImageIcon,
  RotateCw,
  CheckCircle2,
  Upload,
  Trash2,
  Maximize2,
  X,
  FileImage,
  Loader2,
  Sparkles
} from 'lucide-react';
import { ProductImageNodeData } from '../../types/creativeCanvas';

export const ProductImageNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as ProductImageNodeData;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && nodeData?.onUpload) {
      nodeData.onUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && nodeData?.onUpload) {
      nodeData.onUpload(file);
    }
  };

  const dimensionsText = nodeData?.dimensions?.width && nodeData?.dimensions?.height
    ? `${nodeData.dimensions.width}×${nodeData.dimensions.height}`
    : null;

  return (
    <>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-80 p-4 rounded-2xl bg-white/95 backdrop-blur-md border transition-all shadow-lg ${
          isDragging
            ? 'border-[#B28C5A] ring-4 ring-[#B28C5A]/40 bg-[#F9F5EF]'
            : selected
            ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30 shadow-[#B28C5A]/10'
            : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
        }`}
      >
        <Handle type="target" position={Position.Left} id="target" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#E5E0D8]/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8]/50">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-xs text-[#2C2A29]">产品主图</h3>
              <span className="text-[10px] text-stone-400 block truncate max-w-[130px]">
                {nodeData?.fileName || (nodeData?.imageUrl ? 'product_photo.jpg' : '未上传')}
              </span>
            </div>
          </div>

          {nodeData?.imageUrl ? (
            nodeData.status === 'analyzing' ? (
              <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium border border-amber-200 animate-pulse">
                <Loader2 className="w-3 h-3 text-amber-600 animate-spin" /> DNA分析中
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 已就绪
              </span>
            )
          ) : (
            <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200 font-medium">
              待上传
            </span>
          )}
        </div>

        {/* Image Display or Interactive Dropzone */}
        {nodeData?.imageUrl && !imgError ? (
          <div className="relative w-full h-48 bg-stone-900/5 rounded-xl overflow-hidden border border-[#E5E0D8]/80 group flex items-center justify-center">
            <img
              src={nodeData.imageUrl}
              alt={nodeData.fileName || 'Product Image'}
              className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-102"
              onError={() => setImgError(true)}
            />

            {/* Hover Actions Bar */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="p-2 bg-white/90 hover:bg-white text-stone-800 rounded-xl shadow-lg hover:scale-105 transition-all text-xs font-medium flex items-center gap-1"
                title="放大查看"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#B28C5A]" />
                <span>放大</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded-xl shadow-lg hover:scale-105 transition-all text-xs font-medium flex items-center gap-1"
                title="更换图片"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>更换</span>
              </button>

              {nodeData?.onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    nodeData.onRemove?.();
                  }}
                  className="p-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg hover:scale-105 transition-all text-xs font-medium flex items-center gap-1"
                  title="移除图片"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dimension Badge */}
            {dimensionsText && (
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[9px] font-mono tracking-wide">
                {dimensionsText}
              </div>
            )}
            {nodeData?.fileSize && (
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[9px] font-mono">
                {nodeData.fileSize}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`w-full h-44 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center p-4 text-center group ${
              isDragging
                ? 'border-[#B28C5A] bg-[#F9F5EF]'
                : 'border-[#E5E0D8] hover:border-[#B28C5A] bg-[#FAF8F5] hover:bg-[#F9F5EF]/60'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-[#E5E0D8] text-[#B28C5A] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#2C2A29] mb-1">点击或拖拽上传产品主图</p>
            <p className="text-[10px] text-stone-400">支持 PNG, JPG, WEBP (最大 20MB)</p>
            <div className="mt-2 text-[9px] text-[#B28C5A] font-medium bg-[#B28C5A]/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>上传后自动提取立体 DNA</span>
            </div>
          </div>
        )}

        {/* Footer Info & Actions */}
        <div className="mt-3 pt-2.5 border-t border-[#E5E0D8]/40 flex items-center justify-between text-[10px] text-stone-500">
          <span className="text-stone-400">
            {nodeData?.uploadedAt ? `上传时间：${nodeData.uploadedAt}` : '支持拖拽/粘贴图片'}
          </span>
          {nodeData?.imageUrl && nodeData?.onReanalyze && (
            <button
              type="button"
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

      {/* Lightbox Modal */}
      {showPreviewModal && nodeData?.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-fadeIn">
          <div className="relative max-w-4xl max-h-[90vh] bg-[#2C2622] rounded-3xl overflow-hidden shadow-2xl border border-stone-700 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 text-white">
              <div className="flex items-center gap-2">
                <FileImage className="w-5 h-5 text-[#D4AF37]" />
                <span className="font-serif font-bold text-sm">产品主图大图预览</span>
                {dimensionsText && (
                  <span className="text-xs text-stone-400 bg-stone-800 px-2 py-0.5 rounded-md font-mono">
                    {dimensionsText}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 text-stone-400 hover:text-white rounded-full hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Image Display */}
            <div className="p-6 flex-1 overflow-auto flex items-center justify-center bg-black/40">
              <img
                src={nodeData.imageUrl}
                alt={nodeData.fileName || 'Product Main Photo'}
                className="max-h-[70vh] object-contain rounded-xl shadow-lg border border-stone-800"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
              <span>{nodeData.fileName || 'product_photo.jpg'}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewModal(false);
                    fileInputRef.current?.click();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#B28C5A] text-white font-bold hover:bg-[#9E7A4A] transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>更换主图</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
