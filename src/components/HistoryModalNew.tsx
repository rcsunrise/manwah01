import React, { useState } from 'react';
import { HistoryItem } from '../types';
import { X, Trash2, Download, Clock, Database, History, Copy } from './IconsNew';
import { dbService } from '../services/dbService';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyItems: HistoryItem[];
  onHistoryUpdated: () => void;
  onUsePrompt: (prompt: string) => void;
  onSelectImage: (item: HistoryItem) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  historyItems,
  onHistoryUpdated,
  onUsePrompt,
  onSelectImage
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === historyItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(historyItems.map(i => i.id));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 张图片吗？`)) return;
    
    await dbService.deleteHistoryItems(selectedIds);
    setSelectedIds([]);
    onHistoryUpdated();
  };

  const handleClearAll = async () => {
    if (historyItems.length === 0) return;
    if (!confirm('确定要清空所有历史记录吗？此操作不可恢复。')) return;
    
    await dbService.clearHistory();
    setSelectedIds([]);
    onHistoryUpdated();
  };

  const handleDownload = (item: HistoryItem) => {
    const link = document.createElement('a');
    link.href = item.imageUrl;
    const dateStr = new Date(item.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `MW_History_${dateStr}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-brand-charcoal w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-brand-gold/20">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-brand-gold/10 bg-brand-charcoal/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-gold/10 rounded-lg">
              <History className="w-5 h-5 text-brand-gold" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">历史生成记录</h2>
              <p className="text-xs text-stone-400 mt-1 flex items-center gap-2">
                <Database className="w-3 h-3" />
                共 {historyItems.length} 张图片 ({formatBytes(historyItems.reduce((acc, item) => acc + item.size, 0))})
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {historyItems.length > 0 && (
              <>
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 text-xs font-medium text-stone-300 hover:text-white transition-colors"
                >
                  {selectedIds.length === historyItems.length ? '取消全选' : '全选'}
                </button>
                
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除选中 ({selectedIds.length})
                  </button>
                )}
                
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-2 px-4 py-2 border border-red-500/20 text-red-400 hover:bg-red-500/10 rounded-lg text-xs font-medium transition-colors"
                >
                  清空全部
                </button>
              </>
            )}
            <div className="w-px h-6 bg-brand-gold/20 mx-2"></div>
            <button
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {historyItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-stone-500">
              <History className="w-16 h-16 mb-4 opacity-20" />
              <p>暂无历史记录</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {historyItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div 
                    key={item.id}
                    className={`group relative aspect-square rounded-xl overflow-hidden bg-black/40 border transition-all cursor-pointer ${
                      isSelected ? 'border-brand-gold ring-2 ring-brand-gold/30' : 'border-white/5 hover:border-brand-gold/50'
                    }`}
                    onClick={() => onSelectImage(item)}
                  >
                    <img 
                      src={item.imageUrl} 
                      alt="Generated" 
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    
                    {/* Checkbox */}
                    <div 
                      className="absolute top-2 left-2 z-10 p-2 -m-2 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(item.id);
                      }}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-brand-gold border-brand-gold text-brand-charcoal' : 'bg-black/50 border-white/30 text-transparent group-hover:border-white/60'
                      }`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    </div>

                    {/* Overlay Info */}
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col gap-2">
                      <p className="text-[10px] text-stone-300 line-clamp-2 leading-tight" title={item.prompt}>
                        {item.prompt}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1.5 text-[9px] text-brand-gold font-mono bg-brand-gold/10 px-1.5 py-0.5 rounded">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTime(item.timestamp)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={(e) => { e.stopPropagation(); onUsePrompt(item.prompt); }}
                            className="p-1.5 bg-white/10 hover:bg-brand-gold text-white hover:text-brand-charcoal rounded transition-colors"
                            title="使用此提示词"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                            className="p-1.5 bg-white/10 hover:bg-brand-gold text-white hover:text-brand-charcoal rounded transition-colors"
                            title="下载图片"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
