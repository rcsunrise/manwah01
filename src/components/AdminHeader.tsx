import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, LayoutDashboard, Database } from 'lucide-react';

interface AdminInfo {
  role: string;
  deptName: string;
}

export default function AdminHeader() {
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getAdminDept() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        
        if (user) {
          // Linking profiles with department_configs
          const { data, error } = await supabase
            .from('profiles')
            .select(`
              role,
              department_configs ( dept_name )
            `)
            .eq('id', user.id)
            .single();

          if (data && !error) {
            const rawRole = (data.role || '').toLowerCase().trim();
            const deptData = (data as any).department_configs;
            
            // 兼容数组或对象结构
            let extractedDeptName = '';
            if (Array.isArray(deptData) && deptData.length > 0) {
              extractedDeptName = deptData[0]?.dept_name;
            } else if (deptData && typeof deptData === 'object') {
              extractedDeptName = (deptData as any).dept_name;
            }

            setAdminInfo({
              role: data.role,
              deptName: (rawRole === 'admin' || rawRole === 'super_admin') 
                ? '全站系统' 
                : (extractedDeptName?.trim() || '部门中心')
            });
          } else {
            console.warn('No profile data found or error:', error);
          }
        }
      } catch (err) {
        console.error('Error fetching admin header info:', err);
      } finally {
        setLoading(false);
      }
    }
    getAdminDept();
  }, []);

  if (loading) return null;

  return (
    <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-stone-900 text-white px-6 py-4 shadow-2xl border-b border-white/10 relative overflow-hidden min-h-[88px]">
      {/* Abstract background decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/10 rounded-full -ml-24 -mb-24 blur-2xl"></div>
      
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
        <div className="flex items-center space-x-5">
          <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-inner">
            <Shield className={`w-8 h-8 ${adminInfo ? 'text-yellow-400' : 'text-stone-500'}`} />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-xl font-black tracking-tight flex items-center gap-3">
              欢迎回来，
              <span className="text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                {adminInfo?.deptName || "访客"}
              </span>
              管理员
            </h2>
            <div className="flex items-center gap-3 text-sm text-blue-100/80">
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-white/10 rounded-md border border-white/10">
                <LayoutDashboard className="w-3.5 h-3.5" />
                控制面板
              </span>
              <span className="w-1 h-1 bg-white/30 rounded-full"></span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)] ${adminInfo ? 'bg-green-400' : 'bg-red-400'}`}></span>
                {adminInfo ? '系统运行正常' : '服务器连接异常'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center gap-3 px-4 py-2.5 bg-stone-900/40 backdrop-blur-md rounded-2xl border border-white/10 text-sm font-bold shadow-lg">
               <Database className="w-4 h-4 text-blue-400" />
               <span className="text-stone-300">权限等级：</span>
               <span className={`
                 ${adminInfo?.role === 'admin' ? 'text-red-400' : 'text-blue-400'}
               `}>
                 {adminInfo ? (adminInfo.role === 'admin' ? '全域最高权限' : '部门受限权限') : '未知角色'}
               </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
