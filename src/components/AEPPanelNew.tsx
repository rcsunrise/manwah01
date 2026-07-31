import React from 'react';
import { Pin, TrendingUp, Paperclip, RefreshCw, Box, SlidersHorizontal } from 'lucide-react';
import { AEPData } from '../types';

export interface AEPPanelProps {
  data: any;
  onUpdate: (data: any) => void;
  isOpen: boolean;
  onToggle: () => void;
  isPinned: boolean;
  onPinToggle: () => void;
  onGenerateImageRouterHub?: () => void;
}

export const AEPPanel: React.FC<AEPPanelProps> = ({ data, onUpdate, isOpen, onToggle, isPinned, onPinToggle, onGenerateImageRouterHub }) => {
  const visible = isOpen;
  
  // Default R&D specs to show if none are provided
  const localDimensions = data?.localDimensions && data.localDimensions.length > 0 
    ? data.localDimensions 
    : [
         { part: '座高', value: '420mm' },
         { part: '座宽', value: '880mm' },
         { part: '座深', value: '650mm' },
         { part: '扶手宽度', value: '260mm' },
         { part: '靠背高度', value: '820mm' },
         { part: '脚高', value: '20mm' },
      ];

  const rawTrend = data?.trendScore;
  const trendScoreValue = typeof rawTrend === 'number' ? rawTrend : parseFloat(rawTrend) || 0;
  // Normalize: if the API returned e.g. 8.5 instead of 0.85, normalize it to 0-1
  const normalizedTrend = trendScoreValue > 1 ? trendScoreValue / 10 : (trendScoreValue > 0 ? trendScoreValue : 0);
  const trendPercent = Math.round(normalizedTrend * 100);
  const displayScore = trendScoreValue > 1 ? trendScoreValue : trendScoreValue * 10;

  return (
    <div className={`fixed right-0 top-0 bottom-0 w-[400px] bg-[#FCFBF8] shadow-2xl border-l border-brand-taupe/50 p-6 pt-5 flex flex-col z-40 transition-transform duration-300 ease-in-out ${visible ? 'translate-x-0' : 'translate-x-[100%]'}`}>
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8 shrink-0">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 flex items-center justify-center bg-white border border-brand-taupe rounded-[10px] shadow-sm text-brand-gold">
             <SlidersHorizontal className="w-4 h-4" strokeWidth={2.5}/>
           </div>
           <div className="flex flex-col">
             <h2 className="text-sm font-bold font-serif tracking-widest text-brand-charcoal leading-tight">AEP 美学特征</h2>
             <span className="text-[8px] font-bold tracking-widest uppercase text-stone-400 mt-0.5">Aesthetic Features</span>
           </div>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={onPinToggle} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isPinned ? 'bg-brand-gold text-white shadow-md' : 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20'}`} title={isPinned ? 'Unpin' : 'Pin'}>
              <Pin className="w-3.5 h-3.5" strokeWidth={2.5} />
           </button>
           <button onClick={onToggle} className="text-stone-400 hover:text-stone-600 transition-colors w-6 h-8 flex items-center justify-center">
              <span className="text-xl leading-none -mt-1 font-light">›</span>
           </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4 pb-12">
         {!data ? (
             <div className="flex flex-col items-center justify-center h-full text-center text-stone-400 space-y-3 opacity-60">
                 <Box className="w-10 h-10 stroke-1" />
                 <p className="text-xs">上传图片并运行特征提取</p>
             </div>
         ) : (
             <div className="flex flex-col gap-8">
                 
                 {/* L1 风格定位 */}
                 <div className="space-y-4">
                   <div className="flex justify-between items-center">
                     <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">L1 风格定位</h3>
                     <button className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-stone-100 hover:bg-stone-50 rounded-full text-[9px] text-brand-gold font-bold shadow-sm transition-colors">
                        <RefreshCw className="w-2 h-2" strokeWidth={3} /> 灵感刷新
                     </button>
                   </div>
                   
                   <div className="p-4 bg-white rounded-2xl border border-stone-100 flex justify-between items-center premium-shadow">
                      <span className="text-[15px] font-bold text-brand-charcoal tracking-wide truncate pr-2">{data?.style || "分析中..."}</span>
                      <div className="relative w-[52px] h-[52px] shrink-0 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                             {/* Background track */}
                             <path
                               className="text-stone-100"
                               strokeWidth="3.5"
                               stroke="currentColor"
                               fill="none"
                               d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                             />
                             {/* Foreground track */}
                             <path
                               className="text-brand-gold drop-shadow-sm transition-all duration-1000 ease-in-out"
                               strokeWidth="3.5"
                               strokeDasharray={`${trendPercent}, 100`}
                               strokeLinecap="round"
                               stroke="currentColor"
                               fill="none"
                               d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                             />
                          </svg>
                          <span className="absolute text-[10px] font-bold text-brand-charcoal">{displayScore.toFixed(2)}</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-1.5 text-brand-gold/60">
                     <TrendingUp className="w-3 h-3" />
                     <span className="text-[9px] text-stone-500 font-medium tracking-wide">趋势指数 (Trend Score)</span>
                   </div>
                 </div>

                 <div className="h-px bg-stone-200/80 w-full" />

                 {/* DIM 尺寸与研发参考 */}
                 <div className="space-y-5">
                   <div className="flex justify-between items-center">
                     <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">DIM 尺寸与研发参考</h3>
                     <button className="flex items-center gap-1.5 text-[9px] text-stone-400 font-bold hover:text-stone-600 transition-colors">
                        <Paperclip className="w-2.5 h-2.5" /> 估算参考
                     </button>
                   </div>

                   <div className="flex gap-2">
                     <div className="flex-1 bg-white border border-stone-100 hover:border-brand-taupe transition-colors rounded-[14px] p-3 flex flex-col items-center justify-center shadow-sm">
                       <span className="text-[8px] text-stone-400 font-bold mb-1 tracking-widest uppercase">Width (W)</span>
                       <span className="text-[13px] font-bold text-brand-charcoal">{data?.dimensionEstimate?.estW || '---'}</span>
                     </div>
                     <div className="flex-1 bg-white border border-stone-100 hover:border-brand-taupe transition-colors rounded-[14px] p-3 flex flex-col items-center justify-center shadow-sm">
                       <span className="text-[8px] text-stone-400 font-bold mb-1 tracking-widest uppercase">Depth (D)</span>
                       <span className="text-[13px] font-bold text-brand-charcoal">{data?.dimensionEstimate?.estD || '---'}</span>
                     </div>
                     <div className="flex-1 bg-white border border-stone-100 hover:border-brand-taupe transition-colors rounded-[14px] p-3 flex flex-col items-center justify-center shadow-sm">
                       <span className="text-[8px] text-stone-400 font-bold mb-1 tracking-widest uppercase">Height (H)</span>
                       <span className="text-[13px] font-bold text-brand-charcoal">{data?.dimensionEstimate?.estH || '---'}</span>
                     </div>
                   </div>

                   <div className="space-y-2">
                     <div className="text-[9px] font-bold text-stone-400 tracking-wider">局部尺寸参考 (R&D)</div>
                     <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
                        {localDimensions.map((dim: any, i: number) => (
                          <div key={i} className="flex justify-between items-center px-4 py-[11px] border-b border-stone-50 last:border-0 hover:bg-stone-50/50 transition-colors">
                             <span className="text-[11px] font-medium text-stone-500">{dim.part}</span>
                             <span className="text-[11px] font-bold text-brand-gold">{dim.value}</span>
                          </div>
                        ))}
                     </div>
                   </div>
                 </div>

                 {/* L2 结构特征 */}
                 <div className="space-y-3.5">
                   <div className="flex justify-between items-center">
                     <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">L2 结构特征</h3>
                     <button className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-stone-100 hover:bg-stone-50 rounded-full text-[9px] text-brand-gold font-bold shadow-sm transition-colors">
                        <RefreshCw className="w-2 h-2" strokeWidth={3} /> 灵感刷新
                     </button>
                   </div>
                   <div className="flex flex-wrap gap-2.5">
                       {Array.isArray(data?.l2_structure) && data.l2_structure.map((str: string, i: number) => (
                          <span key={`l2-${i}`} className="px-3.5 py-[7px] bg-white border border-stone-100 text-stone-600 rounded-[12px] text-[10px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:border-brand-taupe">
                            {str}
                          </span>
                       ))}
                   </div>
                 </div>

                 {/* L3 材质肌理 */}
                 <div className="space-y-3.5 pt-2">
                   <div className="flex justify-between items-center">
                     <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">L3 材质肌理</h3>
                     <button className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-stone-100 hover:bg-stone-50 rounded-full text-[9px] text-brand-gold font-bold shadow-sm transition-colors">
                        <RefreshCw className="w-2 h-2" strokeWidth={3} /> 灵感刷新
                     </button>
                   </div>
                   <div className="flex flex-wrap gap-2.5">
                       {Array.isArray(data?.l3_material) && data.l3_material.map((mat: string, i: number) => (
                          <span key={`l3-${i}`} className="px-3.5 py-[7px] bg-white border border-stone-100 text-stone-600 rounded-[12px] text-[10px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:border-brand-taupe">
                            {mat}
                          </span>
                       ))}
                   </div>
                 </div>

                 <div className="h-px bg-stone-200/80 w-full mt-2" />

                 {/* PHY 物理属性 */}
                 <div className="space-y-7 pt-2">
                   <div className="flex justify-between items-center">
                     <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">PHY 物理属性</h3>
                     <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-medium text-stone-400 tracking-widest">参数即所得</span>
                        <div className="w-2 h-2 rounded-full bg-[#34d399] shadow-sm"></div>
                     </div>
                   </div>

                   <div className="space-y-9">
                      {/* Glossiness Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-4">
                           <div className="flex items-baseline gap-2">
                             <span className="text-[11px] font-bold text-stone-600">光泽度</span>
                             <span className="text-[9px] text-stone-400 font-medium tracking-wide">(Glossiness)</span>
                           </div>
                           <div className="px-2 py-0.5 bg-brand-gold/10 text-brand-gold font-bold text-[10px] rounded shrink-0">
                              {data?.phy?.glossiness || 0}%
                           </div>
                        </div>

                        <div className="px-1 mt-6">
                           <div className="relative h-[6px]">
                             <div className="absolute inset-x-0 top-0 bottom-0 bg-stone-200 rounded-full" />
                             <div className="absolute left-0 top-0 bottom-0 bg-[#E5DFD4] rounded-full" style={{ width: `${data?.phy?.glossiness || 0}%` }} />
                             <div className="absolute top-1/2 -mt-[9px] w-[18px] h-[18px] bg-[#57534E] rounded-full shadow-sm z-10 transition-all duration-300 pointer-events-none" style={{ left: `calc(${data?.phy?.glossiness || 0}% - 9px)` }} />
                           </div>
                           
                           <div className="flex justify-between items-center mt-3">
                              <span className="text-[9px] font-medium text-stone-400 w-1/3 text-left">哑光 (Matte)</span>
                              <span className="text-[9px] text-brand-gold font-bold w-1/3 text-center">丝光 (Satin)</span>
                              <span className="text-[9px] font-medium text-stone-400 w-1/3 text-right">高光 (High Gloss)</span>
                           </div>
                        </div>
                      </div>

                      {/* Roughness Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-4">
                           <div className="flex items-baseline gap-2">
                             <span className="text-[11px] font-bold text-stone-600">粗糙度</span>
                             <span className="text-[9px] text-stone-400 font-medium tracking-wide">(Roughness)</span>
                           </div>
                           <div className="px-2 py-0.5 bg-brand-gold/10 text-brand-gold font-bold text-[10px] rounded shrink-0">
                              {data?.phy?.roughness || 0}%
                           </div>
                        </div>

                        <div className="px-1 mt-6">
                           <div className="relative h-[6px]">
                             <div className="absolute inset-x-0 top-0 bottom-0 bg-stone-200 rounded-full" />
                             <div className="absolute left-0 top-0 bottom-0 bg-[#E5DFD4] rounded-full" style={{ width: `${data?.phy?.roughness || 0}%` }} />
                             <div className="absolute top-1/2 -mt-[9px] w-[18px] h-[18px] bg-[#57534E] rounded-full shadow-sm z-10 transition-all duration-300 pointer-events-none" style={{ left: `calc(${data?.phy?.roughness || 0}% - 9px)` }} />
                           </div>
                           
                           <div className="flex justify-between items-center mt-3">
                              <span className="text-[9px] font-medium text-stone-400 w-1/3 text-left">平滑 (Smooth)</span>
                              <span className="text-[9px] text-brand-gold font-bold w-1/3 text-center">肌理 (Textured)</span>
                              <span className="text-[9px] font-medium text-stone-400 w-1/3 text-right">粗旷 (Coarse)</span>
                           </div>
                        </div>
                      </div>
                      
                      {/* Visual Weight Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-4">
                           <div className="flex items-baseline gap-2">
                             <span className="text-[11px] font-bold text-stone-600">体量感</span>
                             <span className="text-[9px] text-stone-400 font-medium tracking-wide">(Visual Weight)</span>
                           </div>
                           <div className="px-2 py-0.5 bg-brand-gold/10 text-brand-gold font-bold text-[10px] rounded shrink-0">
                              {data?.phy?.visualWeight || 0}%
                           </div>
                        </div>

                        <div className="px-1 mt-6">
                           <div className="relative h-[6px]">
                             <div className="absolute inset-x-0 top-0 bottom-0 bg-stone-200 rounded-full" />
                             <div className="absolute left-0 top-0 bottom-0 bg-[#E5DFD4] rounded-full" style={{ width: `${data?.phy?.visualWeight || 0}%` }} />
                             <div className="absolute top-1/2 -mt-[9px] w-[18px] h-[18px] bg-[#57534E] rounded-full shadow-sm z-10 transition-all duration-300 pointer-events-none" style={{ left: `calc(${data?.phy?.visualWeight || 0}% - 9px)` }} />
                           </div>
                           
                           <div className="flex justify-between items-center mt-3">
                              <span className="text-[9px] font-medium text-stone-400 w-1/3 text-left">轻盈 (Light)</span>
                              <span className="text-[9px] text-brand-gold font-bold w-1/3 text-center">标准 (Standard)</span>
                              <span className="text-[9px] font-medium text-stone-400 w-1/3 text-right">厚重 (Heavy)</span>
                           </div>
                        </div>
                      </div>
                   </div>
                 </div>

                 {/* Marketing Section */}
                 <div className="h-px bg-stone-200/80 w-full mt-2" />
                 
                 <section className="space-y-5 pt-2">
                     <div>
                         <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mb-3">营销描述 (Marketing Copy)</h3>
                         <div className="p-4 bg-white border border-stone-100 rounded-2xl text-[11px] text-stone-600 italic shadow-sm leading-relaxed relative">
                             <span className="absolute -left-1.5 -top-1.5 text-2xl text-brand-taupe opacity-50 font-serif">"</span>
                             <p className="relative z-10">{data?.marketingCopy || "暂无描述"}</p>
                         </div>
                     </div>
                     <div>
                         <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mb-3">画面标签 (Scene Tags)</h3>
                         <div className="flex flex-wrap gap-2">
                             {Array.isArray(data?.keywords) && data.keywords.map((keyword: string, i: number) => (
                                 <span key={i} className="px-2 py-1 bg-stone-100 text-stone-500 rounded text-[9px] font-medium">{keyword}</span>
                             ))}
                         </div>
                     </div>
                 </section>
             </div>
         )}
      </div>
      
      {data && onGenerateImageRouterHub && (
          <div className="pt-4 border-t border-stone-200 mt-2 shrink-0 bg-[#FCFBF8]">
              <button 
                onClick={onGenerateImageRouterHub}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-brand-charcoal hover:bg-[#1a1816] text-white rounded-2xl text-[12px] font-bold shadow-lg shadow-stone-200/50 transition-all hover:shadow-xl"
               >
                 应用美学属性并开始生成
              </button>
          </div>
      )}

    </div>
  );
};
