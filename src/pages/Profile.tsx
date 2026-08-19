import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserCircle, Lock, Save, Loader2, ArrowLeft, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';

export const fetchProfile = async () => {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error('Not logged in');
  
  let profileData: any = null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    profileData = data;
  } catch (e) {
    // Suppress missing profile error
  }
  
  const defaultEmpId = user.email ? user.email.split('@')[0] : user.id;

  const mergedProfile = {
    id: user.id,
    employee_id: profileData?.employee_id || defaultEmpId,
    username: profileData?.username || profileData?.employee_id || defaultEmpId,
    nickname: profileData?.nickname || profileData?.username || defaultEmpId,
    role: profileData?.role || 'user',
    dept_id: profileData?.dept_id || 'dept-1',
    quota_limit: profileData?.quota_limit ?? 100000,
    quota_used: profileData?.quota_used ?? 0,
    ...profileData
  };

  return {
    user,
    profile: mergedProfile
  };
};

const SkeletonCard = ({ className = "" }: { className?: string }) => (
  <div className={`bg-stone-200 animate-pulse rounded-3xl ${className}`}></div>
);

export default function Profile() {
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchProfile,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  useEffect(() => {
    if (isError) {
      navigate('/login');
    }
  }, [isError, navigate]);
  
  useEffect(() => {
    if (data?.profile?.nickname) {
      setNickname(data.profile.nickname);
    }
  }, [data]);

  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('manwah_user');
    await supabase.auth.signOut();
    queryClient.clear();
    window.location.href = '/login';
  };

  const updateNickname = async () => {
    if (!data?.user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ nickname: nickname })
      .eq('id', data.user.id);

    setSaving(false);
    if (!error) {
      alert("昵称更新成功！");
      refetch();
    } else {
      alert("昵称更新失败: " + error.message);
    }
  };

  const updatePassword = async () => {
    if (!password) {
      alert("请输入新密码");
      return;
    }
    if (password !== passwordConfirm) {
      alert("两次输入的密码不一致");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      password: password
    });

    setSaving(false);
    if (error) {
      alert("密码修改失败: " + error.message);
    } else {
      alert("密码修改成功，请妥善保管新密码。");
      setPassword('');
      setPasswordConfirm('');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-stone-100 p-4 md:p-8 font-sans w-full h-full">
        <div className="max-w-3xl mx-auto space-y-6">
          <SkeletonCard className="h-24 w-full" />
          <SkeletonCard className="h-[600px] w-full" />
        </div>
      </div>
    );
  }

  const profile = data?.profile;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-stone-100 p-4 md:p-8 font-sans w-full h-full"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header (Refactored to match reference) */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 flex justify-between items-stretch gap-4">
            <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1">
                    <UserCircle className="w-6 h-6 text-stone-800" />
                    <h2 className="text-2xl font-black text-stone-900 leading-tight">个人<br/>中心</h2>
                </div>
                <p className="text-[10px] text-stone-500 mt-1 pl-1">管理您的账号<br/>设置</p>
            </div>
            
            <div className="flex border border-stone-100 rounded-xl overflow-hidden shadow-sm shrink-0">
                <button onClick={() => navigate('/manwah')} className="bg-stone-50 hover:bg-stone-100 px-3 py-2 flex flex-col items-center justify-center gap-1 transition-colors">
                    <ArrowLeft className="text-stone-600 w-5 h-5 leading-none" />
                    <span className="text-xs font-bold text-stone-800 text-center leading-tight">返回<br/>工作流</span>
                </button>
                <div className="w-px bg-stone-100"></div>
                <button onClick={handleLogout} className="bg-stone-50 hover:bg-red-50 px-3 py-2 flex flex-col items-center justify-center gap-1 transition-colors group">
                    <LogOut className="text-red-500 w-5 h-5 leading-none group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-red-600 text-center leading-tight">登出<br/>账号</span>
                </button>
            </div>
        </div>

        <div className="space-y-4">
          {/* Info */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-stone-100">
            <h3 className="font-bold text-stone-800 text-lg mb-4">账号信息</h3>
            
            <div className="grid grid-cols-2 gap-4 border-t border-stone-100 pt-4 mb-5">
              <div>
                <p className="text-xs text-stone-500 mb-1.5">工号 / 用户名</p>
                <p className="font-bold text-stone-800 text-[15px]">{profile?.username || profile?.employee_id || data?.user?.email?.split('@')[0] || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-1.5">权限角色</p>
                <p className="font-bold text-stone-800 text-[15px]">{profile?.role === 'admin' ? '管理员' : profile?.role === 'dept_admin' ? '部门管理员' : '普通用户'}</p>
              </div>
            </div>
            
            <div className="bg-blue-50 text-blue-800 rounded-xl p-4 text-xs leading-relaxed border border-blue-100 flex gap-3">
               <span className="text-blue-500 text-base mt-0.5 leading-none">ⓘ</span>
               <p className="text-blue-800/80">如果您的权限角色刚刚发生了变更，请您 <span className="font-bold text-blue-900">登出并重新登录</span> 后，最新权限（如后台管理菜单）方可生效。</p>
            </div>
          </div>

          {/* Nickname */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-stone-100">
            <h3 className="font-bold text-stone-800 text-lg mb-4 flex items-center gap-2">
              <UserCircle className="w-5 h-5" /> 修改昵称
            </h3>
            <div className="border-t border-stone-100 pt-5">
              <div className="flex gap-4">
                <input 
                  type="text" 
                  placeholder="请输入新昵称"
                  className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-brand-gold outline-none transition-all text-sm"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
                <button 
                  onClick={updateNickname}
                  disabled={saving}
                  className="px-6 py-3 bg-stone-100 text-stone-700 font-bold rounded-xl hover:bg-stone-200 transition-all flex items-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 保存昵称
                </button>
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-stone-100">
            <h3 className="font-bold text-stone-800 text-lg mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5" /> 修改密码
            </h3>
            <div className="border-t border-stone-100 pt-5 space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-stone-700 mb-2">新密码</label>
                <input 
                  type="password" 
                  placeholder="请输入新密码"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-brand-gold outline-none transition-all text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[13px] font-bold text-stone-700 mb-2">确认新密码</label>
                <input 
                  type="password" 
                  placeholder="请再次输入新密码"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:border-brand-gold outline-none transition-all text-sm"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                />
              </div>
              <div className="pt-2">
                <button 
                  onClick={updatePassword}
                  disabled={saving || !password}
                  className="w-full py-3.5 bg-stone-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-colors hover:bg-stone-800"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 保存密码修改
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </motion.div>
  );
}
