import React, { useRef, useState } from 'react';
import { Eye, CheckCircle2, X, Sparkles, Upload, ShieldCheck, Sliders, Layers, RefreshCw } from 'lucide-react';

export interface GptImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  uploadedImageUrl?: string | null;
  onUploadNewImage?: (base64: string) => void;
  screenIndex?: number;
  screenTitle?: string;
  promptSuggestion?: string;
  selectedModel?: string;
  selectedResolution?: string;
}

export const GptImagePreviewModal: React.FC<GptImagePreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  uploadedImageUrl,
  onUploadNewImage,
  screenIndex,
  screenTitle,
  promptSuggestion,
  selectedModel = 'gpt-image-2',
  selectedResolution = '2K'
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localImage, setLocalImage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentImg = localImage || uploadedImageUrl;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const b64 = event.target?.result as string;
        if (b64) {
          setLocalImage(b64);
          if (onUploadNewImage) {
            onUploadNewImage(b64);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const formattedScene = screenIndex ? `第 ${screenIndex} 屏` : '选定分镜';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#FAF8F5] rounded-3xl p-6 shadow-2xl border border-[#E5E0D8] space-y-5 relative overflow-hidden">
        {/* Subtle decorative top border highlight */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-[#B28C5A] to-yellow-600" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-200/60 transition-colors"
          title="关闭"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pr-8">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2C2622] to-[#423933] text-amber-400 flex items-center justify-center shadow-md shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-[#2C2622]">gpt-image-2 图像预检与参数确认</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#B28C5A]/15 text-[#8C6F43] border border-[#B28C5A]/30">
                GPT-IMAGE-2
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              在提交至 VectorEngine API (/v1/images/edits) 之前，请确认您的参考原图与生成参数
            </p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Reference Image Preview */}
          <div className="flex flex-col bg-white rounded-2xl p-3.5 border border-[#E5E0D8] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#2C2622] flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#B28C5A]" />
                用户已上传参考原图
              </span>
              <span className="text-[10px] font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-medium">
                {currentImg ? '已载入原图' : '未检测到图片'}
              </span>
            </div>

            {/* Image Preview Box */}
            <div className="relative w-full h-56 bg-[#FAF8F5] rounded-xl border border-dashed border-[#E5E0D8] overflow-hidden flex items-center justify-center group">
              {currentImg ? (
                <>
                  <img
                    src={currentImg}
                    alt="Uploaded Reference"
                    className="w-full h-full object-contain p-2"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-white/90 hover:bg-white text-xs font-bold text-[#2C2622] flex items-center gap-1.5 shadow-lg transition-transform transform hover:scale-105"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#B28C5A]" />
                      更换参考图片
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center p-4 space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-stone-100 text-stone-400 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-stone-500 font-medium">尚无已保存的主角原图</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-[#B28C5A] text-white text-xs font-bold hover:bg-[#8C6F43] transition-colors"
                  >
                    即刻上传图片
                  </button>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
              <span>图片传输格式: multipart/form-data</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[#B28C5A] hover:underline font-medium"
              >
                重新上传...
              </button>
            </div>
          </div>

          {/* Right: API Parameters & Prompt Overview */}
          <div className="flex flex-col bg-white rounded-2xl p-3.5 border border-[#E5E0D8] justify-between space-y-3">
            <div className="space-y-3">
              <span className="text-xs font-bold text-[#2C2622] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#B28C5A]" />
                gpt-image-2 接口调用规范
              </span>

              {/* Parameters List */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/60">
                  <span className="text-stone-500">目标分镜:</span>
                  <span className="font-bold text-[#2C2622]">{formattedScene} {screenTitle ? `(${screenTitle})` : ''}</span>
                </div>

                <div className="flex justify-between items-center bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/60">
                  <span className="text-stone-500">模型 API:</span>
                  <span className="font-mono font-bold text-[#8C6F43] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    gpt-image-2
                  </span>
                </div>

                <div className="flex justify-between items-center bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/60">
                  <span className="text-stone-500">分级画质 (Quality):</span>
                  <span className="font-bold text-stone-800">high (高清模式)</span>
                </div>

                <div className="flex justify-between items-center bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/60">
                  <span className="text-stone-500">生成尺寸 (Size):</span>
                  <span className="font-mono font-bold text-stone-800">
                    {selectedResolution === '4K' ? '2160x3840 (4K)' : selectedResolution === '2K' ? '1024x1536 (2K)' : '1024x1024'}
                  </span>
                </div>

                <div className="flex justify-between items-center bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/60">
                  <span className="text-stone-500">背景透明度 (Background):</span>
                  <span className="font-bold text-emerald-700">auto (自动选择)</span>
                </div>

                <div className="flex justify-between items-center bg-[#FAF8F5] p-2 rounded-lg border border-[#E5E0D8]/60">
                  <span className="text-stone-500">内容审核 (Moderation):</span>
                  <span className="font-bold text-stone-700">low (低限制模式)</span>
                </div>
              </div>

              {/* Prompt preview */}
              {promptSuggestion && (
                <div className="bg-[#F9F5EF] p-2.5 rounded-xl border border-[#B28C5A]/30 text-xs">
                  <span className="text-[10px] font-bold text-[#8C6F43] uppercase block mb-1">提示词摘要 (Prompt)</span>
                  <p className="text-stone-700 font-mono text-[11px] line-clamp-3 leading-relaxed">
                    {promptSuggestion}
                  </p>
                </div>
              )}
            </div>

            {/* Safety tag */}
            <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200/80">
              <ShieldCheck className="w-4 h-4 shrink-0 text-amber-700" />
              <span>原图将封装进 FormData 并随 Prompt 直接提交后端 API。</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E5E0D8]">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Layers className="w-4 h-4 text-[#B28C5A]" />
            <span>确认无误后即可启动生成</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              disabled={!currentImg}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#2C2622] via-[#8C6F43] to-[#B28C5A] hover:opacity-95 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>确认并使用 gpt-image-2 生成</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
