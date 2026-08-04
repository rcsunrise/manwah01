import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, LogOut, ArrowLeft, PlusCircle, Loader2, X, Lock, Trash2, ShieldAlert, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiStatusChecker } from '../components/ApiStatusChecker';
import AdminHeader from '../components/AdminHeader';

const DeleteUserModal = ({ user, onClose, onUpdate }: { 
  user: any, 
  onClose: () => void,
  onUpdate: () => void
}) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const confirmDelete = async () => {
    setIsVerifying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const adminUser = userData?.user;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminUser?.email || '',
        password: adminPassword,
      });

      if (signInError) {
        alert("管理员密码错误，无权执行此操作！");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-user-id': session?.user?.id || ''
        }
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const errorText = await response.text();
        console.error('Non-JSON response:', errorText);
        throw new Error(`服务器返回了非 JSON 响应 (状态码: ${response.status})。可能是权限不足或路径错误。`);
      }

      if (!response.ok) {
        alert(data.error || '删除失败');
      } else {
        alert(`账号 ${user.username || user.employee_id} 已成功移除`);
        onUpdate();
        onClose();
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        alert('删除失败: 网络连接异常或服务器正在重启，请刷新重试。');
      } else {
        alert('删除失败: ' + err.message);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-8 w-[400px] shadow-2xl border border-red-100">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-stone-900">确认删除账号？</h2>
          <p className="text-sm text-stone-500 mt-2">
            您正在尝试删除员工 <span className="font-bold text-red-600">{user.username || user.employee_id}</span>。<br/>
            此操作不可逆，将清除该用户的所有相关信息。
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-3.5 text-stone-400" size={18} />
            <input 
              type="password"
              placeholder="请输入当前管理员登录密码"
              className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition-all"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-colors"
            >
              取消
            </button>
            <button 
              onClick={confirmDelete}
              disabled={!adminPassword || isVerifying}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {isVerifying ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
              确认删除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ResetPasswordModal = ({ user, onClose }: { 
  user: any, 
  onClose: () => void
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (newPassword.length < 6) {
      alert('密码长度至少6位');
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-user-id': session?.user?.id || ''
        },
        body: JSON.stringify({
          userId: user.id,
          newPassword: newPassword
        })
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const errorText = await response.text();
        console.error('Non-JSON response:', errorText);
        throw new Error(`服务器返回了非 JSON 响应 (状态码: ${response.status})。可能是权限不足或路径错误。`);
      }

      if (!response.ok) {
        alert(data.error || '重置失败');
      } else {
        alert(`已成功重置 ${user.username || user.employee_id} 的密码`);
        onClose();
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        alert('重置密码失败: 网络连接异常或服务器正在重启，请刷新重试。');
      } else {
        alert('重置密码失败: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-8 w-96 shadow-2xl border border-stone-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-stone-800">重置密码</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors"><X size={24} /></button>
        </div>
        
        <p className="text-sm text-stone-500 mb-6 bg-stone-50 p-3 rounded-xl border border-stone-100">
          正在为员工 <span className="font-bold text-stone-800">{user.username || user.employee_id}</span> 重置密码。
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-stone-700 mb-2">新密码</label>
            <input 
              type="text" 
              placeholder="请输入新密码"
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-stone-900 outline-none transition-all"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button 
            disabled={loading || !newPassword}
            onClick={handleReset}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Lock size={20} />}
            确认重置密码
          </button>
        </div>
      </div>
    </div>
  );
};

const AdjustQuotaModal = ({ user, onClose, onUpdate, systemBalance }: { 
  user: any, 
  onClose: () => void, 
  onUpdate: () => void,
  systemBalance: number
}) => {
  const [amount, setAmount] = useState<number>(100000);
  const [loading, setLoading] = useState(false);

  // Conversion rate: $1 per 10,000 tokens as per new billing rules
  const estimatedCost = (amount > 0 ? amount : 0) / 10000;

  const handleAdd = async () => {
    if (amount > 0 && estimatedCost > systemBalance) {
      const confirmProceed = window.confirm(`警告：分配给员工的额度（预估价值 $${estimatedCost.toFixed(2)}）已超过部门充值的总可用余额（$${systemBalance.toFixed(2)}），请确认是否继续分配？`);
      if (!confirmProceed) return;
    }

    setLoading(true);
    try {
      // Use direct update as fallback if RPC increment_quota is not available
      const currentQuota = user.quota_limit || 0;
      const newQuota = Math.max(0, currentQuota + amount);
      const { error } = await supabase
        .from('profiles')
        .update({ quota_limit: newQuota })
        .eq('id', user.id);

      if (error) throw error;
      
      alert(`已成功为 ${user.username || user.employee_id} 调整 ${amount.toLocaleString()} 额度`);
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      alert("额度分配失败，请检查网络或权限");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-8 w-96 shadow-2xl border border-stone-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-stone-800">调整额度配额</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors"><X size={24} /></button>
        </div>
        
        <div className="mb-6 space-y-2">
          <p className="text-sm text-stone-500 bg-stone-50 p-3 rounded-xl border border-stone-100">
            正在为员工 <span className="font-bold text-stone-800">{user.username || user.employee_id}</span> 分配配额。
          </p>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider px-1">
            <span className="text-stone-400 font-black">系统账面余额: <span className="text-stone-600">${systemBalance.toFixed(2)}</span></span>
            <span className={estimatedCost > systemBalance ? 'text-red-500 font-black' : 'text-emerald-600'}>
              预估价值: ${estimatedCost.toFixed(2)} (1W=$1)
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-stone-700 mb-2">调整数量 (10000 = 1W = $1)</label>
            <input 
              type="number" 
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-stone-900 outline-none transition-all"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[-100000, -50000, 50000, 100000].map(val => (
              <button 
                key={val}
                type="button"
                onClick={() => setAmount(val)}
                className={`text-xs py-2 rounded-lg font-bold transition-colors ${val < 0 ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
              >
                {val > 0 ? '+' : ''}{val / 10000}万
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button 
            disabled={loading}
            onClick={handleAdd}
            className="w-full bg-stone-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <PlusCircle size={20} />}
            确认调整额度
          </button>
        </div>
      </div>
    </div>
  );
};

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';

export const fetchAdminUsers = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) throw new Error('Not logged in');
  
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'dept_admin')) {
    throw new Error('Unauthorized');
  }
  
  let profilesQuery = supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (profile.role === 'dept_admin') {
     profilesQuery = profilesQuery.eq('dept_id', profile.dept_id);
  }
  const { data: profiles, error } = await profilesQuery;
  if (error) throw error;
  
  let deptsQuery = supabase.from('department_configs').select('id, dept_name');
  if (profile.role === 'dept_admin') {
     deptsQuery = deptsQuery.eq('id', profile.dept_id);
  }
  const { data: depts, error: deptsError } = await deptsQuery;
  if (deptsError) throw deptsError;

  // Calculate system balance
  let depositsQuery = supabase.from('financial_records').select('amount');
  let usageQuery = supabase.from('usage_logs').select('cost_usd');
  
  if (profile.role === 'dept_admin') {
     depositsQuery = depositsQuery.eq('dept_id', profile.dept_id);
     
     const deptUserIds = profiles ? profiles.map(p => p.id) : [];
     if (deptUserIds.length > 0) {
        usageQuery = usageQuery.in('user_id', deptUserIds);
     } else {
        usageQuery = usageQuery.eq('user_id', '00000000-0000-0000-0000-000000000000');
     }
  }

  const { data: deposits } = await depositsQuery;
  const totalRecharge = deposits?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;
  
  const { data: usage } = await usageQuery;
  const totalConsumed = usage?.reduce((acc, curr) => acc + (curr.cost_usd || 0), 0) || 0;

  return {
    currentUser: profile,
    users: profiles || [],
    departments: depts || [],
    systemBalance: totalRecharge - totalConsumed
  };
};

const SkeletonCard = ({ className = "" }: { className?: string }) => (
  <div className={`bg-stone-200 animate-pulse rounded-3xl ${className}`}></div>
);

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedUserForReset, setSelectedUserForReset] = useState<any>(null);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  
  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newQuota, setNewQuota] = useState('100000');
  const [newDeptId, setNewDeptId] = useState('');
  
  // Batch update state
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [targetDeptId, setTargetDeptId] = useState('');
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  useEffect(() => {
    if (isError) {
      alert('您没有权限访问此页面或未登录');
      navigate('/manwah');
    }
  }, [isError, navigate]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      
      const payload: any = {
        employeeId: newEmpId,
        password: newPassword,
        username: newUsername,
        quotaLimit: newQuota
      };
      
      const role = data?.currentUser?.role;
      if (role === 'dept_admin') {
         payload.dept_id = data?.currentUser?.dept_id;
      } else {
         payload.dept_id = newDeptId || null;
      }

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(payload)
      });

      const contentType = response.headers.get("content-type");
      let resData;
      if (contentType && contentType.includes("application/json")) {
        resData = await response.json();
      } else {
        const errorText = await response.text();
        console.error('Non-JSON response:', errorText);
        throw new Error(`服务器返回了非 JSON 响应 (状态码: ${response.status})。可能是权限不足或服务器错误。`);
      }

      if (!response.ok) {
        alert(resData.error || '创建失败');
      } else {
        alert('账号创建成功');
        setNewEmpId('');
        setNewPassword('');
        setNewUsername('');
        setNewDeptId('');
        refetch();
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        alert('创建失败: 网络连接异常或服务器正在重启，请刷新重试。');
      } else {
        alert('创建失败: ' + err.message);
      }
    }
    setIsCreating(false);
  };

  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('manwah_user');
    await supabase.auth.signOut();
    queryClient.clear();
    window.location.href = '/login';
  };

  const forceUpdate = () => refetch();

  const handleBatchUpdateDept = async () => {
    if (!targetDeptId) {
      alert("请选择要分配的目标部门");
      return;
    }
    if (selectedUserIds.length === 0) {
      alert("请先勾选需要分配的员工");
      return;
    }
    
    setIsBatchUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ dept_id: targetDeptId })
        .in('id', selectedUserIds);

      if (error) {
        throw error;
      } else {
        alert(`已成功将 ${selectedUserIds.length} 名员工分配至新部门`);
        setSelectedUserIds([]);
        refetch();
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        alert("批量调整部门失败: 网络连接异常或服务器正在重启，请刷新重试。");
      } else {
        alert("批量调整部门失败: " + err.message);
      }
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedUserIds(data?.users?.map((u: any) => u.id) || []);
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleSelectUser = (id: string) => {
    setSelectedUserIds(prev => 
      prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
    );
  };

  const handleUpdateSingleDept = async (userId: string, newDeptId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ dept_id: newDeptId })
        .eq('id', userId);
      if (error) throw error;
      refetch();
    } catch (err: any) {
      alert('更新部门失败: ' + err.message);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);
      if (error) throw error;
      refetch();
    } catch(err: any) {
      alert('更新状态失败: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full w-full bg-stone-100 p-4 md:p-8 font-sans">
        <div className="max-w-6xl mx-auto space-y-6">
          <SkeletonCard className="h-24 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkeletonCard className="h-[400px] w-full lg:col-span-1" />
            <SkeletonCard className="h-[400px] w-full lg:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  const users = data?.users || [];
  const currentUser = data?.currentUser;

  const filteredUsers = users.filter((u: any) => 
    (u.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.username?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-stone-100 p-4 md:p-8 font-sans w-full"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header (Refactored to match reference) */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">⛨</span>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">员工账号管理中心</h2>
          </div>
          <p className="text-xs text-gray-500 mb-5">创建和管理 AGI 创新工作室工号</p>
          <div className="flex gap-2">
            <button 
               onClick={() => navigate('/manwah')}
               className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-sm border border-gray-200 transition-colors flex justify-center items-center gap-1"
            >
               <ArrowLeft className="w-4 h-4" /> 返回工作室
            </button>
            <button 
               onClick={handleLogout}
               className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 rounded-xl text-sm border border-red-100 transition-colors flex justify-center items-center gap-1"
            >
               <LogOut className="w-4 h-4" /> 登出账号
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create User Form */}
          <div className="lg:col-span-1">
             <div className="bg-white p-5 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100">
                <h3 className="font-bold text-gray-800 text-md mb-4 flex items-center gap-2">
                   <span className="text-gray-500 text-lg">👤+</span> 发配新账号
                </h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                   <div>
                     <label className="block text-sm font-bold text-stone-700 mb-2">员工工号</label>
                     <input 
                       type="text"
                       placeholder="例如: 27681471" 
                       value={newEmpId}
                       onChange={(e) => setNewEmpId(e.target.value)}
                       className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-stone-900 outline-none transition-all placeholder:text-stone-400"
                       required
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-stone-700 mb-2">初始密码</label>
                     <input 
                       type="text"
                       placeholder="默认: 123456" 
                       value={newPassword}
                       onChange={(e) => setNewPassword(e.target.value)}
                       className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-stone-900 outline-none transition-all placeholder:text-stone-400"
                       required
                       minLength={6}
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-stone-700 mb-2">员工姓名 / 昵称</label>
                     <input 
                       type="text"
                       placeholder="选填" 
                       value={newUsername}
                       onChange={(e) => setNewUsername(e.target.value)}
                       className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-stone-900 outline-none transition-all placeholder:text-stone-400"
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-stone-700 mb-2">所属部门</label>
                     <select 
                       value={data?.currentUser?.role === 'dept_admin' ? data?.currentUser?.dept_id : newDeptId}
                       onChange={(e) => setNewDeptId(e.target.value)}
                       disabled={data?.currentUser?.role === 'dept_admin'}
                       className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-stone-900 outline-none transition-all placeholder:text-stone-400 disabled:opacity-50"
                     >
                       <option value="">未分配部门</option>
                       {data?.departments?.map((d: any) => <option key={d.id} value={d.id}>{d.dept_name}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-stone-700 mb-2">初始额度 (1W=$1, 默认为10W)</label>
                     <input 
                       type="number"
                       placeholder="100000" 
                       value={newQuota}
                       onChange={(e) => setNewQuota(e.target.value)}
                       className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-stone-900 outline-none transition-all placeholder:text-stone-400"
                       required
                     />
                   </div>
                   <button 
                     type="submit" 
                     disabled={isCreating}
                     className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                   >
                     {isCreating ? '注册中...' : '注册工号'}
                   </button>
                </form>
             </div>
          </div>

          {/* User List */}
          <div className="lg:col-span-2 flex flex-col">
             <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3 shadow-sm">
                <span className="text-blue-500 text-lg mt-0.5">ⓘ</span>
                <div className="text-xs text-blue-800 leading-relaxed">
                  <h4 className="font-bold text-blue-900 mb-1.5 text-sm">同步登录态说明</h4>
                  <p className="text-blue-800/80">在进行角色或部门权限的修改后，前端用户的加密令牌 (JWT Token) 不会自动失效。<br/>
                  <span className="font-bold text-blue-900">请注意：</span> 目标用户必须<span className="font-bold text-blue-900 mx-1">点击“登出”再“重新登录”</span>，系统重新下发包含最新角色的令牌后，前端菜单与对应的权限才会正式生效。</p>
                </div>
             </div>
             
             <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col max-h-[calc(100vh-140px)] overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white shrink-0">
                   <h3 className="font-bold text-gray-800 text-md flex items-center gap-2 whitespace-nowrap">
                      <span className="text-gray-500 text-lg">👥</span> 已注册员工列表 ({users.length})
                   </h3>
                   
                   <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
                      {/* Search Bar */}
                      <div className="relative w-full sm:w-64">
                         <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                         <input 
                            type="text"
                            placeholder="搜索工号或姓名..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:border-brand-gold outline-none transition-all placeholder:text-gray-400 shadow-sm"
                         />
                         {searchTerm && (
                            <button 
                               onClick={() => setSearchTerm('')}
                               className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500"
                            >
                               <X size={14} />
                            </button>
                         )}
                      </div>

                      {data?.currentUser?.role === 'admin' && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                         <select 
                           value={targetDeptId}
                           onChange={(e) => setTargetDeptId(e.target.value)}
                           className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm outline-none w-full sm:w-auto"
                         >
                           <option value="">批量选择部门...</option>
                           <option value="null">清除部门归属</option>
                           {data?.departments?.map((dept: any) => (
                             <option key={dept.id} value={dept.id}>{dept.dept_name}</option>
                           ))}
                         </select>
                         <button
                           onClick={handleBatchUpdateDept}
                           disabled={isBatchUpdating || selectedUserIds.length === 0 || !targetDeptId}
                           className="px-4 py-2 bg-stone-900 text-white rounded-lg font-bold text-sm whitespace-nowrap hover:bg-stone-800 disabled:opacity-50 transition-colors"
                         >
                           {isBatchUpdating ? '更新中...' : `保存修改 (${selectedUserIds.length})`}
                         </button>
                      </div>
                      )}
                   </div>
                </div>
                <div className="overflow-auto flex-1 subtle-scrollbar">
                   {/* PC 端表格 */}
                   <div className="hidden md:block">
                     <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                           <tr className="bg-white text-stone-500 text-sm border-b border-stone-100">
                              <th className="p-4 w-12 bg-white">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded border-stone-300 pointer-events-auto"
                                  checked={selectedUserIds.length > 0 && selectedUserIds.length === filteredUsers.length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedUserIds(filteredUsers.map((u: any) => u.id));
                                    } else {
                                      setSelectedUserIds([]);
                                    }
                                  }}
                                />
                              </th>
                              <th className="p-4 font-bold">工号</th>
                              <th className="p-4 font-bold">部门</th>
                              <th className="p-4 font-bold">权限角色</th>
                              <th className="p-4 font-bold">可用额度 (W)</th>
                              <th className="p-4 font-bold text-orange-500">消耗 (W)</th>
                              <th className="p-4 font-bold">操作</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredUsers.length === 0 ? (
                             <tr>
                               <td colSpan={7} className="p-12 text-center text-stone-400">
                                 <div className="flex flex-col items-center gap-2">
                                   <Search size={40} className="text-stone-200" />
                                   <p>未找到匹配的员工</p>
                                 </div>
                               </td>
                             </tr>
                           ) : (
                             filteredUsers.map((u: any) => (
                                <tr key={u.id} className={`border-b border-stone-50 transition-colors ${selectedUserIds.includes(u.id) ? 'bg-stone-50/80' : 'hover:bg-stone-50'}`}>
                                 <td className="p-4">
                                   <input 
                                     type="checkbox" 
                                     className="w-4 h-4 rounded border-stone-300"
                                     checked={selectedUserIds.includes(u.id)}
                                     onChange={() => handleSelectUser(u.id)}
                                   />
                                 </td>
                                 <td className="p-4">
                                   <div className="font-mono font-medium text-stone-800">{u.employee_id}</div>
                                   <div className="text-xs text-stone-500">{u.username || '-'}</div>
                                 </td>
                                 <td className="p-4 flex flex-col items-start gap-2">
                                   <select
                                     value={u.dept_id || ''}
                                     onChange={(e) => handleUpdateSingleDept(u.id, e.target.value === 'null' ? null : e.target.value)}
                                     disabled={data?.currentUser?.role === 'dept_admin'}
                                     className="text-xs px-2 py-1 bg-stone-100 border border-stone-200 rounded-md outline-none focus:border-stone-400 w-full disabled:opacity-50 disabled:appearance-none"
                                   >
                                     <option value="">未分配</option>
                                     <option value="null">清除归属</option>
                                     {data?.departments?.map((dept: any) => (
                                       <option key={dept.id} value={dept.id}>{dept.dept_name}</option>
                                     ))}
                                   </select>
                                   {u.dept_id && <ApiStatusChecker userUuid={u.id} />}
                                 </td>
                                 <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : u.role === 'dept_admin' ? 'bg-purple-100 text-purple-700' : 'bg-stone-100 text-stone-600'}`}>
                                       {u.role === 'admin' ? '系统管理员' : u.role === 'dept_admin' ? '部门管理员' : '普通用户'}
                                    </span>
                                 </td>
                                 <td className="p-4 font-mono text-emerald-600 font-bold">{(u.quota_limit / 10000).toFixed(2)}</td>
                                 <td className="p-4 font-mono text-orange-600 font-bold">{((u.quota_used || 0) / 10000).toFixed(2)}</td>
                                 <td className="p-4 text-stone-500 text-sm">
                                   <div className="flex items-center gap-3">
                                     <button 
                                         onClick={() => setSelectedUser(u)}
                                         className="w-7 h-7 flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-full transition-colors"
                                         title="额度调整"
                                     >
                                         <PlusCircle size={14} />
                                     </button>
                                     <button 
                                         onClick={() => setSelectedUserForReset(u)}
                                         className="w-7 h-7 flex items-center justify-center bg-stone-100 text-stone-600 hover:bg-stone-200 rounded-full transition-colors"
                                         title="重置密码"
                                     >
                                         <Lock size={14} />
                                     </button>
                                     <button 
                                         onClick={() => setSelectedUserForDelete(u)}
                                         className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-full transition-colors"
                                         title="删除账号"
                                     >
                                         <Trash2 size={14} />
                                     </button>
                                   </div>
                                 </td>
                              </tr>
                             )))}
                        </tbody>
                     </table>
                   </div>
                   
                   {/* 手机端卡片列表 */}
                   <div className="md:hidden space-y-3 p-4">
                     {filteredUsers.length === 0 ? (
                       <div className="flex flex-col items-center gap-2 p-8 text-stone-400 bg-stone-50 rounded-2xl border border-stone-100">
                         <Search size={40} className="text-stone-200" />
                         <p>未找到匹配的员工</p>
                       </div>
                     ) : (
                       filteredUsers.map((u: any) => (
                         <div key={u.id} className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm space-y-3 relative">
                           <div className="flex justify-between items-center">
                             <div className="flex items-center gap-2">
                               <input 
                                 type="checkbox" 
                                 className="rounded border-stone-300 text-stone-900 focus:ring-stone-900 w-4 h-4"
                                 checked={selectedUserIds.includes(u.id)}
                                 onChange={() => handleSelectUser(u.id)}
                               />
                               <span className="font-bold text-stone-800 text-sm max-w-[120px] truncate">{u.username || '-'}</span>
                               <span className="text-xs text-stone-400 font-mono">{u.employee_id}</span>
                             </div>
                             <span className={`text-[10px] px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : u.role === 'dept_admin' ? 'bg-purple-100 text-purple-700' : 'bg-stone-100 text-stone-600'}`}>
                               {u.role === 'admin' ? '系统管理员' : u.role === 'dept_admin' ? '部门管理员' : '普通用户'}
                             </span>
                           </div>
                           
                           <div className="flex justify-between items-center text-xs text-stone-500">
                             <div className="flex items-center gap-2">
                               <span>部门:</span>
                               <select
                                 value={u.dept_id || ''}
                                 onChange={(e) => handleUpdateSingleDept(u.id, e.target.value === 'null' ? null : e.target.value)}
                                 disabled={data?.currentUser?.role === 'dept_admin'}
                                 className="text-stone-700 font-medium bg-transparent border-b border-dashed border-stone-300 outline-none pb-0.5 disabled:opacity-50 disabled:appearance-none cursor-pointer hover:border-stone-500 transition-colors"
                               >
                                 <option value="">未分配</option>
                                 <option value="null">清除归属</option>
                                 {data?.departments?.map((dept: any) => (
                                   <option key={dept.id} value={dept.id}>{dept.dept_name}</option>
                                 ))}
                               </select>
                             </div>
                             <div className="flex items-center gap-1.5">
                               连通性: {u.dept_id ? <ApiStatusChecker userUuid={u.id} /> : <span className="text-stone-300">-</span>}
                             </div>
                           </div>

                           <div className="pt-3 border-t border-stone-100 flex justify-between items-center">
                             <div className="text-[10px] text-stone-500 flex items-center gap-1.5">
                                可用: <span className="text-emerald-600 font-bold font-mono">{(u.quota_limit / 10000).toFixed(2)} W</span> 
                                <span className="text-stone-300">|</span> 
                                消耗: <span className="font-mono">{((u.quota_used || 0) / 10000).toFixed(2)} W</span>
                             </div>
                             <div className="flex gap-2">
                               <button 
                                 onClick={() => setSelectedUser(u)}
                                 className="px-3 py-1.5 bg-stone-900 text-white text-[10px] rounded hover:bg-stone-800 transition-colors shadow-sm"
                               >
                                 充值
                               </button>
                               <button 
                                 onClick={() => handleToggleUserStatus(u.id, u.is_active)}
                                 className={`px-3 py-1.5 text-[10px] rounded transition-colors shadow-sm ${u.is_active ? 'bg-white border text-stone-600 hover:bg-red-50 hover:text-red-600 border-stone-200' : 'bg-red-50 border-red-200 text-red-600 hover:bg-emerald-50 hover:text-emerald-600 border'}`}
                                 title={u.is_active ? "封禁用户" : "解封用户"}
                               >
                                 {u.is_active ? '🔒' : '🔓'}
                               </button>
                             </div>
                           </div>
                         </div>
                       )))}
                   </div>
                </div>
             </div>
          </div>
        </div>

      </div>
      
      {selectedUser && (
        <AdjustQuotaModal 
          user={selectedUser} 
          onClose={() => setSelectedUser(null)} 
          onUpdate={forceUpdate} 
          systemBalance={data?.systemBalance || 0}
        />
      )}
      {selectedUserForReset && (
        <ResetPasswordModal 
          user={selectedUserForReset} 
          onClose={() => setSelectedUserForReset(null)} 
        />
      )}
      {selectedUserForDelete && (
        <DeleteUserModal 
          user={selectedUserForDelete} 
          onClose={() => setSelectedUserForDelete(null)}
          onUpdate={forceUpdate}
        />
      )}
    </motion.div>
    </>
  );
}
