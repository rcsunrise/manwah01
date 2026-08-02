import React, { useState, useEffect } from 'react';
import { History, X, Clock, Tag, ArrowRight, ShieldCheck, FileSpreadsheet, Loader2 } from 'lucide-react';
import { CanvasRevisionRecord } from '../../types/creativeCanvas';
import { canvasService } from '../../services/canvasService';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasId: string;
  onRestoreRevision: (revisionId: string) => Promise<void>;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  canvasId,
  onRestoreRevision
}) => {
  const [revisions, setRevisions] = useState<CanvasRevisionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && canvasId) {
      setLoading(true);
      setErrorMessage(null);
      setConfirmingId(null);
      canvasService
        .getCanvasRevisions(canvasId)
        .then(res => {
          setRevisions(res);
        })
        .catch(err => {
          console.error('Failed to fetch revisions:', err);
          setErrorMessage('获取历史版本失败，请稍后重试');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, canvasId]);

  if (!isOpen) return null;

  const executeRestore = async (revisionId: string) => {
    setRestoringId(revisionId);
    setErrorMessage(null);
    try {
      await onRestoreRevision(revisionId);
      setConfirmingId(null);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || '恢复版本失败，请重试');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl border border-[#E5E0D8] space-y-5 relative max-h-[85vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1 rounded-full hover:bg-stone-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#2C2622]">画布版本存档历史</h3>
            <p className="text-xs text-stone-500">查看历史正式快照，历史版本均为只读不可篡改状态</p>
          </div>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800 font-bold ml-2">关闭</button>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[250px]">
          {loading ? (
            <div className="h-48 flex items-center justify-center text-stone-400 gap-2 text-xs">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>加载版本存档列表中...</span>
            </div>
          ) : revisions.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-stone-400 space-y-2 border-2 border-dashed border-[#E5E0D8] rounded-2xl p-6">
              <FileSpreadsheet className="w-8 h-8 text-stone-300" />
              <p className="text-xs font-medium">暂无正式版本存档</p>
              <p className="text-[11px] text-stone-400">点击顶部“保存当前版本”可将当前画布锁定为正式存档。</p>
            </div>
          ) : (
            revisions.map(rev => {
              const revId = rev.id || rev.revisionId || '';
              const revNum = rev.revision_number || rev.revisionNumber || 1;
              const vName = rev.version_name || rev.versionName || `v${revNum}.0`;
              const summary = rev.change_summary || rev.changeSummary || '无修改说明';
              const tag = rev.version_tag || rev.versionTag || '正式版';
              const createdAt = rev.created_at || rev.createdAt || '';
              const rawNodes = rev.nodes_snapshot || rev.nodesSnapshot;
              const parsedNodes = Array.isArray(rawNodes)
                ? rawNodes
                : typeof rawNodes === 'string'
                ? (() => { try { return JSON.parse(rawNodes); } catch (e) { return []; } })()
                : [];
              const nodeCount = parsedNodes.length;
              const isConfirming = confirmingId === revId;

              return (
                <div
                  key={revId}
                  className="p-4 rounded-2xl border border-[#E5E0D8] bg-[#FAF8F5] hover:bg-white hover:border-[#B28C5A]/50 transition-all shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-[#B28C5A] text-white px-2 py-0.5 rounded-md">
                          Rev #{revNum}
                        </span>
                        <h4 className="text-xs font-bold text-[#2C2622]">{vName}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed pl-0.5">{summary}</p>
                    </div>

                    {!isConfirming ? (
                      <button
                        onClick={() => setConfirmingId(revId)}
                        disabled={!!restoringId}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-[#B28C5A] hover:bg-[#8C6F43] transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
                      >
                        <span>基于此版本继续创作</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0 bg-amber-50 p-1.5 rounded-xl border border-amber-200 animate-fadeIn">
                        <span className="text-[11px] font-medium text-amber-900 px-1">确认载入?</span>
                        <button
                          onClick={() => executeRestore(revId)}
                          disabled={restoringId === revId}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center gap-1"
                        >
                          {restoringId === revId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            '确认'
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="px-2 py-1 rounded-lg text-xs font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-100"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-stone-400 pt-2 border-t border-[#E5E0D8]/60">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-stone-400" />
                      存档时间：{createdAt ? new Date(createdAt).toLocaleString() : '未知'}
                    </span>
                    <span className="flex items-center gap-1 text-stone-500 font-mono">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      包含 {nodeCount} 个节点快照 (只读锁)
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-[#E5E0D8] flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span>提示：从历史版本恢复不会删除原版本，会自动将快照载入为新的可编辑草稿。</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
