import React from 'react';
import { ImagePlus, AlertCircle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { EngineConfigSelector } from './AgentPanel';

interface BatchConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  info: {
    existingCount: number;
    missingCount: number;
    failedCount: number;
    missingSceneNumbers: number[];
  } | null;
  selectedModel?: string;
  setSelectedModel?: (m: string) => void;
  selectedResolution?: '1K' | '2K' | '4K';
  setSelectedResolution?: (r: '1K' | '2K' | '4K') => void;
}

export const BatchConfirmModal: React.FC<BatchConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  info,
  selectedModel,
  setSelectedModel,
  selectedResolution,
  setSelectedResolution
}) => {
  if (!isOpen || !info) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E5E0D8] space-y-4 relative">
        {/* Close icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1 rounded-full hover:bg-stone-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center shrink-0">
            <ImagePlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#2C2622]">九屏批量图片生成确认</h3>
            <p className="text-xs text-stone-500">自动识别缺失分镜并创建受控并发任务队列</p>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="bg-[#FAF8F5] p-3.5 rounded-2xl border border-[#E5E0D8]/80 space-y-2.5">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
            本次批次计划概要
          </span>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white p-2.5 rounded-xl border border-[#E5E0D8] flex items-center justify-between">
              <span className="text-stone-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                已完成
              </span>
              <span className="font-mono font-bold text-emerald-700">{info.existingCount} 屏</span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-[#B28C5A]/40 flex items-center justify-between shadow-xs">
              <span className="text-stone-700 font-medium flex items-center gap-1.5">
                <ImagePlus className="w-3.5 h-3.5 text-[#B28C5A]" />
                待生成
              </span>
              <span className="font-mono font-bold text-[#B28C5A] text-sm">{info.missingCount} 屏</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[#E5E0D8]/60 text-xs text-stone-600">
            <div className="flex justify-between items-center">
              <span>受控最大并发上限：</span>
              <span className="font-mono font-bold text-stone-800">2 个并发请求</span>
            </div>
            <div className="flex justify-between items-center">
              <span>预计产生 API 真实请求：</span>
              <span className="font-mono font-bold text-stone-800">{info.missingCount} 次</span>
            </div>
            <div className="flex justify-between items-center">
              <span>待处理分镜编号：</span>
              <span className="font-mono font-bold text-[#B28C5A]">
                {info.missingSceneNumbers.map(n => `#${n}`).join(', ')}
              </span>
            </div>
          </div>
        </div>

        {/* Model & Resolution Selector */}
        {selectedModel && setSelectedModel && selectedResolution && setSelectedResolution && (
          <EngineConfigSelector
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            selectedResolution={selectedResolution}
            setSelectedResolution={setSelectedResolution}
          />
        )}

        {/* Safety Note */}
        <div className="flex items-start gap-2.5 text-xs text-stone-600 bg-amber-50/80 p-3 rounded-xl border border-amber-200/60">
          <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            已有图片的屏数已被智能保留，绝对不会被重复覆盖或重新计费生成。
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] shadow-md transition-all flex items-center gap-1.5"
          >
            <ImagePlus className="w-4 h-4" />
            <span>确认启动批量生成</span>
          </button>
        </div>
      </div>
    </div>
  );
};
