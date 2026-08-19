import React from 'react';
import {
  LayoutSlotSpec,
  FitMode,
  NormalizedPoint,
  SafeAreaInsets,
  NormalizedRect
} from '../../types/layoutManifest';
import { computeLayoutTransform } from '../../lib/layoutGeometry';
import { SafeAreaOverlay } from './SafeAreaOverlay';

interface AspectFitPreviewProps {
  slot: LayoutSlotSpec;
  imageUrl?: string;
  targetWidth?: number;
  interactiveFocal?: boolean;
  showOverlays?: boolean;
  onSlotChange?: (updatedSlot: LayoutSlotSpec) => void;
  className?: string;
}

export const AspectFitPreview: React.FC<AspectFitPreviewProps> = ({
  slot,
  imageUrl,
  targetWidth = 2100,
  interactiveFocal = false,
  showOverlays = true,
  onSlotChange,
  className = ''
}) => {
  const {
    sourceWidth,
    sourceHeight,
    slotHeight,
    fitMode,
    focalPoint,
    safeArea,
    reservedZones,
    subjectBounds,
    backgroundColor
  } = slot;

  // Compute live transform
  const renderTransform = React.useMemo(() => {
    return computeLayoutTransform({
      slotWidth: targetWidth,
      slotHeight,
      sourceWidth,
      sourceHeight,
      fitMode,
      focalPoint,
      subjectBounds,
      reservedZones
    });
  }, [targetWidth, slotHeight, sourceWidth, sourceHeight, fitMode, focalPoint, subjectBounds, reservedZones]);

  const handleFocalPointChange = (pt: NormalizedPoint) => {
    if (!onSlotChange) return;
    onSlotChange({
      ...slot,
      focalPoint: pt
    });
  };

  // Convert transform to CSS % offsets
  const imgStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${(renderTransform.displayWidth / targetWidth) * 100}%`,
    height: `${(renderTransform.displayHeight / slotHeight) * 100}%`,
    left: `${(renderTransform.offsetX / targetWidth) * 100}%`,
    top: `${(renderTransform.offsetY / slotHeight) * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    pointerEvents: 'none'
  };

  return (
    <div
      className={`relative overflow-hidden select-none transition-all ${className}`}
      style={{
        backgroundColor: backgroundColor || '#F7F4EF',
        aspectRatio: `${targetWidth} / ${slotHeight}`
      }}
    >
      {/* 1. Underlying Image Rendered via Computed Transform */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={slot.sceneKey}
          style={imgStyle}
          className="transition-all duration-100"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 bg-stone-100/60 p-4 text-center">
          <span className="font-mono text-xs">分镜资产加载中</span>
          <span className="text-[10px] text-stone-400 mt-0.5">
            {slot.sourceWidth} × {slot.sourceHeight} · {slot.sourceAspectRatio}
          </span>
        </div>
      )}

      {/* 2. Dark Crop Mask for Cover / Smart Crop */}
      {renderTransform.isCropped && showOverlays && (
        <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm text-white text-[9px] font-mono px-1.5 py-0.5 rounded pointer-events-none flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>受控裁切 ({fitMode})</span>
        </div>
      )}

      {/* 3. Safe Area & Conflict Overlays */}
      {showOverlays && (
        <SafeAreaOverlay
          slotWidth={targetWidth}
          slotHeight={slotHeight}
          safeArea={safeArea}
          reservedZones={reservedZones}
          subjectBounds={subjectBounds}
          renderTransform={renderTransform}
          focalPoint={focalPoint}
          showFocalPoint={interactiveFocal || fitMode === 'cover' || fitMode === 'smart_crop'}
          onFocalPointChange={handleFocalPointChange}
          interactive={interactiveFocal}
        />
      )}
    </div>
  );
};
