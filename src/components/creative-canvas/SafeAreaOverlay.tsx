import React from 'react';
import { SafeAreaInsets, NormalizedRect, RenderTransform, NormalizedPoint } from '../../types/layoutManifest';

interface SafeAreaOverlayProps {
  slotWidth: number;
  slotHeight: number;
  safeArea: SafeAreaInsets;
  reservedZones: NormalizedRect[];
  subjectBounds?: NormalizedRect | null;
  renderTransform?: RenderTransform;
  focalPoint?: NormalizedPoint;
  showFocalPoint?: boolean;
  onFocalPointChange?: (pt: NormalizedPoint) => void;
  interactive?: boolean;
}

export const SafeAreaOverlay: React.FC<SafeAreaOverlayProps> = ({
  slotWidth,
  slotHeight,
  safeArea,
  reservedZones,
  subjectBounds,
  renderTransform,
  focalPoint,
  showFocalPoint = false,
  onFocalPointChange,
  interactive = false
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDraggingFocal, setIsDraggingFocal] = React.useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive || !onFocalPointChange || !containerRef.current) return;
    setIsDraggingFocal(true);
    updateFocalFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingFocal || !interactive || !onFocalPointChange || !containerRef.current) return;
    updateFocalFromEvent(e);
  };

  const handlePointerUp = () => {
    setIsDraggingFocal(false);
  };

  const updateFocalFromEvent = (e: React.PointerEvent) => {
    if (!containerRef.current || !onFocalPointChange) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onFocalPointChange({
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000
    });
  };

  // Safe margin percentages
  const safeTop = `${safeArea.top * 100}%`;
  const safeRight = `${safeArea.right * 100}%`;
  const safeBottom = `${safeArea.bottom * 100}%`;
  const safeLeft = `${safeArea.left * 100}%`;

  // Compute subject bounds in slot percentage
  let subjectSlotStyle: React.CSSProperties | null = null;
  let isSubjectConflict = false;

  if (subjectBounds && renderTransform) {
    const pxX = renderTransform.offsetX + subjectBounds.x * renderTransform.displayWidth;
    const pxY = renderTransform.offsetY + subjectBounds.y * renderTransform.displayHeight;
    const pxW = subjectBounds.width * renderTransform.displayWidth;
    const pxH = subjectBounds.height * renderTransform.displayHeight;

    const normX = pxX / slotWidth;
    const normY = pxY / slotHeight;
    const normW = pxW / slotWidth;
    const normH = pxH / slotHeight;

    subjectSlotStyle = {
      left: `${normX * 100}%`,
      top: `${normY * 100}%`,
      width: `${normW * 100}%`,
      height: `${normH * 100}%`
    };

    // Check conflict
    const safeRect = {
      x: safeArea.left,
      y: safeArea.top,
      width: 1 - safeArea.left - safeArea.right,
      height: 1 - safeArea.top - safeArea.bottom
    };

    if (
      normX < safeRect.x ||
      normY < safeRect.y ||
      normX + normW > safeRect.x + safeRect.width ||
      normY + normH > safeRect.y + safeRect.height
    ) {
      isSubjectConflict = true;
    }

    for (const zone of reservedZones) {
      const intersects = !(
        normX + normW <= zone.x ||
        zone.x + zone.width <= normX ||
        normY + normH <= zone.y ||
        zone.y + zone.height <= normY
      );
      if (intersects) {
        isSubjectConflict = true;
        break;
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`absolute inset-0 pointer-events-auto select-none ${interactive ? 'cursor-crosshair' : 'pointer-events-none'}`}
    >
      {/* 1. Safe Margin Boundary (Blue Outline) */}
      <div
        className="absolute border-2 border-dashed border-sky-400/80 pointer-events-none transition-all"
        style={{
          top: safeTop,
          right: safeRight,
          bottom: safeBottom,
          left: safeLeft
        }}
      >
        <div className="absolute top-1 left-1.5 text-[9px] font-mono font-bold text-sky-600 bg-sky-50/90 px-1 py-0.2 rounded border border-sky-200">
          安全保护区 ({Math.round(safeArea.top * 100)}%)
        </div>
      </div>

      {/* 2. Reserved Zones (Golden Translucent Boxes) */}
      {reservedZones.map((zone, idx) => (
        <div
          key={zone.id || `zone-${idx}`}
          className="absolute bg-amber-500/20 border border-amber-500/70 rounded flex flex-col justify-start p-1 pointer-events-none"
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.width * 100}%`,
            height: `${zone.height * 100}%`
          }}
        >
          <span className="text-[9px] font-bold text-amber-900 bg-amber-100/90 px-1 py-0.2 rounded inline-block w-max font-mono">
            {zone.label || `文字预留区 #${idx + 1}`}
          </span>
        </div>
      ))}

      {/* 3. Subject Bounds Box (Green or Red if conflict) */}
      {subjectSlotStyle && (
        <div
          className={`absolute border-2 rounded pointer-events-none transition-all ${
            isSubjectConflict
              ? 'border-rose-500 bg-rose-500/15'
              : 'border-emerald-500/80 bg-emerald-500/10'
          }`}
          style={subjectSlotStyle}
        >
          <span
            className={`absolute -top-4 left-0 text-[8px] font-mono font-bold px-1 rounded ${
              isSubjectConflict
                ? 'bg-rose-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {isSubjectConflict ? '⚠️ 主体冲突 / 越界' : '✓ 产品主体'}
          </span>
        </div>
      )}

      {/* 4. Focal Point Crosshair */}
      {showFocalPoint && focalPoint && (
        <div
          className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center pointer-events-none"
          style={{
            left: `${focalPoint.x * 100}%`,
            top: `${focalPoint.y * 100}%`
          }}
        >
          <div className="w-6 h-6 rounded-full border-2 border-red-500 bg-red-500/20 flex items-center justify-center shadow-md animate-pulse">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
          </div>
          <div className="absolute top-7 bg-black/75 text-white text-[8px] font-mono px-1 rounded whitespace-nowrap">
            Focal ({focalPoint.x.toFixed(2)}, {focalPoint.y.toFixed(2)})
          </div>
        </div>
      )}
    </div>
  );
};
