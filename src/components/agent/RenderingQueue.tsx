import React, { useState } from 'react';
import { DetailPageRenderTask, DetailPageTaskBatch } from '../../types';
import { Sparkles, Play, RefreshCw, CheckCircle, AlertCircle, Eye, Image as ImageIcon, Loader2, Layers } from 'lucide-react';

interface RenderingQueueProps {
  batch: DetailPageTaskBatch;
  onExecuteTask: (taskId: string) => Promise<void>;
  onExecuteAll: () => Promise<void>;
  onRetryTask: (taskId: string, customPrompt?: string) => Promise<void>;
  isExecutingAll?: boolean;
}

export const RenderingQueue: React.FC<RenderingQueueProps> = ({
  batch,
  onExecuteTask,
  onExecuteAll,
  onRetryTask,
  isExecutingAll = false
}) => {
  const [selectedImage, setSelectedImage] = useState<DetailPageRenderTask | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);

  const handleSingleExecute = async (taskId: string) => {
    try {
      setExecutingTaskId(taskId);
      await onExecuteTask(taskId);
    } catch (e) {
      console.error(e);
    } finally {
      setExecutingTaskId(null);
    }
  };

  const handleRetrySubmit = async (taskId: string) => {
    try {
      setExecutingTaskId(taskId);
      await onRetryTask(taskId, customPrompt);
      setEditingTaskId(null);
      setCustomPrompt('');
    } catch (e) {
      console.error(e);
    } finally {
      setExecutingTaskId(null);
    }
  };

  const progressPercent = batch.totalTasks > 0 ? Math.round((batch.completedTasks / batch.totalTasks) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden text-stone-800">
      {/* Header & Batch Controls */}
      <div className="bg-stone-900 text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold tracking-tight">Phase 4: 图生图 9 屏渲染队列引擎</h2>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              {batch.completedTasks} / {batch.totalTasks} 已就绪
            </span>
          </div>
          <p className="text-stone-400 text-xs">
            基于已锁定的 9 屏策划与 DNA 特征图谱，并发推送 4K 超精细场景图片渲染
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onExecuteAll}
            disabled={isExecutingAll || batch.completedTasks === batch.totalTasks}
            className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-5 py-2.5 rounded-xl transition shadow flex items-center gap-2 disabled:opacity-50"
          >
            {isExecutingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                <span>批量渲染中 ({progressPercent}%)...</span>
              </>
            ) : batch.completedTasks === batch.totalTasks ? (
              <>
                <CheckCircle className="w-4 h-4 text-stone-950" />
                <span>全量 9 屏渲染已完成</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-stone-950" />
                <span>一键并行/队列渲染全部 9 屏</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-stone-100 border-b border-stone-200 px-5 py-3 flex items-center gap-4">
        <div className="flex-1 bg-stone-200 h-2 rounded-full overflow-hidden">
          <div
            className="bg-amber-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-xs font-mono font-bold text-stone-700 min-w-[50px] text-right">
          {progressPercent}%
        </span>
      </div>

      {/* Task Cards Grid */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {batch.tasks.map((task) => {
          const isTaskRunning = executingTaskId === task.id || (isExecutingAll && task.status === 'generating');

          return (
            <div
              key={task.id}
              className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col justify-between hover:border-stone-300 transition shadow-sm space-y-3"
            >
              {/* Task Title & Status */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-bold text-stone-900 text-xs">
                    第 {task.screenIndex} 屏: {task.screenTitle}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                      task.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : task.status === 'generating'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : task.status === 'failed'
                        ? 'bg-rose-100 text-rose-700 border border-rose-300'
                        : 'bg-stone-200 text-stone-600 border border-stone-300'
                    }`}
                  >
                    {task.status === 'completed' && <CheckCircle className="w-3 h-3 text-emerald-600" />}
                    {task.status === 'generating' && <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
                    {task.status === 'failed' && <AlertCircle className="w-3 h-3 text-rose-600" />}
                    {task.status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />}
                    {task.status === 'completed' ? '渲染就绪' : task.status === 'generating' ? '渲染中' : task.status === 'failed' ? '渲染失败' : '队列等待'}
                  </span>
                </div>

                <p className="text-stone-500 text-[11px] line-clamp-1 mb-2">{task.coreSellingPoint}</p>

                {/* Rendered Result Thumbnail or Placeholder */}
                <div className="relative aspect-[3/4] bg-stone-900 rounded-lg overflow-hidden border border-stone-800 group flex items-center justify-center">
                  {task.resultImageUrl ? (
                    <>
                      <img
                        src={task.resultImageUrl}
                        alt={task.screenTitle}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <button
                        onClick={() => setSelectedImage(task)}
                        className="absolute inset-0 bg-stone-900/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-xs gap-1 font-semibold"
                      >
                        <Eye className="w-5 h-5 text-amber-400" />
                        <span>点击放大预览 4K 细节</span>
                      </button>
                    </>
                  ) : isTaskRunning ? (
                    <div className="flex flex-col items-center gap-2 text-amber-400 p-4 text-center">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-xs font-semibold">AI 高清图生图光影合成中...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-stone-500 p-4 text-center">
                      <ImageIcon className="w-8 h-8 stroke-1 text-stone-600" />
                      <span className="text-[11px]">暂无渲染产物</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Task Footer Actions */}
              <div className="pt-2 border-t border-stone-200 flex items-center justify-between gap-2">
                <span className="text-[10px] text-stone-400 font-mono">
                  画幅 {task.aspectRatio} {task.retryCount > 0 && `· 重试x${task.retryCount}`}
                </span>

                <div className="flex items-center gap-1.5">
                  {task.status === 'completed' ? (
                    <button
                      onClick={() => {
                        setEditingTaskId(task.id);
                        setCustomPrompt(task.prompt);
                      }}
                      className="text-stone-600 hover:text-stone-900 bg-stone-200 hover:bg-stone-300 text-[11px] px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> 重构微调
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSingleExecute(task.id)}
                      disabled={isTaskRunning}
                      className="bg-stone-900 hover:bg-stone-800 text-white text-[11px] px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1 disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      {isTaskRunning ? '生成中' : '开始渲染'}
                    </button>
                  )}
                </div>
              </div>

              {/* Custom Retry Modal Drawer per Card */}
              {editingTaskId === task.id && (
                <div className="bg-stone-900 text-white p-3 rounded-xl space-y-2 mt-2">
                  <span className="text-xs font-bold text-amber-400 block">调整 Prompt 重新生成本屏:</span>
                  <textarea
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    rows={3}
                    className="w-full text-xs bg-stone-950 border border-stone-800 rounded-lg p-2 text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingTaskId(null)}
                      className="text-xs text-stone-400 hover:text-white px-2 py-1"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleRetrySubmit(task.id)}
                      className="bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs px-3 py-1 rounded-lg font-bold"
                    >
                      重新提交
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Preview for High-Res Rendered Image */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 text-white rounded-2xl max-w-2xl w-full p-5 space-y-4 border border-stone-800">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-amber-400">
                  第 {selectedImage.screenIndex} 屏: {selectedImage.screenTitle}
                </h3>
                <p className="text-xs text-stone-400">{selectedImage.coreSellingPoint}</p>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-stone-400 hover:text-white text-xs bg-stone-800 px-2.5 py-1 rounded-md"
              >
                关闭
              </button>
            </div>

            <div className="bg-black rounded-xl overflow-hidden max-h-[500px] flex items-center justify-center">
              {selectedImage.resultImageUrl && (
                <img
                  src={selectedImage.resultImageUrl}
                  alt={selectedImage.screenTitle}
                  className="max-h-[480px] w-auto object-contain"
                />
              )}
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 text-xs text-stone-300 space-y-1">
              <span className="font-bold text-stone-400 block">生成 Prompt:</span>
              <p className="font-mono text-stone-300 break-words">{selectedImage.prompt}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
