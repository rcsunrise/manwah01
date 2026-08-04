import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { StickyNote, Edit2, Trash2, Copy, Check, Palette } from 'lucide-react';

export interface NoteNodeData {
  title?: string;
  text?: string;
  color?: 'amber' | 'blue' | 'green' | 'rose' | 'stone';
  onChange?: (updated: { title?: string; text?: string; color?: 'amber' | 'blue' | 'green' | 'rose' | 'stone' }) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

const colorStyles = {
  amber: {
    bg: 'bg-[#FFFDF5]',
    border: 'border-[#F6E0B5]',
    headerBg: 'bg-[#FDF6E2]',
    titleText: 'text-[#8C6F43]',
    badgeBg: 'bg-[#B28C5A]/15 text-[#8C6F43]',
    accent: '#B28C5A'
  },
  blue: {
    bg: 'bg-[#F4F8FF]',
    border: 'border-[#BFDBFE]',
    headerBg: 'bg-[#EBF3FF]',
    titleText: 'text-[#1E40AF]',
    badgeBg: 'bg-[#3B82F6]/15 text-[#1E40AF]',
    accent: '#3B82F6'
  },
  green: {
    bg: 'bg-[#F4FBF7]',
    border: 'border-[#BBF7D0]',
    headerBg: 'bg-[#E6F8ED]',
    titleText: 'text-[#166534]',
    badgeBg: 'bg-[#10B981]/15 text-[#166534]',
    accent: '#10B981'
  },
  rose: {
    bg: 'bg-[#FFF5F6]',
    border: 'border-[#FECDD3]',
    headerBg: 'bg-[#FFE4E6]',
    titleText: 'text-[#9F1239]',
    badgeBg: 'bg-[#F43F5E]/15 text-[#9F1239]',
    accent: '#F43F5E'
  },
  stone: {
    bg: 'bg-[#FAF8F5]',
    border: 'border-[#E5E0D8]',
    headerBg: 'bg-[#F0EBE1]',
    titleText: 'text-[#44403C]',
    badgeBg: 'bg-[#78716C]/15 text-[#44403C]',
    accent: '#78716C'
  }
};

export const NoteNode: React.FC<NodeProps> = (props) => {
  const data = props.data as NoteNodeData;
  const selected = props.selected;

  const colorKey = data.color && colorStyles[data.color] ? data.color : 'amber';
  const style = colorStyles[colorKey];

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(data.title || '自定义便签 / 策划标注');
  const [text, setText] = useState(data.text || '双击或点击编辑按钮输入想法、材质要求或方案调整说明...');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleSave = () => {
    setIsEditing(false);
    data.onChange?.({ title, text, color: colorKey });
  };

  const handleColorChange = (newColor: 'amber' | 'blue' | 'green' | 'rose' | 'stone') => {
    data.onChange?.({ title, text, color: newColor });
    setShowColorPicker(false);
  };

  return (
    <div
      className={`relative min-w-[280px] max-w-[340px] rounded-2xl p-4 shadow-lg border transition-all duration-200 ${
        style.bg
      } ${style.border} ${
        selected
          ? 'ring-2 ring-[#B28C5A] shadow-xl'
          : 'hover:shadow-md'
      }`}
    >
      <Handle type="target" position={Position.Top} id="top" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
      <Handle type="target" position={Position.Left} id="left" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />

      {/* Header */}
      <div className={`flex items-center justify-between pb-2 mb-2 border-b border-black/5 ${style.headerBg} p-2 -mx-2 -mt-2 rounded-t-xl`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StickyNote className="w-4 h-4 text-[#B28C5A] shrink-0" />
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs font-bold bg-white/80 border border-[#B28C5A]/40 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#B28C5A]"
              placeholder="便签标题..."
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={() => setIsEditing(true)}
              className={`font-bold text-xs truncate cursor-pointer ${style.titleText}`}
              title="双击进行编辑"
            >
              {title}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-1 rounded hover:bg-black/10 text-stone-600 transition-colors"
            title="更换颜色"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>

          {isEditing ? (
            <button
              onClick={handleSave}
              className="p-1 rounded bg-[#B28C5A] text-white hover:bg-[#8C6F43] transition-colors"
              title="保存编辑"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 rounded hover:bg-black/10 text-stone-600 transition-colors"
              title="编辑内容"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {data.onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDuplicate?.();
              }}
              className="p-1 rounded hover:bg-black/10 text-stone-600 transition-colors"
              title="复制便签"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {data.onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.();
              }}
              className="p-1 rounded hover:bg-rose-500/20 text-rose-600 transition-colors"
              title="删除便签"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Color Picker Dropdown */}
      {showColorPicker && (
        <div className="absolute top-10 right-3 z-30 flex items-center gap-1.5 p-1.5 bg-white rounded-xl shadow-xl border border-stone-200 animate-in fade-in zoom-in-95">
          {(['amber', 'blue', 'green', 'rose', 'stone'] as const).map((c) => (
            <button
              key={c}
              onClick={() => handleColorChange(c)}
              className={`w-5 h-5 rounded-full border border-black/10 transition-transform ${
                c === 'amber' ? 'bg-[#FDE68A]' :
                c === 'blue' ? 'bg-[#BFDBFE]' :
                c === 'green' ? 'bg-[#BBF7D0]' :
                c === 'rose' ? 'bg-[#FECDD3]' : 'bg-[#E7E5E4]'
              } ${colorKey === c ? 'scale-125 ring-2 ring-[#B28C5A]' : 'hover:scale-110'}`}
              title={c}
            />
          ))}
        </div>
      )}

      {/* Body */}
      <div className="mt-2 text-xs">
        {isEditing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full text-xs bg-white/90 border border-[#B28C5A]/40 rounded-lg p-2 outline-none focus:ring-1 focus:ring-[#B28C5A] resize-none font-sans"
            placeholder="写下你的想法或备注..."
          />
        ) : (
          <p
            onDoubleClick={() => setIsEditing(true)}
            className="text-stone-700 leading-relaxed font-sans whitespace-pre-wrap cursor-pointer hover:text-stone-900"
            title="双击进行编辑"
          >
            {text}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[10px] text-stone-400">
        <span className={`px-2 py-0.5 rounded-full font-medium ${style.badgeBg}`}>
          标注便签
        </span>
        <span className="font-mono text-stone-400">双击快速编辑</span>
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="right" className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white" />
    </div>
  );
};
