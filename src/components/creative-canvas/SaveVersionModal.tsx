import React, { useState } from 'react';
import { BookmarkPlus, X, ShieldCheck, Tag } from 'lucide-react';

interface SaveVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (versionName: string, changeSummary: string, versionTag: string) => Promise<any>;
  currentRevisionNumber: number;
}

export const SaveVersionModal: React.FC<SaveVersionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentRevisionNumber
}) => {
  const [versionName, setVersionName] = useState(`v${currentRevisionNumber + 1}.0 正式视觉全案`);
  const [changeSummary, setChangeSummary] = useState('完成九屏高清画面生成与排版确认');
  const [versionTag, setVersionTag] = useState('正式版');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionName.trim()) {
      setError('请输入版本名称');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onSave(versionName, changeSummary, versionTag);
      onClose();
    } catch (err: any) {
      setError(err?.message || '存档失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E5E0D8] space-y-5 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1 rounded-full hover:bg-stone-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center shrink-0">
            <BookmarkPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#2C2622]">保存当前版本为正式存档</h3>
            <p className="text-xs text-stone-500">创建一个不可变的版本快照，防止误修改</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">版本名称 *</label>
            <input
              type="text"
              value={versionName}
              onChange={e => setVersionName(e.target.value)}
              placeholder="如：v1.0 终稿企划"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E0D8] text-xs font-medium text-stone-800 focus:outline-none focus:border-[#B28C5A] focus:ring-1 focus:ring-[#B28C5A]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">版本说明</label>
            <textarea
              rows={3}
              value={changeSummary}
              onChange={e => setChangeSummary(e.target.value)}
              placeholder="简要记录本版本的改动说明..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E0D8] text-xs font-medium text-stone-800 focus:outline-none focus:border-[#B28C5A] focus:ring-1 focus:ring-[#B28C5A] resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">版本标签</label>
            <div className="flex gap-2">
              {['正式版', '企划草稿', '审校版', '高保真'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setVersionTag(tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
                    versionTag === tag
                      ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                      : 'bg-stone-50 text-stone-600 border-[#E5E0D8] hover:bg-stone-100'
                  }`}
                >
                  <Tag className="w-3 h-3" />
                  <span>{tag}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</div>}

          <div className="flex items-center gap-2 text-[11px] text-stone-500 bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8]/80">
            <ShieldCheck className="w-4 h-4 text-[#B28C5A] shrink-0" />
            <span>版本快照一旦保存即锁定只读，后续画布改动不会覆盖历史记录。</span>
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E5E0D8]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>{isSubmitting ? '保存中...' : '确认存档'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
