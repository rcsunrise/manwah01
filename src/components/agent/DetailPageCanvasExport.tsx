import React, { useState, useEffect } from 'react';
import { DetailPageCanvasConfig, DetailPageExportResult } from '../../types';
import { Download, Layout, ShieldCheck, Palette, Scissors, Sparkles, Check, FileImage, Layers, ZoomIn } from 'lucide-react';

interface DetailPageCanvasExportProps {
  runId: string;
  onExportCanvas: (config: DetailPageCanvasConfig) => Promise<DetailPageExportResult | null>;
}

const getCssAspectRatio = (ratioStr?: string): string => {
  if (!ratioStr || ratioStr === 'Auto' || ratioStr === 'Custom') return '3/4';
  const parts = String(ratioStr).split(':');
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h) && h > 0) {
      return `${w}/${h}`;
    }
  }
  return '3/4';
};

export const DetailPageCanvasExport: React.FC<DetailPageCanvasExportProps> = ({
  runId,
  onExportCanvas
}) => {
  const [config, setConfig] = useState<DetailPageCanvasConfig>({
    widthPx: 750,
    showBrandHeader: true,
    showFooterGuarantee: true,
    showSellingPointOverlay: true,
    themeColor: '#f59e0b',
    screenSpacingPx: 0
  });

  const [exportResult, setExportResult] = useState<DetailPageExportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'slices'>('preview');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const handleGenerateCanvas = async (newConfig?: DetailPageCanvasConfig) => {
    setIsExporting(true);
    try {
      const cfg = newConfig || config;
      const res = await onExportCanvas(cfg);
      if (res) {
        setExportResult(res);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    handleGenerateCanvas();
  }, [runId]);

  const handleDownloadLongImage = () => {
    if (!exportResult) return;
    const link = document.createElement('a');
    link.href = exportResult.longImageUrl;
    link.download = `敏华详情页_长图_${exportResult.config.widthPx}px.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess('长图已成功下载！');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleDownloadSingleSlice = (sliceUrl: string, index: number, title: string) => {
    const link = document.createElement('a');
    link.href = sliceUrl;
    link.download = `第${index}屏_${title}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(`第 ${index} 屏分切图已下载`);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  return (
    <div className="bg-stone-900 rounded-2xl border border-stone-800 shadow-2xl overflow-hidden text-stone-100">
      {/* Phase 5 Header */}
      <div className="bg-stone-950 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scissors className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold tracking-tight text-white">Phase 5: 详情页图文拼合排版与智能切图导出</h2>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              支持淘宝/天猫/京东三端预设
            </span>
          </div>
          <p className="text-stone-400 text-xs">
            无缝缝合 9 屏渲染结果，自动叠加品牌 Head 头图与 10 年质保售后 Footer，提供一键长图与 9 屏分切包导出
          </p>
        </div>

        <div className="flex items-center gap-2">
          {downloadSuccess && (
            <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1 bg-emerald-950 border border-emerald-800 px-3 py-1.5 rounded-lg">
              <Check className="w-3.5 h-3.5" /> {downloadSuccess}
            </span>
          )}
          <button
            onClick={handleDownloadLongImage}
            disabled={!exportResult}
            className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-5 py-2.5 rounded-xl transition shadow flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>导出高清无缝长图</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Left Controls Column */}
        <div className="lg:col-span-4 p-5 border-r border-stone-800 space-y-6 bg-stone-900/50">
          <div>
            <h3 className="text-xs font-bold text-stone-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layout className="w-4 h-4 text-amber-400" />
              电商平台与幅宽预设
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { width: 750, label: '淘宝/天猫', desc: '750px 标准' },
                { width: 800, label: '京东旗舰', desc: '800px 宽屏' },
                { width: 1200, label: '移动全端', desc: '1200px 4K' }
              ].map((p) => (
                <button
                  key={p.width}
                  onClick={() => {
                    const newCfg = { ...config, widthPx: p.width };
                    setConfig(newCfg);
                    handleGenerateCanvas(newCfg);
                  }}
                  className={`p-2.5 rounded-xl text-left border transition ${
                    config.widthPx === p.width
                      ? 'bg-amber-500/10 border-amber-500 text-amber-300'
                      : 'bg-stone-950/50 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200'
                  }`}
                >
                  <div className="text-xs font-bold">{p.label}</div>
                  <div className="text-[10px] opacity-70">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-stone-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              排版与图层合成开关
            </h3>
            <div className="space-y-2.5 text-xs text-stone-300">
              <label className="flex items-center justify-between p-2.5 bg-stone-950/60 rounded-xl border border-stone-800 cursor-pointer hover:border-stone-700">
                <span>添加敏华品牌 Header 头部</span>
                <input
                  type="checkbox"
                  checked={config.showBrandHeader}
                  onChange={(e) => {
                    const newCfg = { ...config, showBrandHeader: e.target.checked };
                    setConfig(newCfg);
                    handleGenerateCanvas(newCfg);
                  }}
                  className="rounded text-amber-500 focus:ring-amber-400 bg-stone-900 border-stone-700"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-stone-950/60 rounded-xl border border-stone-800 cursor-pointer hover:border-stone-700">
                <span>添加官方正品 10 年质保 Footer</span>
                <input
                  type="checkbox"
                  checked={config.showFooterGuarantee}
                  onChange={(e) => {
                    const newCfg = { ...config, showFooterGuarantee: e.target.checked };
                    setConfig(newCfg);
                    handleGenerateCanvas(newCfg);
                  }}
                  className="rounded text-amber-500 focus:ring-amber-400 bg-stone-900 border-stone-700"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-stone-950/60 rounded-xl border border-stone-800 cursor-pointer hover:border-stone-700">
                <span>显示 4K 视觉影棚 Selling Point 水印</span>
                <input
                  type="checkbox"
                  checked={config.showSellingPointOverlay}
                  onChange={(e) => {
                    const newCfg = { ...config, showSellingPointOverlay: e.target.checked };
                    setConfig(newCfg);
                    handleGenerateCanvas(newCfg);
                  }}
                  className="rounded text-amber-500 focus:ring-amber-400 bg-stone-900 border-stone-700"
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-stone-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-amber-400" />
              主题色与分屏间距
            </h3>
            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-stone-400 block mb-1.5">品牌高光 Accent 颜色:</span>
                <div className="flex items-center gap-2">
                  {['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#ffffff'].map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        const newCfg = { ...config, themeColor: color };
                        setConfig(newCfg);
                        handleGenerateCanvas(newCfg);
                      }}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        config.themeColor === color ? 'border-amber-400 scale-110' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                  <span>屏与屏接缝间距:</span>
                  <span className="font-mono text-amber-400">{config.screenSpacingPx}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={config.screenSpacingPx}
                  onChange={(e) => {
                    const newCfg = { ...config, screenSpacingPx: Number(e.target.value) };
                    setConfig(newCfg);
                    handleGenerateCanvas(newCfg);
                  }}
                  className="w-full accent-amber-500 bg-stone-950 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Live Canvas Preview Column */}
        <div className="lg:col-span-8 p-5 flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2 bg-stone-950 p-1 rounded-xl border border-stone-800">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'preview'
                    ? 'bg-amber-500 text-stone-950'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                无缝全景长图预览
              </button>
              <button
                onClick={() => setActiveTab('slices')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'slices'
                    ? 'bg-amber-500 text-stone-950'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                <FileImage className="w-3.5 h-3.5" />
                智能 9 屏分切图 ({exportResult?.slices.length || 0})
              </button>
            </div>

            {exportResult && (
              <span className="text-stone-400 text-xs font-mono">
                画布分辨率: {exportResult.config.widthPx} x {exportResult.totalHeightPx} px
              </span>
            )}
          </div>

          {activeTab === 'preview' ? (
            <div className="bg-stone-950 rounded-xl p-4 border border-stone-800 max-h-[600px] overflow-y-auto flex justify-center custom-scrollbar">
              {exportResult ? (
                <div className="relative shadow-2xl transition-all duration-300" style={{ width: `${Math.min(exportResult.config.widthPx, 480)}px` }}>
                  <img
                    src={exportResult.longImageUrl}
                    alt="敏华爆款详情长图"
                    className="w-full h-auto rounded border border-stone-800 shadow-xl"
                  />
                </div>
              ) : (
                <div className="py-20 text-center text-stone-500 text-xs flex flex-col items-center gap-2">
                  <Sparkles className="w-8 h-8 text-stone-600 animate-pulse" />
                  <span>准备合成长图画布...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto p-1 custom-scrollbar">
              {exportResult?.slices.map((slice) => (
                <div
                  key={slice.screenIndex}
                  className="bg-stone-950 border border-stone-800 rounded-xl p-3 flex flex-col justify-between space-y-2 hover:border-amber-500/50 transition group"
                >
                  <div
                    className="relative bg-stone-900 rounded-lg overflow-hidden border border-stone-800 flex items-center justify-center min-h-[140px]"
                    style={{ aspectRatio: getCssAspectRatio(slice.aspectRatio) }}
                  >
                    <img
                      src={slice.sliceImageUrl}
                      alt={slice.title}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 bg-stone-900/80 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/30">
                      第 {slice.screenIndex} 屏
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-bold text-stone-200 line-clamp-1">{slice.title}</span>
                    <span className="text-[10px] text-stone-500 block font-mono">{slice.width}x{slice.height}px</span>
                  </div>

                  <button
                    onClick={() => handleDownloadSingleSlice(slice.sliceImageUrl, slice.screenIndex, slice.title)}
                    className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1"
                  >
                    <Download className="w-3 h-3 text-amber-400" /> 单屏导出
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
