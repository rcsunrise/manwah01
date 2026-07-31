import React, { useState, useRef, useEffect } from 'react';
import { X, Save, Undo2, MousePointer2, Sparkles } from './IconsNew';
import { MaskRect, MaskStroke, Point } from '../types';
import { Eraser, Square, PenTool } from 'lucide-react';

interface ProductChannelMaskProps {
  imageUrl: string;
  initialRects?: MaskRect[];
  initialStrokes?: MaskStroke[];
  onClose: () => void;
  onSave: (cleanImageBlob: Blob, maskImageBlob: Blob, rects: MaskRect[], maskDataUrl: string, maskOverlayUrl: string, strokes?: MaskStroke[]) => void;
  onQuickWhiteBackground?: () => void;
}

export const ProductChannelMask: React.FC<ProductChannelMaskProps> = ({
  imageUrl,
  initialRects,
  initialStrokes,
  onClose,
  onSave,
  onQuickWhiteBackground
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rects, setRects] = useState<MaskRect[]>(initialRects || []);
  const [strokes, setStrokes] = useState<MaskStroke[]>(initialStrokes || []);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<MaskStroke | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTool, setSelectedTool] = useState<'brush' | 'eraser' | 'rect'>('brush');
  const [hoverClientPos, setHoverClientPos] = useState<{x: number, y: number} | null>(null);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const drawStrokesToCanvas = (
    targetCtx: CanvasRenderingContext2D, 
    canvasWidth: number, 
    canvasHeight: number, 
    strokesToDraw: MaskStroke[],
    isMaskMode: boolean = false,
    alpha: number = 0.5
  ) => {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvasWidth;
    offscreenCanvas.height = canvasHeight;
    const offCtx = offscreenCanvas.getContext('2d');
    if (!offCtx) return;

    offCtx.lineCap = 'round';
    offCtx.lineJoin = 'round';

    strokesToDraw.forEach(stroke => {
      const tool = stroke.tool || 'brush';
      
      if (tool === 'eraser') {
        offCtx.globalCompositeOperation = 'destination-out';
        offCtx.strokeStyle = 'rgba(0,0,0,1)';
        offCtx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        offCtx.globalCompositeOperation = 'source-over';
        offCtx.strokeStyle = isMaskMode ? 'white' : 'red';
        offCtx.fillStyle = isMaskMode ? 'white' : 'red';
      }

      const lineWidth = Math.max(2, stroke.width * canvasWidth);
      offCtx.lineWidth = lineWidth;

      if (tool === 'rect' && stroke.points.length > 0) {
        const startPoint = stroke.points[0];
        const endPoint = stroke.points[stroke.points.length - 1];
        const x1 = startPoint.x * canvasWidth;
        const y1 = startPoint.y * canvasHeight;
        const x2 = endPoint.x * canvasWidth;
        const y2 = endPoint.y * canvasHeight;
        
        offCtx.fillRect(
          Math.min(x1, x2),
          Math.min(y1, y2),
          Math.abs(x2 - x1),
          Math.abs(y2 - y1)
        );
      } else {
        offCtx.beginPath();
        stroke.points.forEach((point, index) => {
          const x = point.x * canvasWidth;
          const y = point.y * canvasHeight;
          if (index === 0) {
            offCtx.moveTo(x, y);
          } else {
            offCtx.lineTo(x, y);
          }
        });
        offCtx.stroke();
      }
    });

    if (isMaskMode) {
      targetCtx.fillStyle = 'black';
      targetCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      targetCtx.globalAlpha = 1.0;
      targetCtx.drawImage(offscreenCanvas, 0, 0);
    } else {
      targetCtx.globalAlpha = alpha;
      targetCtx.drawImage(offscreenCanvas, 0, 0);
      targetCtx.globalAlpha = 1.0;
    }
  };

  // Draw canvas
  useEffect(() => {
    if (!image || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image aspect ratio but fit in container
    const container = containerRef.current;
    const containerRatio = container.clientWidth / container.clientHeight;
    const imageRatio = image.width / image.height;

    let drawWidth, drawHeight;
    if (imageRatio > containerRatio) {
      drawWidth = container.clientWidth;
      drawHeight = drawWidth / imageRatio;
    } else {
      drawHeight = container.clientHeight;
      drawWidth = drawHeight * imageRatio;
    }

    canvas.width = drawWidth;
    canvas.height = drawHeight;

    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const drawStrokesToCanvas = (
      targetCtx: CanvasRenderingContext2D, 
      canvasWidth: number, 
      canvasHeight: number, 
      strokesToDraw: MaskStroke[],
      isMaskMode: boolean = false,
      alpha: number = 0.5
    ) => {
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = canvasWidth;
      offscreenCanvas.height = canvasHeight;
      const offCtx = offscreenCanvas.getContext('2d');
      if (!offCtx) return;
  
      offCtx.lineCap = 'round';
      offCtx.lineJoin = 'round';
  
      strokesToDraw.forEach(stroke => {
        const tool = stroke.tool || 'brush';
        
        if (tool === 'eraser') {
          offCtx.globalCompositeOperation = 'destination-out';
          offCtx.strokeStyle = 'rgba(0,0,0,1)';
          offCtx.fillStyle = 'rgba(0,0,0,1)';
        } else {
          offCtx.globalCompositeOperation = 'source-over';
          offCtx.strokeStyle = isMaskMode ? 'white' : 'red';
          offCtx.fillStyle = isMaskMode ? 'white' : 'red';
        }
  
        const lineWidth = Math.max(2, stroke.width * canvasWidth);
        offCtx.lineWidth = lineWidth;
  
        if (tool === 'rect' && stroke.points.length > 0) {
          const startPoint = stroke.points[0];
          const endPoint = stroke.points[stroke.points.length - 1];
          const x1 = startPoint.x * canvasWidth;
          const y1 = startPoint.y * canvasHeight;
          const x2 = endPoint.x * canvasWidth;
          const y2 = endPoint.y * canvasHeight;
          
          offCtx.fillRect(
            Math.min(x1, x2),
            Math.min(y1, y2),
            Math.abs(x2 - x1),
            Math.abs(y2 - y1)
          );
        } else {
          offCtx.beginPath();
          stroke.points.forEach((point, index) => {
            const x = point.x * canvasWidth;
            const y = point.y * canvasHeight;
            if (index === 0) {
              offCtx.moveTo(x, y);
            } else {
              offCtx.lineTo(x, y);
            }
          });
          offCtx.stroke();
        }
      });
  
      if (isMaskMode) {
        targetCtx.fillStyle = 'black';
        targetCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        targetCtx.globalAlpha = 1.0;
        targetCtx.drawImage(offscreenCanvas, 0, 0);
      } else {
        targetCtx.globalAlpha = alpha;
        targetCtx.drawImage(offscreenCanvas, 0, 0);
        targetCtx.globalAlpha = 1.0;
      }
    };

    const allStrokes = [...strokes];
    if (currentStroke) {
      allStrokes.push(currentStroke);
    }
    
    drawStrokesToCanvas(ctx, canvas.width, canvas.height, allStrokes, false, 0.5);

  }, [image, strokes, currentStroke]);

  const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  };

  const [strokeWidth, setStrokeWidth] = useState(0.05); // 5% default

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getMousePos(e);
    setIsDrawing(true);
    setCurrentStroke({ points: [pos], width: strokeWidth, tool: selectedTool });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    setHoverClientPos({ x: clientX, y: clientY });

    if (!isDrawing || !currentStroke) return;
    const pos = getMousePos(e);
    
    setCurrentStroke({
      ...currentStroke,
      points: [...currentStroke.points, pos]
    });
  };

  const handleEnd = () => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);
    if (currentStroke.points.length > 1 || selectedTool === 'rect') {
      setStrokes([...strokes, currentStroke]);
    }
    setCurrentStroke(null);
  };

  const handleMouseLeave = () => {
    setHoverClientPos(null);
    handleEnd();
  };

  const handleUndo = () => {
    setStrokes(strokes.slice(0, -1));
  };

  const [previewMaskUrl, setPreviewMaskUrl] = useState<string | null>(null);

  const generateMaskPreview = async () => {
    if (!image) return;
    
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = image.width;
    maskCanvas.height = image.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;
    
    // Fill black background handled by drawStrokesToCanvas
    drawStrokesToCanvas(maskCtx, maskCanvas.width, maskCanvas.height, strokes, true, 1.0);

    const dataUrl = maskCanvas.toDataURL('image/png');
    setPreviewMaskUrl(dataUrl);
  };

  const handleSave = async () => {
    if (!image) return;
    setIsSaving(true);

    try {
      let targetWidth = image.width;
      let targetHeight = image.height;
      
      // If the image is extremely large, we resize it to prevent API 413 Payload Too Large errors
      const MAX_DIMENSION = 1536;
      if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
        if (targetWidth > targetHeight) {
          targetHeight = Math.round(targetHeight * (MAX_DIMENSION / targetWidth));
          targetWidth = MAX_DIMENSION;
        } else {
          targetWidth = Math.round(targetWidth * (MAX_DIMENSION / targetHeight));
          targetHeight = MAX_DIMENSION;
        }
      }

      // 1. Create clean image blob (original image)
      const cleanCanvas = document.createElement('canvas');
      cleanCanvas.width = targetWidth;
      cleanCanvas.height = targetHeight;
      const cleanCtx = cleanCanvas.getContext('2d');
      if (!cleanCtx) throw new Error('Could not get 2d context');
      cleanCtx.drawImage(image, 0, 0, targetWidth, targetHeight);
      
      const cleanBlob = await new Promise<Blob>((resolve, reject) => {
        // Use higher quality to preserve fidelity
        cleanCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to create clean blob')), 'image/jpeg', 0.95);
      });

      // 2. Create mask image blob
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = targetWidth;
      maskCanvas.height = targetHeight;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error('Could not get 2d context');
      
      drawStrokesToCanvas(maskCtx, maskCanvas.width, maskCanvas.height, strokes, true, 1.0);

      const maskBlob = await new Promise<Blob>((resolve, reject) => {
        maskCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to create mask blob')), 'image/png');
      });

      const maskDataUrl = maskCanvas.toDataURL('image/png');

      // 3. Create transparent overlay with red strokes
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = targetWidth;
      overlayCanvas.height = targetHeight;
      const overlayCtx = overlayCanvas.getContext('2d');
      if (overlayCtx) {
        drawStrokesToCanvas(overlayCtx, targetWidth, targetHeight, strokes, false, 1.0);
      }
      const overlayDataUrl = overlayCanvas.toDataURL('image/png');

      onSave(cleanBlob, maskBlob, rects, maskDataUrl, overlayDataUrl, strokes);
    } catch (err) {
      console.error('Error generating mask:', err);
      alert('生成蒙版失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8">
      <div className="bg-brand-cream w-full max-w-5xl h-full max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-brand-taupe/20 bg-white/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center text-brand-gold">
              <MousePointer2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-brand-charcoal">蒙版预处理 (Mask Pre-processor)</h2>
              <p className="text-xs text-stone-500">使用鼠标自由涂抹标记需要修改的区域</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5 text-stone-400 hover:text-brand-charcoal transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex overflow-hidden">
          <div 
            ref={containerRef}
            className={`flex-1 bg-stone-100 relative overflow-hidden flex items-center justify-center ${previewMaskUrl ? 'hidden md:flex' : 'flex'} ${(selectedTool === 'brush' || selectedTool === 'eraser') ? 'cursor-none' : 'cursor-crosshair'}`}
            onMouseDown={handleStart}
            onMouseMove={handleMouseMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleMouseLeave}
            onTouchStart={(e) => {
               let clientX = e.touches[0].clientX;
               let clientY = e.touches[0].clientY;
               setHoverClientPos({ x: clientX, y: clientY });
               handleStart(e);
            }}
            onTouchMove={handleMouseMove}
            onTouchEnd={(e) => {
               setHoverClientPos(null);
               handleEnd();
            }}
          >
            {!image && (
              <div className="absolute inset-0 flex items-center justify-center text-stone-400">
                加载图片中...
              </div>
            )}
            <canvas 
              ref={canvasRef} 
              className="max-w-full max-h-full shadow-md"
              style={{ touchAction: 'none' }}
            />
            {hoverClientPos && (selectedTool === 'brush' || selectedTool === 'eraser') && canvasRef.current && (
              <div 
                className="fixed pointer-events-none rounded-full z-[100]"
                style={{
                  left: hoverClientPos.x,
                  top: hoverClientPos.y,
                  width: canvasRef.current.getBoundingClientRect().width * strokeWidth,
                  height: canvasRef.current.getBoundingClientRect().width * strokeWidth,
                  transform: 'translate(-50%, -50%)',
                  mixBlendMode: 'difference',
                  border: '1.5px solid white'
                }}
              />
            )}
          </div>

          {/* Preview Area */}
          {previewMaskUrl && (
            <div className="flex-1 bg-black relative overflow-hidden flex items-center justify-center border-l border-white/10">
              <div className="absolute top-4 left-4 text-white/50 text-sm font-medium z-10">
                蒙版预览 (Mask Preview)
              </div>
              <img 
                src={previewMaskUrl} 
                alt="Mask Preview" 
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-4 sm:p-6 bg-white border-t border-brand-taupe/20 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <button 
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-taupe text-stone-600 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <Undo2 className="w-4 h-4" />
              撤销上一步
            </button>

            {/* Tool Selection */}
            <div className="flex items-center bg-stone-50 rounded-xl border border-stone-200 p-1">
              <button
                onClick={() => setSelectedTool('brush')}
                className={`p-2 rounded-lg transition-colors ${selectedTool === 'brush' ? 'bg-white shadow-sm text-brand-gold' : 'text-stone-400 hover:text-stone-600'}`}
                title="画笔"
              >
                <PenTool className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedTool('eraser')}
                className={`p-2 rounded-lg transition-colors ${selectedTool === 'eraser' ? 'bg-white shadow-sm text-brand-gold' : 'text-stone-400 hover:text-stone-600'}`}
                title="橡皮擦"
              >
                <Eraser className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedTool('rect')}
                className={`p-2 rounded-lg transition-colors ${selectedTool === 'rect' ? 'bg-white shadow-sm text-brand-gold' : 'text-stone-400 hover:text-stone-600'}`}
                title="矩形工具"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 px-4 py-2 bg-stone-50 rounded-xl border border-stone-200">
              <span className="text-xs text-stone-500 font-medium">画笔大小</span>
              <input 
                type="range" 
                min="0.002" 
                max="0.2" 
                step="0.002" 
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                className="w-24 accent-brand-gold cursor-pointer"
              />
            </div>
            {onQuickWhiteBackground && (
              <button
                onClick={() => {
                  onQuickWhiteBackground();
                  handleSave();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-sm font-bold border border-blue-200"
              >
                <Sparkles className="w-4 h-4" />
                一键白底
              </button>
            )}
            <span className="text-xs text-stone-400">
              已绘制 {strokes.length} 个区域
            </span>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => {
                if (previewMaskUrl) {
                  setPreviewMaskUrl(null);
                } else {
                  generateMaskPreview();
                }
              }}
              disabled={strokes.length === 0}
              className="px-6 py-2.5 rounded-xl text-brand-charcoal border border-brand-charcoal hover:bg-stone-50 transition-colors text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {previewMaskUrl ? '关闭预览' : '预览蒙版'}
            </button>
            <button 
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-stone-500 hover:bg-stone-100 transition-colors text-sm font-bold"
            >
              取消
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving || !image}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-charcoal text-white hover:bg-black transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? '处理中...' : '保存并生成蒙版'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
