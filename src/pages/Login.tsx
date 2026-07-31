import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Lock, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';

export default function LoginPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 强制清理任何残留的缓存
  useEffect(() => {
    const clearStaleData = async () => {
      queryClient.clear();
    };
    clearStaleData();
  }, [queryClient]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    // 自动拼接为后台识别的虚拟邮箱
    const email = `${employeeId}@manwah.com`;
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // 简单映射一些常见的错误
        if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('工号或密码错误，请重试');
        } else if (error.message === 'Failed to fetch') {
          setErrorMsg('网络连接异常或服务器正在重启，请刷新页面重新登录');
        } else {
          setErrorMsg('登录失败: ' + error.message);
        }
        setLoading(false);
      } else {
        // 登录成功跳转，强制刷新保障全局状态干净
        window.location.href = '/manwah';
      }
    } catch (err: any) {
      setErrorMsg('系统错误: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full min-h-screen md:min-h-0 md:max-w-md md:rounded-3xl shadow-xl overflow-hidden flex flex-col md:block bg-white"
      >
        <div className="bg-stone-900 px-8 py-16 md:py-8 text-center flex-shrink-0 flex items-center justify-center flex-col">
          <h1 className="text-4xl md:text-3xl font-black text-brand-gold tracking-widest">MANWAH</h1>
          <p className="text-brand-gold/70 mt-3 md:mt-2 text-sm">AGI 创新工作室内部系统</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 space-y-8 md:space-y-6 flex-grow flex flex-col justify-center md:justify-start bg-white">
          {errorMsg && (
            <div className="bg-red-50 text-red-500 p-3 rounded-xl text-sm border border-red-100 font-medium">
              {errorMsg}
            </div>
          )}
          
          <div className="space-y-5 md:space-y-4">
            <div>
              <label className="block text-sm font-bold text-stone-700 mb-2">员工工号</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-stone-400" />
                </div>
                <input 
                  type="text"
                  placeholder="请输入员工工号" 
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-stone-50 border border-stone-200 rounded-none md:rounded-xl focus:border-stone-900 focus:ring-1 focus:ring-stone-900 outline-none transition-all placeholder:text-stone-400"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-stone-700 mb-2">密码</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-stone-400" />
                </div>
                <input 
                  type="password" 
                  placeholder="请输入您的密码" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-stone-50 border border-stone-200 rounded-none md:rounded-xl focus:border-stone-900 focus:ring-1 focus:ring-stone-900 outline-none transition-all placeholder:text-stone-400"
                  required
                />
              </div>
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 mt-8 md:mt-0 bg-stone-900 hover:bg-stone-800 text-brand-gold md:text-white rounded-none md:rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                确认登录
                <LogIn className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
