import React, { useState } from 'react';
import { DetailPagePlan, DetailPageScreenPlan } from '../../types';
import { Sparkles, CheckCircle, Lock, Edit3, ArrowRight, ShieldAlert, Layers } from 'lucide-react';

interface PlanConfirmationProps {
  plan: DetailPagePlan;
  onApprovePlan: () => Promise<void>;
  onRegeneratePlan: (promptHint: string) => Promise<void>;
  isGenerating?: boolean;
}

export const PlanConfirmation: React.FC<PlanConfirmationProps> = ({
  plan,
  onApprovePlan,
  onRegeneratePlan,
  isGenerating = false
}) => {
  const [promptHint, setPromptHint] = useState('');
  const [selectedScreen, setSelectedScreen] = useState<DetailPageScreenPlan | null>(
    plan.screens && plan.screens.length > 0 ? plan.screens[0] : null
  );
  const [approving, setApproving] = useState(false);

  const isApproved = !!plan.confirmedAt;

  const handleApprove = async () => {
    try {
      setApproving(true);
      await onApprovePlan();
    } catch (e) {
      console.error(e);
    } finally {
      setApproving(false);
    }
  };

  const handleRegenerate = async () => {
    await onRegeneratePlan(promptHint);
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden text-stone-800">
      {/* Plan Header */}
      <div className="bg-stone-900 text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold tracking-tight">{plan.themeTitle}</h2>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              v{plan.version} 策划全案
            </span>
          </div>
          <p className="text-stone-400 text-xs">
            调性：{plan.overallStyle} · 目标客群：{plan.targetAudience}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isApproved ? (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold">
              <CheckCircle className="w-4 h-4 text-emerald-400" /> 方案已通过并锁定
            </span>
          ) : (
            <button
              onClick={handleApprove}
              disabled={approving || isGenerating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {approving ? '锁定方案中...' : '确认并锁定 9 屏方案'}
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 p-5 gap-6">
        {/* Left Column: 9-Screen Overview List */}
        <div className="lg:col-span-1 space-y-2 max-h-[600px] overflow-y-auto pr-1">
          <span className="text-xs font-bold text-stone-500 flex items-center gap-1 mb-2">
            <Layers className="w-4 h-4 text-stone-700" /> 9 屏分屏策划结构
          </span>

          {plan.screens?.map((screen, idx) => {
            const isSelected = selectedScreen?.screenIndex === screen.screenIndex;
            return (
              <button
                key={idx}
                onClick={() => setSelectedScreen(screen)}
                className={`w-full text-left p-3 rounded-xl transition border text-xs flex flex-col gap-1 ${
                  isSelected
                    ? 'bg-amber-50 border-amber-400 text-stone-900 shadow-sm font-medium'
                    : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">
                    第 {screen.screenIndex} 屏: {screen.screenTitle}
                  </span>
                  <span className="text-[10px] bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded font-mono">
                    {screen.aspectRatio}
                  </span>
                </div>
                <p className="text-stone-500 text-[11px] line-clamp-1">{screen.coreSellingPoint}</p>
              </button>
            );
          })}
        </div>

        {/* Right Column: Detailed Screen Spec & Prompt Preview */}
        <div className="lg:col-span-2 bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-4">
          {selectedScreen ? (
            <>
              <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                <div>
                  <h3 className="font-bold text-stone-900 text-base">
                    第 {selectedScreen.screenIndex} 屏 - {selectedScreen.screenTitle}
                  </h3>
                  <p className="text-stone-500 text-xs mt-0.5">{selectedScreen.coreSellingPoint}</p>
                </div>
                <span className="bg-stone-200 text-stone-800 text-xs px-2.5 py-1 rounded-md font-mono font-bold">
                  {selectedScreen.aspectRatio}
                </span>
              </div>

              {/* Composition & Lighting */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-stone-400 font-semibold block mb-1">视觉构图与摄影视角</span>
                  <p className="text-stone-700">{selectedScreen.visualComposition}</p>
                </div>

                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-stone-400 font-semibold block mb-1">灯光与环境布景</span>
                  <p className="text-stone-700">{selectedScreen.lightingAndAtmosphere}</p>
                </div>
              </div>

              {/* Prompt Suggestion */}
              <div className="bg-stone-900 text-stone-100 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs text-amber-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> AI 绘图推荐提示词 (Prompt Suggestion)
                  </span>
                </div>
                <p className="text-xs font-mono bg-stone-950 p-2.5 rounded-lg border border-stone-800 text-amber-200/90 leading-relaxed break-words">
                  {selectedScreen.promptSuggestion}
                </p>
              </div>

              {/* DNA Locked Rules */}
              {selectedScreen.lockedRules && selectedScreen.lockedRules.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200/70 p-3 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-amber-900 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-amber-600" /> 本屏 DNA 强锁定约束
                  </span>
                  <ul className="list-disc list-inside text-stone-700 space-y-0.5 pl-1 text-[11px]">
                    {selectedScreen.lockedRules.map((rule, idx) => (
                      <li key={idx}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-stone-400 text-xs">
              请在左侧选择一屏以查看详细的视觉构图与提示词
            </div>
          )}

          {/* Regenerate / Fine-tune Bar */}
          {!isApproved && (
            <div className="pt-3 border-t border-stone-200 space-y-2">
              <span className="text-xs font-bold text-stone-600 flex items-center gap-1">
                <Edit3 className="w-3.5 h-3.5" /> 对全案提出修改意见并重新生成 (如：加强奢华感、强调无级调节功能)
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="请输入您的修改或补充建议..."
                  value={promptHint}
                  onChange={e => setPromptHint(e.target.value)}
                  className="text-xs px-3 py-2 border border-stone-300 rounded-lg flex-1 focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="bg-stone-900 hover:bg-stone-800 text-white text-xs px-4 py-2 rounded-lg font-bold transition flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {isGenerating ? '生成中...' : '重新生成全案'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
