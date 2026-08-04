import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { Database, Clock, RefreshCw, ArrowLeft, AlertCircle, Users, PlusCircle, X, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { fetchAdminUsers } from './AdminUsers';
import AdminNotepad from '../components/AdminNotepad';
import AdminHeader from '../components/AdminHeader';
import { BalanceDisplay } from '../components/BalanceDisplay';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#64748B'];

const cleanModelName = (rawModel?: string): string => {
  if (!rawModel) return '未知模型';
  return rawModel
    .replace(/\s*\([^)]*耗时[^)]*\)/gi, '')
    .replace(/\s*-\s*[VR]\s*$/gi, '')
    .trim() || '未知模型';
};

export const fetchAdminStats = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) throw new Error("Not logged in");
    
    const { data: profile } = await supabase.from('profiles').select('role, dept_id, quota_limit, quota_used').eq('id', user.id).single();
    if (!profile) throw new Error("Profile not found");

    const isAdmin = profile.role === 'admin';
    const isDeptAdmin = profile.role === 'dept_admin';

    let totalCapacity = profile.quota_limit || 0;
    let tokensUsed = profile.quota_used || 0;
    let hourlyData: any[] = [];
    let modelData: any[] = [];
    let totalBalance = { recharged: 0, consumed: 0, current: 0 };
    let departmentBalances: { dept_name: string; recharged: number; consumed: number; current: number }[] = [];
    let topUsersData: any[] = [];

    // logsQuery logic for recent logs table
    let logs: any[] = [];
    try {
        let lq = supabase.from('usage_logs').select('*, profiles (employee_id, username)').order('created_at', { ascending: false }).limit(100);
        
        if (!isAdmin && !isDeptAdmin) {
            lq = lq.eq('user_id', user.id);
        } else if (isDeptAdmin) {
            const { data: deptUsers } = await supabase.from('profiles').select('id').eq('dept_id', profile.dept_id);
            const ids = deptUsers?.map(u => u.id) || [];
            lq = lq.in('user_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
        }
        const { data, error } = await lq;
        logs = data || [];
    } catch (e) {
        console.error("Logs fetch error:", e);
    }

    // Fetch today's logs for accurate charts
    let chartLogs: any[] = [];
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        let cq = supabase.from('usage_logs').select('created_at, tokens_used, model').gte('created_at', todayStr).limit(5000);
        if (!isAdmin && !isDeptAdmin) {
            cq = cq.eq('user_id', user.id);
        } else if (isDeptAdmin) {
            const { data: deptUsers } = await supabase.from('profiles').select('id').eq('dept_id', profile.dept_id);
            const ids = deptUsers?.map(u => u.id) || [];
            cq = cq.in('user_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
        }
        const { data } = await cq;
        chartLogs = data || [];
    } catch (e) {
        console.error("Chart Logs fetch error", e);
    }

    if (isAdmin || isDeptAdmin) {
      // Fetch departments
      let deptsQuery = supabase.from('department_configs').select('id, dept_name');
      if (isDeptAdmin) {
         deptsQuery = deptsQuery.eq('id', profile.dept_id);
      }
      const { data: deptsData } = await deptsQuery;
      const depts = deptsData || [];

      // Fetch global or department balance deposits
      let depositsQuery = supabase.from('financial_records').select('amount, dept_id');
      if (isDeptAdmin) {
         depositsQuery = depositsQuery.eq('dept_id', profile.dept_id);
      }
      const { data: deposits } = await depositsQuery;
      const totalRecharged = deposits?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) || 0;

      // Fetch consumed cost from profiles instead of usage_logs for accurate totals
      let costData: any[] = [];
      try {
        let costDataQuery = supabase.from('profiles').select('quota_used, dept_id');
        const { data: rawCostData, error: costErr } = await costDataQuery;
        
        if (!costErr && rawCostData) {
           costData = rawCostData.map(x => ({ 
              cost_usd: Number(x.quota_used || 0) / 10000, 
              dept_id: x.dept_id || null 
           }));

           // If dept admin, filter to only their department
           if (isDeptAdmin) {
              costData = costData.filter(x => x.dept_id === profile.dept_id);
           }
        }
      } catch (e) {
        console.warn("Cost data fetch failed:", e);
      }
      
      const totalConsumed = costData.reduce((acc, curr) => acc + Number(curr.cost_usd || 0), 0);

      totalBalance = {
        recharged: totalRecharged,
        consumed: totalConsumed,
        current: totalRecharged - totalConsumed,
      };

      // 关键修正：1 USD = 10,000 点
      totalCapacity = totalBalance.recharged * 10000;
      tokensUsed = Math.round(totalBalance.consumed * 10000);

      // Calculate per-department balances
      if (depts.length > 0) {
         departmentBalances = depts.map(d => {
            const dDeposits = deposits?.filter(x => x.dept_id === d.id) || [];
            const dCosts = costData?.filter(x => x.dept_id === d.id) || [];
            const dRecharged = dDeposits.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
            const dConsumed = dCosts.reduce((acc, curr) => acc + Number(curr.cost_usd || 0), 0);
            return {
               dept_name: d.dept_name,
               recharged: dRecharged,
               consumed: dConsumed,
               current: dRecharged - dConsumed
            };
         });
      }
    }

    if (chartLogs && Array.isArray(chartLogs)) {
      if (!isAdmin && !isDeptAdmin) {
        const hourCounts: Record<string, number> = {};
        for (let i = 8; i <= 18; i++) hourCounts[`${i}:00`] = 0;

        const modelCounts: Record<string, number> = {};

        chartLogs.forEach(log => {
          const model = cleanModelName(log.model);
          const points = Number(log.tokens_used || 0);
          modelCounts[model] = (modelCounts[model] || 0) + (points / 10000);

          if (log.created_at) {
            const date = new Date(log.created_at);
            const hour = date.getHours();
            if (hour >= 8 && hour <= 18) hourCounts[`${hour}:00`] += (points / 10000);
          }
        });

        hourlyData = Object.entries(hourCounts).map(([hour, tokens]) => ({ hour, tokens: Number(tokens.toFixed(2)) }));
        
        const sortedModels = Object.entries(modelCounts)
          .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
          .filter(item => item.value > 0)
          .sort((a, b) => b.value - a.value);

        if (sortedModels.length > 5) {
          const top5 = sortedModels.slice(0, 5);
          const others = sortedModels.slice(5).reduce((acc, curr) => acc + curr.value, 0);
          modelData = [...top5, { name: '其他', value: Number(others.toFixed(2)) }];
        } else {
          modelData = sortedModels;
        }
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        const hourlyMap: Record<string, number> = {};
        for (let i = 0; i < 24; i++) hourlyMap[`${String(i).padStart(2, '0')}:00`] = 0;
        
        const modelMap: Record<string, number> = {};

        chartLogs.forEach((log: any) => {
          if (!log.created_at) return;
          const t = new Date(log.created_at);
          if (log.created_at.startsWith(todayStr)) {
            const hr = String(t.getHours()).padStart(2, '0') + ':00';
            if (hourlyMap[hr] !== undefined) hourlyMap[hr] += 1;
          }
          
          const cost = Number(log.tokens_used || 0) / 10000;
          const model = cleanModelName(log.model);
          modelMap[model] = (modelMap[model] || 0) + cost;
        });

        hourlyData = Object.keys(hourlyMap).map(k => ({ hour: k, count: hourlyMap[k] }));

        const sortedModels = Object.keys(modelMap)
          .filter(k => modelMap[k] > 0)
          .map(k => ({ name: k, value: Number(modelMap[k].toFixed(2)) }))
          .sort((a, b) => b.value - a.value);

        if (sortedModels.length > 5) {
          const top5 = sortedModels.slice(0, 5);
          const others = sortedModels.slice(5).reduce((acc, curr) => acc + curr.value, 0);
          modelData = [...top5, { name: '其他', value: Number(others.toFixed(2)) }];
        } else {
          modelData = sortedModels;
        }

        // Fetch accurate Top 5 Users from profiles table
        let topUsersQuery = supabase.from('profiles').select('employee_id, username, quota_used').order('quota_used', { ascending: false }).limit(5);
        if (isDeptAdmin) {
            topUsersQuery = topUsersQuery.eq('dept_id', profile.dept_id);
        }
        try {
            const { data: topProfs } = await topUsersQuery;
            if (topProfs) {
                topUsersData = topProfs.map(u => ({
                    employeeId: u.employee_id || u.username || 'Unknown',
                    cost: Number((Number(u.quota_used || 0) / 10000).toFixed(2))
                })).filter(u => u.cost > 0);
            }
        } catch (e) {
            console.warn("Failed to fetch top users", e);
        }
      }
    }

    return {
        isAdmin,
        isDeptAdmin,
        totalCapacity,
        tokensUsed,
        hourlyData,
        modelData,
        totalBalance,
        departmentBalances,
        topUsersData,
        recentLogs: logs
    };
};

const SkeletonCard = ({ className = "" }: { className?: string }) => (
  <div className={`bg-stone-200 animate-pulse rounded-3xl ${className}`}></div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: stats, isLoading, refetch, isError, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchAdminStats,
    staleTime: 1000 * 60 * 5, // 5 minutes fresh
    retry: 1
  });

  const [showRechargeModal, setShowRechargeModal] = React.useState(false);
  const [showAdminLog, setShowAdminLog] = React.useState(false);
  const [rechargeAmount, setRechargeAmount] = React.useState('');
  const [rechargeNote, setRechargeNote] = React.useState('');
  const [selectedDeptId, setSelectedDeptId] = React.useState<string | null>(null);
  const [departments, setDepartments] = React.useState<{id: string, dept_name: string}[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  useEffect(() => {
    const fetchDepts = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role, dept_id').eq('id', user.id).single();
      
      let query = supabase.from('department_configs').select('id, dept_name');
      if (profile?.role === 'dept_admin') {
         query = query.eq('id', profile.dept_id);
      }
      
      const { data } = await query;
      if (data) {
         setDepartments(data);
         if (profile?.role === 'dept_admin' || data.length === 1) {
            setSelectedDeptId(data[0].id);
         }
      }
    };
    fetchDepts();
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('manwah_user');
    await supabase.auth.signOut();
    queryClient.clear();
    window.location.href = '/login';
  };

  const handleDeposit = async () => {
    const amount = parseFloat(rechargeAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('请输入有效的金额');
      return;
    }
    if (!selectedDeptId) {
      alert('请选择要充值的部门');
      return;
    }

    setIsSubmitting(true);
    try {
      // 获取当前管理员信息
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      const { data: profile } = user ? await supabase.from('profiles').select('username').eq('id', user.id).single() : { data: null };

      const { error } = await supabase
        .from('financial_records')
        .insert([{ 
          amount: amount, 
          note: rechargeNote || '管理员录入充值',
          operator_id: user?.id,
          operator_name: profile?.username || user?.email,
          dept_id: selectedDeptId,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

      alert(`成功为所选部门录入 $${amount}！系统余额已更新。`);
      setShowRechargeModal(false);
      setRechargeAmount('');
      setRechargeNote('');
      setSelectedDeptId(null);
      
      // 强制刷新所有相关数据
      queryClient.invalidateQueries({ queryKey: ['usage-dashboard'] });
      refetch();
    } catch (err: any) {
      console.error('Recharge failed:', err);
      alert('录入失败: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isError) {
      console.error('Dashboard state fetch failed');
    }
  }, [isError, navigate]);

  if (isLoading) {
     return (
        <div className="h-full w-full bg-stone-100 p-4 md:p-8 font-sans">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border border-stone-200">
               <RefreshCw className="w-10 h-10 text-stone-400 animate-spin mb-4" />
               <p className="text-stone-500 font-bold animate-pulse">正在梳理统计数据...</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <SkeletonCard className="h-32 w-full" />
              <SkeletonCard className="h-32 w-full" />
              <SkeletonCard className="h-32 w-full" />
            </div>
          </div>
        </div>
     );
  }

  if (isError || !stats) {
     return (
        <div className="h-full w-full bg-stone-100 flex items-center justify-center p-4">
           <div className="text-center p-8 bg-white rounded-3xl shadow-sm border border-stone-200 max-w-sm">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-stone-900 mb-2">数据加载异常</h2>
              <p className="text-stone-500 text-sm mb-6">暂时无法获取统计数据。错误信息：{error instanceof Error ? error.message : String(error)}</p>
              <button 
                onClick={() => {
                   queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
                   refetch();
                }} 
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold transition-all hover:bg-stone-800"
              >
                 立即录入并重试
              </button>
           </div>
        </div>
     );
  }

  const { isAdmin, isDeptAdmin, totalCapacity, tokensUsed, hourlyData, modelData, totalBalance, departmentBalances, topUsersData, recentLogs } = stats;

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-stone-100 p-4 md:p-8 font-sans w-full"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header - Refactored to match reference */}
        <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl shadow-sm border border-white mb-6">
          <div 
            onDoubleClick={(isAdmin || isDeptAdmin) ? () => setShowAdminLog(true) : undefined}
            className={(isAdmin || isDeptAdmin) ? "cursor-help select-none" : ""}
            title={(isAdmin || isDeptAdmin) ? "双击标题以打开维护手册" : ""}
          >
            <h2 className="text-xl font-bold text-gray-800 mb-1">
              欢迎回来，{isAdmin ? '管理员' : isDeptAdmin ? '部门管理员' : '用户'}
            </h2>
            <p className="text-xs text-gray-500 mb-4 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span> 系统运行正常
            </p>
            <div className="bg-stone-600 text-white text-xs inline-block px-3 py-1.5 rounded-full font-medium">
                权限等级：<span className="text-pink-300 ml-1 shadow-sm">{isAdmin ? '全域最高权限' : isDeptAdmin ? '部门管理权限' : '标准用户权限'}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-indigo-50">
            <button 
               onClick={() => navigate('/manwah')}
               className="px-4 py-2 bg-white hover:bg-stone-50 border border-stone-100 text-stone-700 rounded-xl font-bold flex items-center gap-2 text-sm transition-colors shadow-sm"
            >
               <ArrowLeft className="w-4 h-4" /> 返回工作流
            </button>
            {(isAdmin || isDeptAdmin) && (
              <>
                <button 
                   onClick={() => setShowRechargeModal(true)} 
                   className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-bold flex items-center gap-2 text-sm transition-colors shadow-sm"
                >
                   <PlusCircle className="w-4 h-4" /> 新增充值
                </button>
                <button 
                   onMouseEnter={() => queryClient.prefetchQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers, staleTime: 1000 * 60 * 5 })}
                   onClick={() => navigate('/admin/users')} 
                   className="px-4 py-2 bg-stone-900 text-white hover:bg-stone-800 rounded-xl font-bold flex items-center gap-2 text-sm transition-colors shadow-sm"
                >
                   <Users className="w-4 h-4" /> {isAdmin ? '账号管理' : '人员名册'}
                </button>
              </>
            )}
            {isAdmin && (
              <button 
                 onClick={() => setShowAdminLog(true)} 
                 className="p-2 bg-white border border-stone-100 hover:bg-stone-50 text-stone-700 rounded-xl transition-colors shadow-sm cursor-pointer"
                 title="查看维护手册"
              >
                 <BookOpen className="w-5 h-5" />
              </button>
            )}
            <button 
               onClick={() => refetch()}
               className="p-2 bg-white border border-stone-100 hover:bg-stone-50 text-stone-700 rounded-xl transition-colors shadow-sm cursor-pointer"
            >
               <RefreshCw className={`w-5 h-5`} />
            </button>
          </div>
        </div>

        {/* Warning For Admins if Balance Drop */}
        {(isAdmin || isDeptAdmin) && totalBalance.current < 10 && (
          <div className="p-4 rounded-xl border bg-red-50 border-red-200 text-red-900 flex items-center gap-2 animate-pulse">
            <AlertCircle className="h-5 w-5" />
            <div className="text-sm font-bold">
              部门 API 余额不足 (${totalBalance.current.toFixed(2)} remaining). 请尽快充值以避免服务中断！
            </div>
          </div>
        )}

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 lg:col-span-full">
            <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
                <span className="text-xl">📈</span> {isAdmin ? '全站 AGI 监控中心' : isDeptAdmin ? '部门 AGI 监控中心' : '我的 AGI 消耗报告'}
            </h3>
            
            <BalanceDisplay quotaLimit={totalCapacity} quotaUsed={tokensUsed} variant="modern" />
          </div>
          
          {(isAdmin || isDeptAdmin) ? (
            <>
              <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col justify-center relative overflow-hidden group">
                 <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1 relative z-10 transition-colors group-hover:text-stone-900">Total Recharged</p>
                 <h3 className="text-3xl font-black text-stone-900 relative z-10 font-mono tracking-tighter">${totalBalance.recharged.toFixed(2)}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col justify-center relative overflow-hidden group">
                 <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1 relative z-10 transition-colors group-hover:text-stone-900">Total Consumed</p>
                 <h3 className="text-3xl font-black text-stone-900 relative z-10 font-mono tracking-tighter">${totalBalance.consumed.toFixed(2)}</h3>
              </div>
            </>
          ) : (
             <>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 flex items-center gap-4 group">
                  <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-12">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                     <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">累计消耗总量</p>
                     <h3 className="text-2xl font-black text-stone-900 font-mono tracking-tighter">{(tokensUsed / 10000).toFixed(2)} <span className="text-xs font-normal text-stone-400">W</span></h3>
                  </div>
                </div>
                
                <div className="bg-stone-900 p-6 rounded-3xl shadow-md text-white flex items-center gap-4">
                   <div className="flex-1">
                      <p className="text-xs font-black text-stone-400 uppercase tracking-widest">总体使用进度</p>
                      <div className="mt-2 flex items-center gap-3">
                         <div className="flex-1 h-3 bg-stone-700 rounded-full overflow-hidden border border-stone-600">
                            <div 
                               className="h-full bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.5)]" 
                               style={{ width: `${Math.min(100, (tokensUsed / totalCapacity) * 100)}%` }} 
                            />
                         </div>
                         <span className="font-mono text-sm font-black tracking-tighter">{totalCapacity > 0 ? ((tokensUsed / totalCapacity) * 100).toFixed(1) : '0.0'}%</span>
                      </div>
                   </div>
                </div>
             </>
          )}
        </div>

        {/* Department Breakdown */}
        {isAdmin && departmentBalances && departmentBalances.length > 0 && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
            <div className="flex items-center justify-between mb-6">
               <h3 className="font-bold text-stone-800 flex items-center gap-2">
                 <Users className="w-4 h-4 text-stone-400" /> 部门额度看板
               </h3>
               <button onClick={() => navigate('/admin/billing')} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors">
                  查看详细审计报表 &rarr;
               </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {departmentBalances.map(dept => (
                <div key={dept.dept_name} className="p-4 border border-stone-100 rounded-2xl bg-stone-50 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-stone-900 mb-1">{dept.dept_name}</h4>
                    <p className="text-xs text-stone-500 mb-3">
                      总充值 ${dept.recharged.toFixed(2)} | 已用 ${dept.consumed.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-stone-500">剩余可用</span>
                    <span className={`text-lg font-black ${dept.current < 10 ? 'text-red-500' : 'text-emerald-600'}`}>
                      ${dept.current.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Time Series Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100">
             <h3 className="font-bold text-gray-800 text-sm mb-4">
                {(isAdmin || isDeptAdmin) ? "今日全站请求频率分布" : "今日使用频率分布 (W 点数)"}
             </h3>
             <div className="h-[300px] w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%" debounce={50}>
                   <LineChart data={hourlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E5E4" />
                     <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716C' }} dy={10} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716C' }} />
                     <Tooltip 
                       contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} 
                       itemStyle={{ color: '#1C1917', fontWeight: 'bold' }}
                     />
                     <Line type="monotone" dataKey={(isAdmin || isDeptAdmin) ? "count" : "tokens"} name={(isAdmin || isDeptAdmin) ? "Requests" : "Value (W)"} stroke="#1C1917" strokeWidth={3} dot={{ r: 4, fill: '#1C1917', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                   </LineChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Model Distribution */}
          <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col justify-between">
             <h3 className="font-bold text-gray-800 text-sm mb-4">
                {(isAdmin || isDeptAdmin) ? "各模型消费分布 (USD)" : "模型使用分布 (W 点数)"}
             </h3>
             <div className="h-[300px] w-full min-h-[300px]">
                {modelData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" debounce={50}>
                     {(isAdmin || isDeptAdmin) ? (
                      <PieChart>
                         <Pie
                           data={modelData}
                           cx="50%"
                           cy="45%"
                           innerRadius={55}
                           outerRadius={85}
                           paddingAngle={4}
                           dataKey="value"
                           label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                         >
                           {modelData.map((_entry, index) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <Tooltip 
                            formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                         />
                         <Legend 
                           verticalAlign="bottom" 
                           align="center"
                           iconType="circle"
                           wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                           formatter={(value) => (value && value.length > 25 ? `${value.substring(0, 22)}...` : value)}
                         />
                       </PieChart>
                     ) : (
                       <BarChart data={modelData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E7E5E4" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716C', fontWeight: 500 }} width={120} />
                          <Tooltip 
                            cursor={{ fill: '#F5F5F4' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} 
                          />
                          <Bar dataKey="value" fill="#3B82F6" name="Value (W)" radius={[0, 4, 4, 0]} barSize={24} />
                       </BarChart>
                     )}
                  </ResponsiveContainer>
                ) : (
                   <div className="flex h-full items-center justify-center text-stone-400 text-sm">暂无数据</div>
                )}
             </div>
          </div>
        </div>

        {/* Top Users (Admin Only) */}
        {(isAdmin || isDeptAdmin) && (
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
             <h3 className="font-bold text-stone-800 mb-6 flex items-center gap-2">
                <Database className="w-4 h-4 text-stone-400"/> TOP 5 员工消费榜
             </h3>
             <div className="h-[300px] w-full min-h-[300px]">
                {topUsersData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" debounce={50}>
                    <BarChart data={topUsersData} layout="vertical" margin={{ left: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="employeeId" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716C', fontWeight: 500 }} />
                      <Tooltip 
                        cursor={{ fill: '#F5F5F4' }}
                        contentStyle={{ borderRadius: '12px', border: 'none' }}
                      />
                      <Bar dataKey="cost" fill="#00C49F" name="Cost (USD)" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-stone-400 text-sm">暂无数据</div>
                )}
             </div>
           </div>
        )}

        {/* Recent Usage Logs */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-stone-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-stone-400"/> 最近消耗明细 (仅显示前 50 条)
            </h3>
            {(isAdmin || isDeptAdmin) && (
                <button onClick={() => navigate('/admin/billing')} className="text-xs font-bold text-stone-600 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-lg transition-colors">
                  导出全部流水 &rarr;
                </button>
            )}
          </div>
          
          {/* PC 端表格 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-100 italic text-stone-400 text-[10px] uppercase tracking-widest">
                  <th className="py-3 px-2 whitespace-nowrap">时间</th>
                  <th className="py-3 px-2 whitespace-nowrap">员工 ID</th>
                  <th className="py-3 px-2 whitespace-nowrap">模型</th>
                  <th className="py-3 px-2 whitespace-nowrap">精度</th>
                  <th className="py-3 px-2 whitespace-nowrap">点数消耗</th>
                  <th className="py-3 px-2 whitespace-nowrap">估值 (USD)</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {(stats.recentLogs as any[])?.slice(0, 50).map((log: any) => (
                  <tr key={log.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                    <td className="py-3 px-2 font-mono text-[10px] text-stone-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-2 font-bold text-stone-600 text-xs">
                      {log.profiles?.employee_id || log.profiles?.username || log.user_id?.substring(0,8) || 'System'}
                    </td>
                    <td className="py-3 px-2 font-bold text-stone-800 max-w-[280px] truncate" title={log.model}>{log.model}</td>
                    <td className="py-3 px-2">
                       <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.model_res === '4K' ? 'bg-purple-100 text-purple-700' : 'bg-stone-100 text-stone-600'}`}>
                          {log.model_res || '-'}
                       </span>
                    </td>
                    <td className="py-3 px-2 font-mono font-bold text-emerald-600">
                      {(Number(log.tokens_used) / 10000).toFixed(2)} W
                    </td>
                    <td className="py-3 px-2 font-mono text-stone-500">
                      ${(Number(log.tokens_used) / 10000).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {(!stats.recentLogs || (stats.recentLogs as any[]).length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-400 text-sm">暂无消耗历史</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 手机端卡片列表 (单行精简版) */}
          <div className="md:hidden divide-y divide-stone-100 mt-4 border border-stone-100 rounded-xl overflow-hidden bg-stone-50/50">
            {(stats.recentLogs as any[])?.slice(0, 50).map((log: any) => (
              <div key={log.id} className="py-3 px-4 flex items-center justify-between text-xs bg-white">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="text-stone-400 shrink-0 font-mono text-[10px]">
                    {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <span className="text-stone-500 shrink-0 truncate max-w-[70px]">
                    {log.profiles?.employee_id || log.profiles?.username || log.user_id?.substring(0,8) || 'System'}
                  </span>
                  <span className="font-bold text-stone-800 truncate">
                    {log.model}
                  </span>
                </div>
                <div className="font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0 text-[10px]">
                   估: ${(Number(log.tokens_used) / 10000).toFixed(2)}
                </div>
              </div>
            ))}
            {(!stats.recentLogs || (stats.recentLogs as any[]).length === 0) && (
              <div className="py-8 text-center text-stone-400 text-sm bg-white">暂无消耗历史</div>
            )}
          </div>
        </div>
      </div>

      {/* Recharge Modal */}
      {showRechargeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <h3 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-600" /> 新增系统充值
              </h3>
              <button onClick={() => setShowRechargeModal(false)} className="p-2 hover:bg-stone-200 rounded-lg transition-colors text-stone-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-2">归属部门</label>
                <select 
                  className="w-full px-4 py-3 bg-stone-100 border-none rounded-xl focus:ring-2 focus:ring-stone-900 transition-all font-bold text-stone-700 outline-none disabled:opacity-75 disabled:appearance-none disabled:cursor-not-allowed"
                  value={selectedDeptId || ''}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  disabled={departments.length === 1}
                >
                  <option value="" disabled>请选择要充值的部门...</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.dept_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-2">充值金额 (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold">$</span>
                  <input 
                    type="number" 
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 bg-stone-100 border-none rounded-xl focus:ring-2 focus:ring-stone-900 transition-all font-mono text-lg font-bold"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-2">备注说明</label>
                <textarea 
                  value={rechargeNote}
                  onChange={(e) => setRechargeNote(e.target.value)}
                  placeholder="例如：2024-05 运行资金"
                  rows={3}
                  className="w-full px-4 py-3 bg-stone-100 border-none rounded-xl focus:ring-2 focus:ring-stone-900 transition-all text-sm"
                />
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <button 
                  onClick={handleDeposit}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-stone-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '录入中...' : '确认录入'}
                </button>
                <button 
                  onClick={() => setShowRechargeModal(false)}
                  className="w-full py-4 bg-white text-stone-500 rounded-2xl font-bold text-sm hover:bg-stone-50 transition-all"
                >
                  取消
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Admin Maintenance Log */}
      {isAdmin && (
        <AdminNotepad 
          isOpen={showAdminLog} 
          setIsOpen={setShowAdminLog} 
        />
      )}
    </motion.div>
    </>
  );
}

