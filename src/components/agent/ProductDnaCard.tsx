import React, { useState } from 'react';
import { ProductVisualDNA } from '../../types';
import { ShieldCheck, Check, Edit3, Tag, Sparkles, Layers, Lock, AlertCircle, RefreshCw } from 'lucide-react';

interface ProductDnaCardProps {
  dna: ProductVisualDNA;
  onUpdate: (updatedDna: Partial<ProductVisualDNA>) => Promise<void>;
  onConfirm: () => Promise<void>;
  onReExtract?: () => Promise<void>;
  isLoading?: boolean;
}

export const ProductDnaCard: React.FC<ProductDnaCardProps> = ({
  dna,
  onUpdate,
  onConfirm,
  onReExtract,
  isLoading = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProductVisualDNA>(dna);
  const [newMaterial, setNewMaterial] = useState('');
  const [newStyleTag, setNewStyleTag] = useState('');
  const [saving, setSaving] = useState(false);

  const isConfirmed = !!dna.confirmed_at;

  const handleSave = async () => {
    try {
      setSaving(true);
      await onUpdate(formData);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMaterial = () => {
    if (newMaterial.trim()) {
      setFormData(prev => ({
        ...prev,
        materials: [...prev.materials, newMaterial.trim()]
      }));
      setNewMaterial('');
    }
  };

  const handleRemoveMaterial = (index: number) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index)
    }));
  };

  const handleAddStyle = () => {
    if (newStyleTag.trim()) {
      setFormData(prev => ({
        ...prev,
        style: [...prev.style, newStyleTag.trim()]
      }));
      setNewStyleTag('');
    }
  };

  const handleRemoveStyle = (index: number) => {
    setFormData(prev => ({
      ...prev,
      style: prev.style.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden text-stone-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold text-base tracking-wide">家具产品视觉 DNA</h3>
          {isConfirmed ? (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> 已确认锁定
            </span>
          ) : (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5" /> 待人工确认
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onReExtract && !isConfirmed && (
            <button
              onClick={onReExtract}
              disabled={isLoading}
              className="text-stone-300 hover:text-white bg-stone-700/50 hover:bg-stone-700 text-xs px-2.5 py-1 rounded-md transition flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> 重新提取
            </button>
          )}

          {!isConfirmed && (
            isEditing ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-3 py-1 rounded-md transition"
              >
                {saving ? '保存中...' : '保存更改'}
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="bg-stone-700 hover:bg-stone-600 text-stone-100 text-xs px-2.5 py-1 rounded-md transition flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" /> 人工修正
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 space-y-5 text-sm">
        {/* Row 1: 品类与颜色 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100">
            <span className="text-stone-400 text-xs font-semibold block mb-1">家具品类 / 细分</span>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full text-xs px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-800"
                  placeholder="品类，如：沙发"
                />
                <input
                  type="text"
                  value={formData.subcategory || ''}
                  onChange={e => setFormData({ ...formData, subcategory: e.target.value })}
                  className="w-full text-xs px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-800"
                  placeholder="细分，如：电动功能沙发"
                />
              </div>
            ) : (
              <div className="font-bold text-stone-800">
                {dna.category} <span className="text-stone-400 text-xs font-normal">({dna.subcategory || '全案'})</span>
              </div>
            )}
          </div>

          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100">
            <span className="text-stone-400 text-xs font-semibold block mb-1">主颜色 / 辅色</span>
            {isEditing ? (
              <input
                type="text"
                value={formData.primaryColor}
                onChange={e => setFormData({ ...formData, primaryColor: e.target.value })}
                className="w-full text-xs px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-800"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800">{dna.primaryColor}</span>
                {dna.secondaryColors?.map((c, i) => (
                  <span key={i} className="text-xs bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100">
            <span className="text-stone-400 text-xs font-semibold block mb-1">核心面料与材质</span>
            <div className="flex flex-wrap gap-1">
              {isEditing ? (
                <div className="w-full space-y-1">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {formData.materials.map((m, i) => (
                      <span key={i} className="bg-stone-200 text-stone-700 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                        {m}
                        <button onClick={() => handleRemoveMaterial(i)} className="text-stone-500 hover:text-red-500 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newMaterial}
                      onChange={e => setNewMaterial(e.target.value)}
                      placeholder="添加材质"
                      className="text-xs px-2 py-1 border border-stone-300 rounded flex-1"
                    />
                    <button onClick={handleAddMaterial} className="bg-stone-800 text-white text-xs px-2 py-1 rounded">加</button>
                  </div>
                </div>
              ) : (
                dna.materials.map((m, i) => (
                  <span key={i} className="bg-amber-50 text-amber-900 border border-amber-200/60 font-medium text-xs px-2 py-0.5 rounded">
                    {m}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Row 2: 风格与结构特征 */}
        <div>
          <span className="text-stone-400 text-xs font-semibold block mb-1.5 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-stone-500" /> 核心视觉与结构特征 (AI 自动化分析)
          </span>
          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100 space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className="text-xs font-bold text-stone-500 mr-1">风格标签:</span>
              {isEditing ? (
                <div className="flex flex-wrap gap-1 items-center">
                  {formData.style.map((s, i) => (
                    <span key={i} className="bg-stone-200 text-stone-700 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                      {s}
                      <button onClick={() => handleRemoveStyle(i)} className="text-stone-500 hover:text-red-500">×</button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={newStyleTag}
                    onChange={e => setNewStyleTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddStyle()}
                    placeholder="+ 标签"
                    className="text-xs px-2 py-0.5 border border-stone-300 rounded w-20"
                  />
                </div>
              ) : (
                dna.style.map((s, i) => (
                  <span key={i} className="bg-stone-200 text-stone-700 text-xs px-2 py-0.5 rounded font-medium">
                    #{s}
                  </span>
                ))
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {dna.structuralFeatures?.map((f, i) => (
                <div key={i} className="bg-white p-2 rounded border border-stone-200 flex justify-between items-start">
                  <div>
                    <span className="font-bold text-stone-800">{f.name}</span>
                    <p className="text-stone-500 text-[11px] mt-0.5">{f.description}</p>
                  </div>
                  <span className="bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded text-[10px] font-mono">
                    {Math.round(f.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: 锁定不容许篡改的规则 */}
        <div>
          <span className="text-stone-400 text-xs font-semibold block mb-1.5 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-amber-600" /> 不可篡改的品牌/产品锁定控制规则
          </span>
          <div className="space-y-1.5">
            {dna.lockedFeatures?.map((lf, i) => (
              <div key={i} className="bg-amber-50/50 border border-amber-200/60 p-2.5 rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    lf.priority === 'critical' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {lf.priority.toUpperCase()}
                  </span>
                  <span className="font-bold text-stone-800">{lf.name}:</span>
                  <span className="text-stone-600">{lf.rule}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Confirm Footer */}
        {!isConfirmed && (
          <div className="pt-2 border-t border-stone-200 flex justify-end">
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> 确认并锁定产品 DNA (解锁 9 屏策划)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
