import React, { useRef, useState } from 'react';
import { ImageAttachment, MaskRect, MaskStroke } from '../types';
import { Upload, X, ImageIcon, Undo2, Sparkles, MousePointer2 } from './IconsNew';
import { ProductChannelMask } from './ProductChannelMaskNew';

interface ImageUploaderProps {
  images: ImageAttachment[];
  onImagesChange: (images: ImageAttachment[]) => void;
  onAddImages?: (newImages: ImageAttachment[]) => void; // New optional callback for batch distribution
  onRestoreOriginal?: (imageId: string) => void; // Callback to restore original image
  title: string;
  maxFiles: number;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  emptyStateHint?: React.ReactNode;
  forceShowHint?: boolean;
  onQuickWhiteBackground?: () => void;
  builtInLibrary?: { name: string, url: string }[];
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  images, 
  onImagesChange, 
  onAddImages,
  onRestoreOriginal,
  title, 
  maxFiles,
  enabled = true,
  onToggle,
  emptyStateHint,
  forceShowHint = false,
  onQuickWhiteBackground,
  builtInLibrary
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [maskingImageId, setMaskingImageId] = useState<string | null>(null);

  const handleSaveMask = async (
    imageId: string, 
    cleanImageBlob: Blob, 
    maskImageBlob: Blob, 
    rects: MaskRect[], 
    maskDataUrl: string, 
    maskOverlayUrl: string,
    strokes?: MaskStroke[]
  ) => {
    // Update local state immediately
    const updatedImages = images.map(img => {
      if (img.id === imageId) {
        return { ...img, maskRects: rects, maskStrokes: strokes, maskDataUrl, maskOverlayUrl };
      }
      return img;
    });
    onImagesChange(updatedImages);
    setMaskingImageId(null);

    // Background upload
    try {
      const formData = new FormData();
      formData.append('clean_image', cleanImageBlob, 'clean.png');
      formData.append('mask_image', maskImageBlob, 'mask.png');

      fetch('/api/pre_process/mask', {
        method: 'POST',
        body: formData,
      }).catch(err => console.error('Background mask upload failed:', err));
    } catch (error) {
      console.error('Error saving mask:', error);
    }
  };

  const handleFiles = async (selectedFiles: FileList | File[]) => {
    const currentCount = images.length;
    const availableSlots = onAddImages ? 6 : maxFiles - currentCount; // If distributing, allow up to full range
    
    if (availableSlots <= 0 && !onAddImages) return;

    const limit = onAddImages ? 6 : maxFiles;
    const files: File[] = Array.from(selectedFiles).slice(0, limit) as File[];
    const newImages: ImageAttachment[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      try {
        const { base64Data, previewUrl, width, height } = await processFile(file);
        newImages.push({
          id: crypto.randomUUID(),
          file,
          previewUrl,
          base64Data,
          mimeType: file.type,
          width,
          height
        });
      } catch (err: any) {
        console.error("Error processing file", file.name, err);
      }
    }

    // If batch distribution is available, use it, otherwise normal update
    if (onAddImages && newImages.length > 0) {
      onAddImages(newImages);
    } else {
      onImagesChange([...images, ...newImages].slice(0, maxFiles));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (enabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (enabled && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!enabled) return;
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  const handleAddBuiltInImage = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `${name}.jpg`, { type: blob.type || 'image/jpeg' });
      handleFiles([file] as unknown as FileList);
    } catch (err) {
      console.error("Failed to load built-in image", err);
    }
  };

  const processFile = (file: File): Promise<{ base64Data: string; previewUrl: string; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        
        const img = new Image();
        img.onload = () => {
             let width = img.width;
             let height = img.height;
             
             // 为避免触发后端及 Gemini API 413 (Payload Too Large) 报错，限制最大边长并压缩体积
             // 将最高分辨率上限设置为 1536，既保证高清画质又控制文件在几MB内
             const MAX_DIMENSION = 1536;
             
             if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                 if (width > height) {
                     height = Math.round(height * (MAX_DIMENSION / width));
                     width = MAX_DIMENSION;
                 } else {
                     width = Math.round(width * (MAX_DIMENSION / height));
                     height = MAX_DIMENSION;
                 }
             }
             
             const canvas = document.createElement('canvas');
             canvas.width = width;
             canvas.height = height;
             const ctx = canvas.getContext('2d');
             if (ctx) {
                 // For transparent images, fill with white so jpeg doesn't render them black
                 ctx.fillStyle = '#FFFFFF';
                 ctx.fillRect(0, 0, width, height);
                 ctx.drawImage(img, 0, 0, width, height);
                 
                 // 始终使用 JPEG 进行压缩，避免无损 PNG 造成的巨大体积 (Payload Too Large 413)
                 const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                 
                 const base64Data = dataUrl.split(',')[1];
                 
                 resolve({ 
                     base64Data, 
                     previewUrl: dataUrl, 
                     width, 
                     height 
                 });
             } else {
                 // Fallback if canvas fails
                 const base64Data = result.split(',')[1];
                 resolve({ 
                     base64Data, 
                     previewUrl: result, 
                     width: img.width, 
                     height: img.height 
                 });
             }
        };
        img.onerror = () => {
             const base64Data = result.split(',')[1];
             resolve({ 
                 base64Data, 
                 previewUrl: result, 
                 width: 0, 
                 height: 0 
             });
        };
        img.src = result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => {
    onImagesChange(images.filter((img) => img.id !== id));
  };

  const isMaxReached = images.length >= maxFiles;
  const isEnabled = enabled;

  return (
    <div className={`space-y-3 transition-all duration-300 ${isEnabled ? 'opacity-100' : 'opacity-60'}`}>
      <div className="flex items-center justify-between gap-4">
        <label className={`text-sm font-semibold flex items-center gap-2 min-w-0 ${isEnabled ? 'text-brand-charcoal' : 'text-stone-400'}`}>
          <ImageIcon className={`w-4 h-4 shrink-0 ${isEnabled ? 'text-brand-gold' : 'text-stone-300'}`} />
          <span className="leading-tight text-sm truncate">{title}</span>
        </label>
        
        <div className="flex items-center gap-3 shrink-0">
            {onToggle && (
              <button
                  onClick={() => onToggle(!isEnabled)}
                  type="button"
                  className={`group relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 ${isEnabled ? 'bg-brand-gold' : 'bg-stone-200 hover:bg-stone-300'}`}
              >
                  <span className="sr-only">Toggle channel</span>
                  <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-300 ease-in-out ${isEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
                  />
              </button>
            )}
            <span className={`text-[10px] font-bold tracking-widest ${isMaxReached ? 'text-brand-gold' : 'text-stone-400'} ${!isEnabled ? 'invisible' : ''}`}>
              {images.length} / {maxFiles}
            </span>
        </div>
      </div>

      <div 
        className={`grid grid-cols-2 md:grid-cols-3 gap-2.5 w-full min-h-[100px] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/50 rounded-2xl ${!isEnabled ? 'pointer-events-none grayscale opacity-80' : ''} ${isDragging ? 'scale-[1.02]' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
      >
        {/* Upload Button Area - Optimized for Batch */}
        {!isMaxReached && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`${images.length === 0 ? 'col-span-2 md:col-span-1' : 'col-span-1'} h-24 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all group ${isDragging ? 'border-brand-gold bg-brand-gold/5' : 'border-brand-taupe bg-brand-beige/30 hover:bg-brand-beige hover:border-brand-gold/40'}`}
            disabled={!isEnabled}
          >
            <Upload className={`w-5 h-5 mb-2 transition-transform group-hover:scale-110 ${isDragging ? 'text-brand-gold animate-bounce' : 'text-stone-300 group-hover:text-brand-gold'}`} />
            <span className="text-[9px] font-bold text-stone-400 group-hover:text-brand-gold uppercase tracking-tighter">批量上传</span>
          </button>
        )}

        {/* Large drop zone hint when empty or when forced to show */}
        {(images.length === 0 || forceShowHint) && !isDragging && (
           <div className="col-span-2 flex flex-col justify-center px-4 pointer-events-none">
              {emptyStateHint || (
                <p className="text-[10px] text-stone-300 font-medium leading-tight">支持框选、拖拽或截图粘贴录入<br/>自动分流至 6 个独立窗口</p>
              )}
           </div>
        )}

        {/* Image Previews */}
        {images.map((img) => (
          <div 
            key={img.id} 
            className="relative group h-24 w-full rounded-2xl overflow-hidden border border-brand-taupe bg-white shadow-sm cursor-zoom-in"
            onClick={() => setPreviewUrl(img.previewUrl)}
          >
            <img
              src={img.previewUrl}
              alt="Reference"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            {img.maskOverlayUrl && (
              <img
                src={img.maskOverlayUrl}
                alt="Mask Overlay"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 pointer-events-none"
              />
            )}
            <div className="absolute inset-0 bg-brand-charcoal/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            {/* AI Optimized Badge */}
            {img.isAiOptimized && (
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-brand-gold text-white text-[8px] font-bold uppercase tracking-wider rounded-md shadow-sm flex items-center gap-1">
                    <Sparkles className="w-2 h-2" /> AI Optimized
                </div>
            )}

            {/* Restore Button */}
            {img.isAiOptimized && onRestoreOriginal && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRestoreOriginal(img.id);
                    }}
                    className="absolute bottom-1.5 left-1.5 p-1.5 rounded-full bg-white/90 text-brand-charcoal shadow-md opacity-0 group-hover:opacity-100 hover:bg-brand-charcoal hover:text-white transition-all transform hover:scale-110"
                    title="还原原始图片"
                >
                    <Undo2 className="w-2.5 h-2.5" />
                </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                removeImage(img.id);
              }}
              className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-white/90 text-brand-charcoal shadow-md opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all transform hover:scale-110"
              disabled={!isEnabled}
            >
              <X className="w-2.5 h-2.5" />
            </button>

            {/* Mask Edit Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMaskingImageId(img.id);
              }}
              className="absolute bottom-1.5 right-1.5 p-1.5 rounded-full bg-white/90 text-brand-charcoal shadow-md opacity-0 group-hover:opacity-100 hover:bg-brand-gold hover:text-white transition-all transform hover:scale-110"
              title="绘制蒙版"
            >
              <MousePointer2 className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      {builtInLibrary && builtInLibrary.length > 0 && isEnabled && !isMaxReached && (
         <div className="flex flex-wrap gap-2 pt-1 border-t border-brand-taupe/30 mt-2">
            <span className="text-[10px] text-stone-400 self-center uppercase tracking-widest font-bold px-1">内置库:</span>
            {builtInLibrary.map((lib, i) => (
                <button
                   key={i}
                   type="button"
                   onClick={(e) => { e.stopPropagation(); handleAddBuiltInImage(lib.url, lib.name); }}
                   className="text-[10px] bg-brand-beige border border-brand-taupe/50 text-stone-600 px-3 py-1 rounded-full hover:bg-brand-gold hover:text-white transition-colors"
                >
                   {lib.name}
                </button>
            ))}
         </div>
      )}

      {/* Mask Editor Modal */}
      {maskingImageId && (
        <ProductChannelMask
          imageUrl={images.find(img => img.id === maskingImageId)?.previewUrl || ''}
          initialRects={images.find(img => img.id === maskingImageId)?.maskRects}
          initialStrokes={images.find(img => img.id === maskingImageId)?.maskStrokes}
          onClose={() => setMaskingImageId(null)}
          onSave={(cleanBlob, maskBlob, rects, maskDataUrl, maskOverlayUrl, strokes) => 
            handleSaveMask(maskingImageId, cleanBlob, maskBlob, rects, maskDataUrl, maskOverlayUrl, strokes)
          }
          onQuickWhiteBackground={onQuickWhiteBackground}
        />
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        multiple={true} // ALWAYS MULTIPLE
        className="hidden"
        disabled={!isEnabled}
      />

      {/* Full Screen Preview Modal */}
      {previewUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-brand-charcoal/95 backdrop-blur-md flex items-center justify-center p-8 animate-fade-in"
          onClick={() => setPreviewUrl(null)}
        >
          <button 
            className="absolute top-8 right-8 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl border-4 border-white/10"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};