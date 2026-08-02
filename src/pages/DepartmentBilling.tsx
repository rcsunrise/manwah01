import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, RefreshCw, FileSpreadsheet, Search, Filter, Wallet, TrendingDown, DollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';

let isViewAvailable: boolean | null = null;

function formatUsageLogs(logRecords: any[]) {
  return (logRecords || []).map(r => {
    const userProfile = r.profiles as any;
    const dName = userProfile?.department_configs?.dept_name || '未绑定部门';
    return {
      log_id: r.id,
      "使用部门": dName,
      "对方工号": userProfile?.employee_id || 'Unknown',
      "员工姓名": userProfile?.username || 'Unknown',
      "调用模型": r.model,
      "渲染规格/类型": r.model_res || '-',
      "消耗点数(Points)": r.tokens_used,
      "消耗额度(W)": Number((Number(r.tokens_used || 0) / 10000).toFixed(2)),
      "消耗美金($)": r.cost_usd,
      "操作类型": r.type || 'AI_CALL',
      "使用时间": new Date(r.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    };
  });
}

export default function DepartmentBilling() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ recharged: 0, consumed: 0, current: 0 });
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      
      const { data: profile } = await supabase.from('profiles').select('role, dept_id').eq('id', user.id).single();
      setCurrentUserProfile(profile);
      
      let deptName = '';
      if (profile?.dept_id) {
          const { data: deptData } = await supabase.from('department_configs').select('dept_name').eq('id', profile.dept_id).single();
          deptName = deptData?.dept_name || '';
      }

      if (profile?.role === 'admin') {
         setIsAdmin(true);
         const { data: depts } = await supabase.from('department_configs').select('dept_name');
         if (depts) setDepartments(depts.map(d => d.dept_name));
      } else if (profile?.role === 'dept_admin') {
         setIsAdmin(false);
         if (deptName) {
             setDepartments([deptName]);
             setSelectedDept(deptName);
         }
      }

      const targetDept = profile?.role === 'dept_admin' ? deptName : selectedDept;

      // --- Fetch Summary Data ---
      let profsQuery = supabase.from('profiles').select('quota_used, dept_id');
      let depsQuery = supabase.from('financial_records').select('amount, dept_id');

      if (targetDept !== 'all') {
          const { data: deptInfo } = await supabase.from('department_configs').select('id').eq('dept_name', targetDept).single();
          if (deptInfo) {
              profsQuery = profsQuery.eq('dept_id', deptInfo.id);
              depsQuery = depsQuery.eq('dept_id', deptInfo.id);
          }
      }

      const [profsResp, depsResp] = await Promise.all([profsQuery, depsQuery]);
      
      let sumConsumed = 0;
      let sumRecharged = 0;

      if (profsResp.data) {
          sumConsumed = profsResp.data.reduce((acc, curr) => acc + (Number(curr.quota_used || 0) / 10000), 0);
      }
      
      if (depsResp.data) {
          sumRecharged = depsResp.data.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      }

      setSummary({
          recharged: sumRecharged,
          consumed: sumConsumed,
          current: sumRecharged - sumConsumed
      });

      // --- Fetch View Records with smart dynamic flag check ---
      let viewRecords = null;
      let viewError: any = null;

      if (isViewAvailable !== false) {
        let query = supabase.from('view_department_billing_details').select('*').order('使用时间', { ascending: false }).limit(2000);
        
        // 部门隔离过滤
        if (targetDept && targetDept !== 'all') {
            query = query.eq('使用部门', targetDept);
        }
        
        const resp = await query;
        viewRecords = resp.data;
        viewError = resp.error;

        if (viewError) {
          const errMsg = viewError.message || '';
          if (viewError.code === 'PGRST205' || errMsg.includes('Could not find') || errMsg.includes('does not exist')) {
            isViewAvailable = false;
          }
        } else {
          isViewAvailable = true;
        }
      }

      if (isViewAvailable && viewRecords) {
          setData(viewRecords);
      } else {
          // Fallback: 如果用户尚未在 SQL Editor 中创建该视图，我们直接回退到手动 Join（不打印异常，不刷屏报错，极致平滑）
          let fallbackQ = supabase
              .from('usage_logs')
              .select('id, model, model_res, tokens_used, cost_usd, type, created_at, profiles(employee_id, username, department_configs(dept_name))')
              .order('created_at', { ascending: false })
              .limit(2000);
              
          let targetDeptUsersList: string[] | null = null;
          if (targetDept && targetDept !== 'all') {
              const { data: deptInfo } = await supabase.from('department_configs').select('id').eq('dept_name', targetDept).single();
              if (deptInfo) {
                  const { data: deptUsers } = await supabase.from('profiles').select('id').eq('dept_id', deptInfo.id);
                  targetDeptUsersList = deptUsers?.map(u => u.id) || [];
              }
          } else if (profile?.role === 'dept_admin') {
              const { data: deptUsers } = await supabase.from('profiles').select('id').eq('dept_id', profile.dept_id);
              targetDeptUsersList = deptUsers?.map(u => u.id) || [];
          }

          if (targetDeptUsersList) {
             fallbackQ = fallbackQ.in('user_id', targetDeptUsersList.length > 0 ? targetDeptUsersList : ['00000000-0000-0000-0000-000000000000']);
          }
          
          const { data: logRecords } = await fallbackQ;
          const formatted = formatUsageLogs(logRecords || []);
          setData(formatted);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedDept]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportFullData = async () => {
    setIsExporting(true);
    try {
      const targetDept = selectedDept;
      const profile = currentUserProfile;
      
      let allRecords: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      // 1. 如果视图存在，优先从视图开始级联拉取
      if (isViewAvailable !== false) {
        while (hasMore) {
          let query = supabase.from('view_department_billing_details').select('*')
            .order('使用时间', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
          if (targetDept && targetDept !== 'all') {
            query = query.eq('使用部门', targetDept);
          }
          
          const { data: viewRecords, error } = await query;
          if (error || !viewRecords || viewRecords.length === 0) {
             hasMore = false;
             if (error) {
                 const errMsg = error.message || '';
                 if (error.code === 'PGRST205' || errMsg.includes('Could not find') || errMsg.includes('does not exist')) {
                     isViewAvailable = false;
                 }
                 console.error("Fetch full data error:", error);
             }
          } else {
             allRecords.push(...viewRecords);
             if (viewRecords.length < pageSize) {
                 hasMore = false;
             } else {
                 page++;
             }
          }
        }
      }
      
      // 2. 如果视图被标记不存在，或者在拉取过程中得知视图不存在，立即跳转至高效的表格级联直接拉取
      if (isViewAvailable === false) {
        hasMore = true;
        page = 0;
        allRecords = []; // Reset and retry

        let deptUserIds: string[] | null = null;
        if (targetDept && targetDept !== 'all') {
          const { data: deptInfo } = await supabase.from('department_configs').select('id').eq('dept_name', targetDept).single();
          if (deptInfo) {
            const { data: deptUsers } = await supabase.from('profiles').select('id').eq('dept_id', deptInfo.id);
            deptUserIds = deptUsers?.map(u => u.id) || [];
          }
        } else if (profile?.role === 'dept_admin') {
          const { data: deptUsers } = await supabase.from('profiles').select('id').eq('dept_id', profile.dept_id);
          deptUserIds = deptUsers?.map(u => u.id) || [];
        }

        while (hasMore) {
          let fallbackQ = supabase
            .from('usage_logs')
            .select('id, model, model_res, tokens_used, cost_usd, type, created_at, profiles(employee_id, username, department_configs(dept_name))')
            .order('created_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
          if (deptUserIds) {
            fallbackQ = fallbackQ.in('user_id', deptUserIds.length > 0 ? deptUserIds : ['00000000-0000-0000-0000-000000000000']);
          }
          
          const { data: logRecords, error } = await fallbackQ;
          if (error || !logRecords || logRecords.length === 0) {
            hasMore = false;
          } else {
            const formatted = formatUsageLogs(logRecords);
            allRecords.push(...formatted);
            if (logRecords.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          }
        }
      }
      
      if (allRecords.length === 0) {
         // 完全没有拉到数据的最终兜底
         allRecords = data;
      }
      
      const totalPoints = allRecords.reduce((sum, item) => sum + (Number(item['消耗点数(Points)']) || 0), 0);
      const totalCostUsd = allRecords.reduce((sum, item) => sum + (Number(item['消耗美金($)']) || 0), 0);
      
      const exportData = allRecords.map(({ log_id, ...rest }) => rest);
      
      exportData.push({'使用时间': '', '使用部门': '', '对方工号': '', '员工姓名': '', '调用模型': '', '渲染规格/类型': '', '消耗点数(Points)': 0, '消耗额度(W)': 0, '消耗美金($)': 0, '操作类型': ''}); 
      
      exportData.push({
          '使用时间': '===============',
          '使用部门': '总计 (Total)',
          '对方工号': '===============',
          '员工姓名': targetDept === 'all' ? '所有部门' : targetDept,
          '调用模型': '',
          '渲染规格/类型': '',
          '消耗点数(Points)': totalPoints,
          '消耗额度(W)': Number((totalPoints / 10000).toFixed(2)),
          '消耗美金($)': Number(totalCostUsd.toFixed(4)),
          '操作类型': ''
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      const colWidths = [
         { wch: 15 }, // 部门
         { wch: 12 }, // 工号
         { wch: 12 }, // 姓名
         { wch: 20 }, // 模型
         { wch: 15 }, // 规格
         { wch: 15 }, // 点数
         { wch: 12 }, // 额度W
         { wch: 12 }, // 美金
         { wch: 10 }, // 操作类型
         { wch: 22 }  // 时间
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "全量部门账单明细");
      
      const timeStr = new Date().toISOString().split('T')[0];
      const fileName = `MANWAH_Full_Billing_${selectedDept === 'all' ? '全体' : selectedDept}_${timeStr}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);
    } catch (e) {
      console.error(e);
      alert('导出全量数据时发生错误');
    } finally {
      setIsExporting(false);
    }
  };

  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const isAnomalousRecord = (row: any) => {
    const isImage = row['操作类型'] === 'image_generation' || 
                   row['调用模型']?.toLowerCase().includes('image') ||
                   row['调用模型']?.toLowerCase().includes('preview');
                   
    if (!isImage) return false;
    
    const points = Number(row['消耗点数(Points)'] || 0);
    if (points <= 0) return false; // Already refunded or zero
    
    const modelStr = row['调用模型'] || '';
    
    // Anomaly conditions:
    // 1. Missing duration tag (i.e. model has no "耗时" indicator)
    const hasDuration = modelStr.includes('耗时');
    
    // 2. Contains error/fail keyword
    const hasError = modelStr.toLowerCase().includes('error') || 
                     modelStr.toLowerCase().includes('fail') || 
                     modelStr.toLowerCase().includes('failed');
                     
    // 3. Spurious/too fast (e.g., "耗时 0.0s")
    const isTooFast = modelStr.includes('耗时 0.0s') || modelStr.includes('耗时 0s');
    
    return !hasDuration || hasError || isTooFast;
  };

  const handleRefund = async (logId: string, tokens: number, username: string) => {
    if (!window.confirm(`确定要为 [${username}] 退还此笔生图消耗吗？\n退还点数: ${tokens} 点\n这一操作将永久修改此条日志为0点并同步退回用户的点数消耗中。`)) {
      return;
    }

    setRefundingId(logId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const token = session?.access_token;
      
      const response = await fetch('/api/admin/refund-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ logId, comment: "生图未成功核退" })
      });

      const resData = await response.json();
      if (!response.ok || resData.error) {
        throw new Error(resData.error || resData.message || 'Refund request failed');
      }

      alert(`操作成功！\n${resData.message}`);
      fetchRecords();
    } catch (err: any) {
      console.error("Refund failed:", err);
      alert(`退款失败: ${err.message}`);
    } finally {
      setRefundingId(null);
    }
  };

  const filteredData = data.filter(item => 
      item['员工姓名']?.toLowerCase().includes(search.toLowerCase()) || 
      item['对方工号']?.toLowerCase().includes(search.toLowerCase()) ||
      item['使用部门']?.toLowerCase().includes(search.toLowerCase()) ||
      item['调用模型']?.toLowerCase().includes(search.toLowerCase())
  );

  const anomalousLogs = filteredData.filter(isAnomalousRecord);
  const displayData = onlyAnomalies ? anomalousLogs : filteredData;

  return (
    <div className="bg-stone-50 min-h-screen p-4 md:p-8 font-sans w-full">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* 页头 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-stone-800 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              部门数据账单
            </h2>
            <p className="text-sm text-stone-500 mt-1">
              审查各部门 API 请求日志，支持一键导出结构化 Excel 数据报表。
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
             <button 
                 onClick={fetchRecords}
                 className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl transition-colors shadow-sm"
                 title="刷新数据"
             >
                 <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
             </button>
             <button 
                onClick={handleExportFullData}
                disabled={isExporting}
                className="flex-1 md:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
             >
                {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? '导出中...' : '导出全量 Excel'}
             </button>
          </div>
        </div>

        {/* 统计看板 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200 flex items-center gap-4">
             <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                 <Wallet className="w-6 h-6" />
             </div>
             <div>
                <div className="text-sm text-stone-500 font-medium tracking-wide">总充值 (Recharged)</div>
                <div className="text-2xl font-black text-stone-800">${summary.recharged.toFixed(2)}</div>
             </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200 flex items-center gap-4">
             <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                 <TrendingDown className="w-6 h-6" />
             </div>
             <div>
                <div className="text-sm text-stone-500 font-medium tracking-wide">已使用 (Consumed)</div>
                <div className="text-2xl font-black text-stone-800">${summary.consumed.toFixed(2)}</div>
             </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200 flex items-center gap-4">
             <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                 <DollarSign className="w-6 h-6" />
             </div>
             <div>
                <div className="text-sm text-stone-500 font-medium tracking-wide">剩余可用 (Balance)</div>
                <div className={`text-2xl font-black ${summary.current < 10 ? 'text-red-500' : 'text-emerald-600'}`}>${summary.current.toFixed(2)}</div>
             </div>
          </div>
        </div>

        {/* 智能异常流水审计看板 */}
        {isAdmin && anomalousLogs.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl mt-0.5 shrink-0 animate-pulse">
                   <Filter className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                   <h3 className="font-black text-amber-950 leading-snug">
                      智能账单差错追踪：检测到 {anomalousLogs.length} 条疑似生图失败但被扣费的账单流水
                   </h3>
                   <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                      发现部分生图连接因接口过载、未产生耗时标记或 0.0s 快速响应而未能成功返回图片，但记录了点数扣划。可点击右侧按钮过滤筛选历史流水，人工二次审核并一键校回退款。
                   </p>
                </div>
             </div>
             <div className="flex gap-2 w-full md:w-auto self-end md:self-center shrink-0">
                 <button
                    onClick={() => setOnlyAnomalies(!onlyAnomalies)}
                    className={`px-4 py-2 text-xs font-black rounded-xl border transition-all active:scale-95 flex items-center gap-1.5 shadow-sm ${
                      onlyAnomalies 
                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600' 
                        : 'bg-white hover:bg-stone-50 text-amber-800 border-amber-200'
                    }`}
                 >
                    {onlyAnomalies ? '显示全量记录' : '仅看疑似生图异常流水'}
                 </button>
             </div>
          </div>
        )}

        {/* 控制条 */}
        <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
               <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
               <input 
                  type="text" 
                  placeholder="搜索工号、姓名、模型..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none text-sm font-medium shadow-sm"
               />
            </div>
            {isAdmin && (
                <div className="relative w-full md:w-64 shrink-0">
                   <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                   <select 
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none text-sm font-bold text-stone-700 shadow-sm appearance-none"
                   >
                       <option value="all">所有部门 (全局)</option>
                       {departments.map(d => (
                           <option key={d} value={d}>{d}</option>
                       ))}
                   </select>
                </div>
            )}
        </div>

        {/* 数据表格 */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                        <tr className="bg-stone-50/80 border-b border-stone-200 text-[11px] font-black uppercase tracking-wider text-stone-500">
                            <th className="py-4 px-5">时间</th>
                            <th className="py-4 px-5">部门</th>
                            <th className="py-4 px-5">工号 / 姓名</th>
                            <th className="py-4 px-5">模型 & 参数</th>
                            <th className="py-4 px-5 text-right">消耗 (W)</th>
                            <th className="py-4 px-5 text-right">花费 ($)</th>
                            {isAdmin && <th className="py-4 px-5 text-center">系统审计/校回</th>}
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-stone-100">
                        {/* 动态统计汇总行 (冻结在顶部) */}
                        {!loading && displayData.length > 0 && (
                            <tr className="bg-emerald-50/60 border-b-2 border-emerald-100 hover:bg-emerald-50/80 transition-colors">
                                <td className="py-3 px-5 text-xs text-stone-500 font-bold whitespace-nowrap">
                                    总计汇总 (TOTAL)
                                </td>
                                <td className="py-3 px-5">
                                   <span className="px-2 py-1 bg-white border border-emerald-200 text-emerald-800 rounded text-xs font-black shadow-sm">
                                      {selectedDept === 'all' ? '所有部门' : selectedDept}
                                   </span>
                                </td>
                                <td className="py-3 px-5 text-stone-400 font-medium">
                                   --
                                </td>
                                <td className="py-3 px-5 text-stone-400 font-medium">
                                   包含 {displayData.length} 条流水数据统计
                                </td>
                                <td className="py-3 px-5 text-right">
                                    <span className="font-mono font-black text-emerald-700 bg-white border border-emerald-100 shadow-sm px-2.5 py-1 rounded-md text-sm">
                                        {onlyAnomalies ? (displayData.reduce((sum, item) => sum + (Number(item['消耗点数(Points)']) || 0), 0) / 10000).toFixed(2) : summary.consumed.toFixed(2)}
                                    </span>
                                </td>
                                <td className="py-3 px-5 text-right font-mono font-black text-stone-800 text-sm">
                                    ${onlyAnomalies ? displayData.reduce((sum, item) => sum + (Number(item['消耗美金($)']) || 0), 0).toFixed(4) : summary.consumed.toFixed(4)}
                                </td>
                                {isAdmin && <td className="py-3 px-5 text-center text-stone-400 font-bold">--</td>}
                            </tr>
                        )}
                        {loading ? (
                            <tr>
                                <td colSpan={isAdmin ? 7 : 6} className="py-20 text-center">
                                    <RefreshCw className="w-6 h-6 animate-spin text-stone-300 mx-auto mb-2" />
                                    <p className="text-stone-400 text-xs">加载数据中...</p>
                                </td>
                            </tr>
                        ) : displayData.length === 0 ? (
                            <tr>
                                <td colSpan={isAdmin ? 7 : 6} className="py-20 text-center">
                                    <FileSpreadsheet className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                                    <p className="text-stone-400 text-sm">暂无对应的计费日志</p>
                                </td>
                            </tr>
                        ) : (
                            displayData.map((row, idx) => (
                                <tr key={row.log_id || idx} className="hover:bg-stone-50/50 transition-colors">
                                    <td className="py-3 px-5 text-xs text-stone-400 font-mono">
                                        {row['使用时间']}
                                    </td>
                                    <td className="py-3 px-5">
                                        <span className="px-2 py-1 bg-stone-100 text-stone-700 rounded text-xs font-bold">
                                            {row['使用部门']}
                                        </span>
                                    </td>
                                    <td className="py-3 px-5">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-stone-800 text-sm">{row['员工姓名']}</span>
                                            <span className="text-[10px] text-stone-400 font-mono tracking-tight">{row['对方工号']}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-5">
                                        <div className="flex flex-col gap-1 items-start">
                                            <span className="font-bold text-stone-700 text-xs">{row['调用模型']}</span>
                                            {row['渲染规格/类型'] !== '-' && (
                                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold">
                                                    {row['渲染规格/类型']}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-5 text-right">
                                        <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-xs">
                                            {row['消耗额度(W)']}
                                        </span>
                                    </td>
                                    <td className="py-3 px-5 text-right font-mono font-medium text-stone-500">
                                        ${Number(row['消耗美金($)'] || 0).toFixed(4)}
                                    </td>
                                    {isAdmin && (
                                        <td className="py-3 px-5 text-center">
                                            {Number(row['消耗点数(Points)'] || 0) > 0 && (row['调用模型']?.toLowerCase().includes('image') || row['调用模型']?.toLowerCase().includes('preview') || row['操作类型'] === 'image_generation') ? (
                                                <button
                                                    onClick={() => handleRefund(row.log_id, Number(row['消耗点数(Points)']), row['员工姓名'])}
                                                    disabled={refundingId === row.log_id}
                                                    className="px-2.5 py-1 text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
                                                    title="若此生图发生红牌报错、空页、由于超时未生成，点击核减退款"
                                                >
                                                    {refundingId === row.log_id ? '退还中...' : '退还点数'}
                                                </button>
                                            ) : row['调用模型']?.includes('已退') || row['调用模型']?.includes('核退') ? (
                                                <span className="px-2 py-0.5 bg-stone-100 text-stone-400 border border-stone-200 rounded text-[11px] font-bold select-none">
                                                    已退回零
                                                </span>
                                            ) : row['调用模型']?.includes('未成功') ? (
                                                <span className="px-2 py-0.5 bg-rose-50 text-rose-500 border border-rose-200 rounded text-[11px] font-bold select-none">
                                                    生图失败(未扣点)
                                                </span>
                                            ) : (
                                                <span className="text-xs text-stone-400 select-none">
                                                    --
                                                </span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>显示最新的 2000 条数据进行分析</span>
                <span>当前筛选条目: <strong className="text-stone-800">{displayData.length}</strong></span>
            </div>
        </div>

      </div>
    </div>
  );
}
