import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BookOpen, Save, X, Edit3, Eye, Settings, RefreshCw, Key, Link as LinkIcon, Database } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

const AdminNotepad = ({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) => {
  const [activeTab, setActiveTab] = useState<'log' | 'api'>('log');
  
  const [content, setContent] = useState('');
  const [savingLog, setSavingLog] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const [savingApi, setSavingApi] = useState(false);
  const [apiConfig, setApiConfig] = useState({
    activeProvider: 'routerhub',
    hybridMode: false,
    routerhub: { baseUrl: 'https://api.routerhub.ai', apiKey: '' },
    vectorengine: { baseUrl: 'https://api.vectorengine.ai', apiKey: '' }
  });

  const [departments, setDepartments] = useState<{id: string, dept_name: string, api_base_url?: string, api_key?: string, routing_mode?: number, method1_key?: string}[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');

  const [testingStatus, setTestingStatus] = useState<Record<string, {loading: boolean, message: string, success: boolean}>>({});

  const handleTestConnection = async (provider: 'vectorengine' | 'routerhub') => {
    const pConfig = apiConfig[provider];
    
    setTestingStatus(prev => ({ ...prev, [provider]: { loading: true, message: '测试中...', success: false } }));
    try {
      const res = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: pConfig.baseUrl, apiKey: pConfig.apiKey, provider })
      });
      const data = await res.json();
      setTestingStatus(prev => ({ ...prev, [provider]: { loading: false, message: data.message, success: data.success } }));
    } catch(e: any) {
      setTestingStatus(prev => ({ ...prev, [provider]: { loading: false, message: e.message, success: false } }));
    }
  };

  useEffect(() => {
    if (selectedDeptId && departments.length > 0) {
      const dept = departments.find(d => d.id === selectedDeptId);
      if (dept) {
         let effectiveBaseUrl = dept.api_base_url || '';
         let effectiveKey = dept.api_key || '';
         let routingMode = dept.routing_mode || 1;
         let rHubKey = dept.method1_key || '';
         
         const isVector = effectiveBaseUrl.includes('vectorengine');
         const isHybrid = routingMode === 2;
         const newProvider = isHybrid ? 'vectorengine' : (isVector ? 'vectorengine' : 'routerhub');
         
         setApiConfig(prev => ({
            ...prev,
            activeProvider: newProvider,
            hybridMode: isHybrid,
            vectorengine: { 
               baseUrl: isHybrid || isVector ? effectiveBaseUrl : prev.vectorengine.baseUrl,
               apiKey: isHybrid || isVector ? effectiveKey : prev.vectorengine.apiKey
            },
            routerhub: {
               baseUrl: !isHybrid && !isVector && effectiveBaseUrl ? effectiveBaseUrl : prev.routerhub.baseUrl,
               apiKey: isHybrid ? rHubKey : (!isVector ? effectiveKey : prev.routerhub.apiKey)
            }
         }));
      }
    }
  }, [selectedDeptId, departments]);

  useEffect(() => {
    const fetchNoteAndDepts = async () => {
      try {
        const { data: deptsData } = await supabase.from('department_configs').select('id, dept_name, api_base_url, api_key, routing_mode, method1_key');
        if (deptsData && deptsData.length > 0) {
          setDepartments(deptsData);
          // Auto select "研发中心" if it exists as requested by user's prompt as the default API group for recording
          const rAndD = deptsData.find(d => d.dept_name.includes('研发中心') || d.dept_name.includes('研发'));
          if (rAndD) {
             setSelectedDeptId(rAndD.id);
          } else {
             setSelectedDeptId(deptsData[0].id);
          }
        }

        const savedConfig = localStorage.getItem('__apiConfig_draft');
        if (savedConfig) {
           try {
              setApiConfig(JSON.parse(savedConfig));
           } catch(e) {}
        }

        const { data, error } = await supabase
          .from('admin_notes')
          .select('id, content')
          .eq('id', 1);
        
        if (data) {
          const logData = data.find((d: any) => d.id === 1);
          if (logData) {
            setContent(logData.content);
          }
        }
      } catch (err) {
        console.error('Failed to fetch admin data:', err);
      }
    };

    if (isOpen) {
      fetchNoteAndDepts();
    }
  }, [isOpen]);

  const handleSaveLog = async () => {
    setSavingLog(true);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const { data: profile } = user ? await supabase.from('profiles').select('username').eq('id', user.id).single() : { data: null };

      const { error } = await supabase
        .from('admin_notes')
        .upsert({ 
          id: 1, 
          content: content, 
          updated_at: new Date().toISOString(),
          updated_by_name: profile?.username || user?.email || 'Admin'
        });
      
      if (error) throw error;
      alert("日志已同步保存");
    } catch (err: any) {
      alert("保存日志失败: " + err.message);
    } finally {
      setSavingLog(false);
    }
  };

  const handleSaveApiSchema = async () => {
    setSavingApi(true);
    try {
      localStorage.setItem('__apiConfig_draft', JSON.stringify(apiConfig));
      
      let updatePayload: any = {};
      if (apiConfig.hybridMode) {
          updatePayload = {
              api_base_url: apiConfig.vectorengine.baseUrl || 'https://api.vectorengine.ai',
              api_key: apiConfig.vectorengine.apiKey,
              routing_mode: 2,
              method1_key: apiConfig.routerhub.apiKey
          };
      } else {
          const providerConfig = apiConfig.activeProvider === 'vectorengine' ? apiConfig.vectorengine : apiConfig.routerhub;
          updatePayload = {
              api_base_url: providerConfig.baseUrl,
              api_key: providerConfig.apiKey,
              routing_mode: 1,
              method1_key: null
          };
      }

      if (selectedDeptId) {
        const { error: deptError } = await supabase
           .from('department_configs')
           .update(updatePayload)
           .eq('id', selectedDeptId);

        if (deptError) throw deptError;
        const targetDept = departments.find(d => d.id === selectedDeptId);
        
        // Also update local ui state for reactivity
        setDepartments(prev => prev.map(d => 
          d.id === selectedDeptId ? { ...d, ...updatePayload } : d
        ));
        
        alert(`API 路由配置已同步，且已成功保存至【${targetDept?.dept_name}】分组。`);
      }
      
    } catch (err: any) {
      alert("配置保存失败: " + err.message);
    } finally {
      setSavingApi(false);
    }
  };

  return (
    <>
      {/* 隐蔽的触发器：位于屏幕极右侧中部的一条细线 */}
      {!isOpen && (
        <div 
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 w-1 hover:w-3 h-32 bg-stone-300/30 hover:bg-stone-400/50 cursor-pointer rounded-l-full transition-all z-40 border-l border-white/20"
          title="打开控制面板"
        />
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[45]"
            />

            {/* Panel */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.1)] z-50 flex flex-col border-l border-stone-100"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                <div className="flex gap-2">
                   <button 
                     onClick={() => setActiveTab('log')}
                     className={`px-4 py-2 text-sm font-black tracking-tight rounded-xl flex items-center gap-2 transition-all ${activeTab === 'log' ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-200'}`}
                   >
                     <BookOpen size={16} /> 运维日志
                   </button>
                   <button 
                     onClick={() => setActiveTab('api')}
                     className={`px-4 py-2 text-sm font-black tracking-tight rounded-xl flex items-center gap-2 transition-all ${activeTab === 'api' ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-200'}`}
                   >
                     <Database size={16} /> 路由设置
                   </button>
                </div>
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="p-2 hover:bg-stone-200 rounded-xl transition-colors text-stone-400 hover:text-stone-900"
                >
                  <X size={20} />
                </button>
              </div>

              {activeTab === 'log' ? (
                // LOG TAB CONTENT
                <>
                  <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
                    <div className="flex items-center justify-between bg-stone-100 p-1 rounded-xl">
                      <button 
                        onClick={() => setMode('edit')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'edit' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                      >
                        <Edit3 size={14} /> 编辑模式
                      </button>
                      <button 
                        onClick={() => setMode('preview')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'preview' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                      >
                        <Eye size={14} /> 预览文档
                      </button>
                    </div>

                    <div className="flex-1 bg-stone-50 rounded-2xl border border-stone-100 overflow-hidden relative group">
                      {mode === 'edit' ? (
                        <textarea 
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          className="w-full h-full p-6 bg-transparent outline-none font-mono text-sm resize-none text-stone-700 leading-relaxed placeholder:text-stone-300"
                          placeholder="# 系统维护记录\n\n- 2024-05-08: 完成充值逻辑对接\n- 备忘: 下次更新主视觉颜色..."
                        />
                      ) : (
                        <div className="w-full h-full p-6 overflow-y-auto prose prose-stone prose-sm max-w-none prose-headings:font-black prose-headings:tracking-tight">
                          <Markdown>{content || '*暂无内容，请在编辑模式输入...*'}</Markdown>
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] text-stone-400 text-center px-4 leading-relaxed font-medium">
                      此记事本支持 Markdown 语法。内容对所有管理员实时可见，建议在进行重大更新或财务录入后留下备注。
                    </p>
                  </div>

                  <div className="p-6 bg-stone-50 border-t border-stone-100">
                    <button 
                      onClick={handleSaveLog}
                      disabled={savingLog}
                      className="w-full bg-stone-900 text-white py-4 rounded-2xl hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all font-black text-sm uppercase tracking-widest shadow-lg shadow-stone-200 active:scale-[0.98]"
                    >
                      <Save size={18} /> {savingLog ? '同步中...' : '保存并同步日志'}
                    </button>
                  </div>
                </>
              ) : (
                 // API TAB CONTENT
                 <>
                   <div className="flex-1 overflow-y-auto p-6 space-y-6">
                     {/* 部门配置概览 */}
                     <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                        <label className="block text-xs font-black text-stone-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                           <Database size={14} className="text-stone-500" />
                           各部门当前生效配置
                        </label>
                        <div className="space-y-2 max-h-48 overflow-y-auto subtle-scrollbar">
                           {departments.map(dept => {
                              let isVector = false;
                              let effectiveBaseUrl = dept.api_base_url;
                              let usingGlobal = false;
                              
                              if (!effectiveBaseUrl || !dept.api_key) {
                                 effectiveBaseUrl = apiConfig.activeProvider === 'vectorengine' ? apiConfig.vectorengine.baseUrl : apiConfig.routerhub.baseUrl;
                                 isVector = apiConfig.activeProvider === 'vectorengine';
                                 usingGlobal = true;
                              } else {
                                 isVector = effectiveBaseUrl.includes('vectorengine');
                              }

                              return (
                                 <div key={dept.id} className="flex flex-col gap-1 text-xs border border-stone-100 bg-white p-2.5 rounded-lg">
                                    <div className="flex justify-between font-bold items-center">
                                       <span className="text-stone-800 flex items-center gap-2">
                                          {dept.dept_name} {usingGlobal && <span className="font-normal text-[9px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">跟随默认</span>}
                                       </span>
                                       <span className={isVector ? 'text-purple-600' : 'text-emerald-600'}>{isVector ? 'VectorEngine' : 'RouterHub'}</span>
                                    </div>
                                    <div className="text-stone-500 font-mono text-[10px] truncate">{effectiveBaseUrl || '未配置'}</div>
                                    {!usingGlobal && dept.api_key && <div className="text-stone-400 font-mono text-[10px] truncate pt-1 border-t border-dashed border-stone-100 mt-1">{dept.api_key.substring(0,8)}...{dept.api_key.slice(-4)}</div>}
                                 </div>
                              );
                           })}
                        </div>
                     </div>

                       <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                          <label className="block text-xs font-black text-stone-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                             <RefreshCw size={14} className="text-emerald-600" />
                             你要配置的部门
                          </label>
                          <select 
                            className="w-full h-11 px-4 bg-white border border-stone-200 rounded-lg text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-stone-900 mb-4"
                            value={selectedDeptId}
                            onChange={(e) => setSelectedDeptId(e.target.value)}
                          >
                             {departments.map(dept => (
                               <option key={dept.id} value={dept.id}>{dept.dept_name} {dept.dept_name === '全站系统' ? '(全局兜底)' : ''}</option>
                             ))}
                          </select>

                          <label className="block text-xs font-black text-stone-900 uppercase tracking-widest mb-3 flex items-center gap-2 border-t border-stone-200 pt-4">
                             当前选择的线路模式
                          </label>
                          <select 
                            className="w-full h-11 px-4 bg-white border border-stone-200 rounded-lg text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-stone-900"
                            value={apiConfig.hybridMode ? 'hybrid' : apiConfig.activeProvider}
                            onChange={(e) => {
                               const val = e.target.value;
                               if (val === 'hybrid') {
                                  setApiConfig({...apiConfig, hybridMode: true, activeProvider: 'vectorengine'});
                               } else {
                                  setApiConfig({...apiConfig, hybridMode: false, activeProvider: val as any});
                               }
                            }}
                          >
                             <option value="routerhub">🟢 RouterHub API</option>
                             <option value="vectorengine">🟣 VectorEngine API (向量)</option>
                             <option value="hybrid">✨ 混合切换模式 (VectorEngine 优先 + RouterHub 兜底)</option>
                          </select>
                          <p className="text-xs text-stone-500 mt-3 leading-relaxed">
                            当部门线路变更时，你需要录入对应平台的 Key 并进行连通测试后保存。
                          </p>
                       </div>

                      {/* Vector Engine Config */}
                      <div className={`space-y-4 p-5 rounded-2xl border transition-all ${apiConfig.hybridMode || apiConfig.activeProvider === 'vectorengine' ? 'border-purple-300 bg-purple-50/30' : 'border-stone-100 bg-white opacity-60'}`}>
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
                                 <Database size={12} className="text-purple-600" />
                               </div>
                               <h4 className="font-bold text-stone-900">VectorEngine 配置 {apiConfig.hybridMode && <span className="text-[10px] bg-purple-200 text-purple-800 px-2 py-0.5 rounded ml-2">主线路</span>}</h4>
                            </div>
                            <button 
                               onClick={() => handleTestConnection('vectorengine')}
                               disabled={testingStatus['vectorengine']?.loading || !apiConfig.vectorengine.apiKey}
                               className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 transition-all disabled:opacity-50"
                            >
                               {testingStatus['vectorengine']?.loading ? '测试中...' : '连通测试'}
                            </button>
                         </div>

                         {testingStatus['vectorengine'] && !testingStatus['vectorengine'].loading && (
                            <div className={`text-[10px] p-2.5 rounded-lg border leading-snug ${testingStatus['vectorengine'].success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                               {testingStatus['vectorengine'].message}
                            </div>
                         )}
                         
                         <div>
                            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1 flex items-center gap-1.5"><LinkIcon size={10}/> 基础 URL</label>
                            <input 
                              type="text" 
                              value={apiConfig.vectorengine.baseUrl}
                              onChange={(e) => setApiConfig({...apiConfig, vectorengine: {...apiConfig.vectorengine, baseUrl: e.target.value}})}
                              className="w-full h-10 px-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-stone-700 outline-none focus:border-purple-400 focus:bg-white transition-all"
                              placeholder="https://api.vectorengine.ai"
                            />
                         </div>
                         <div>
                            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1 flex items-center gap-1.5"><Key size={10}/> API KEY</label>
                            <input 
                              type="text" 
                              value={apiConfig.vectorengine.apiKey}
                              onChange={(e) => setApiConfig({...apiConfig, vectorengine: {...apiConfig.vectorengine, apiKey: e.target.value}})}
                              className="w-full h-10 px-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-stone-700 outline-none focus:border-purple-400 focus:bg-white transition-all"
                              placeholder="请输入 VectorEngine 密钥..."
                            />
                         </div>
                      </div>

                      {/* RouterHub Config */}
                      <div className={`space-y-4 p-5 rounded-2xl border transition-all ${apiConfig.hybridMode || apiConfig.activeProvider === 'routerhub' ? 'border-emerald-300 bg-emerald-50/30' : 'border-stone-100 bg-white opacity-60'}`}>
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">
                                 <Settings size={12} className="text-emerald-600" />
                               </div>
                               <h4 className="font-bold text-stone-900">RouterHub 配置 {apiConfig.hybridMode && <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded ml-2">兜底线路</span>}</h4>
                            </div>
                            <button 
                               onClick={() => handleTestConnection('routerhub')}
                               disabled={testingStatus['routerhub']?.loading || !apiConfig.routerhub.apiKey}
                               className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-all disabled:opacity-50"
                            >
                               {testingStatus['routerhub']?.loading ? '测试中...' : '连通测试'}
                            </button>
                         </div>

                         {testingStatus['routerhub'] && !testingStatus['routerhub'].loading && (
                            <div className={`text-[10px] p-2.5 rounded-lg border leading-snug ${testingStatus['routerhub'].success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                               {testingStatus['routerhub'].message}
                            </div>
                         )}
                         
                         <div>
                            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1 flex items-center gap-1.5"><LinkIcon size={10}/> 基础 URL</label>
                            <input 
                              type="text" 
                              value={apiConfig.routerhub.baseUrl}
                              onChange={(e) => setApiConfig({...apiConfig, routerhub: {...apiConfig.routerhub, baseUrl: e.target.value}})}
                              className="w-full h-10 px-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-stone-700 outline-none focus:border-emerald-400 focus:bg-white transition-all"
                              placeholder="https://api.routerhub.ai/v1beta"
                            />
                         </div>
                         <div>
                            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1 flex items-center gap-1.5"><Key size={10}/> API KEY</label>
                            <input 
                              type="text" 
                              value={apiConfig.routerhub.apiKey}
                              onChange={(e) => setApiConfig({...apiConfig, routerhub: {...apiConfig.routerhub, apiKey: e.target.value}})}
                              className="w-full h-10 px-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-stone-700 outline-none focus:border-emerald-400 focus:bg-white transition-all"
                              placeholder="请输入 RouterHub 密钥..."
                            />
                         </div>
                      </div>
                   </div>
                  
                  <div className="p-6 bg-stone-50 border-t border-stone-100 flex flex-col items-center">
                    <button 
                      onClick={handleSaveApiSchema}
                      disabled={savingApi || !selectedDeptId}
                      className="w-full bg-stone-900 text-white py-4 rounded-2xl hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all font-black text-sm uppercase tracking-widest shadow-lg shadow-stone-200 active:scale-[0.98]"
                    >
                      <Save size={18} /> {savingApi ? '保存中...' : (selectedDeptId ? `保存到【${departments.find(d => d.id === selectedDeptId)?.dept_name}】` : '保存配置')}
                    </button>
                     <p className="text-[10px] text-stone-400 text-center px-4 leading-relaxed font-medium mt-4">
                      保存后对设定部门立刻生效。如果修改的是全站系统，将成为默认兜底策略。
                    </p>
                  </div>
                </>
              )}

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default AdminNotepad;
