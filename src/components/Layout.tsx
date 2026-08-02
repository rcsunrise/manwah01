import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MonitorPlay, Settings, LayoutDashboard, Users, UserCircle, Menu, ChevronRight, LayoutGrid } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (!error && data?.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).single()
          .then(({ data: profileData }) => {
            if (profileData?.role === 'admin' || profileData?.role === 'dept_admin') {
              setIsAdmin(true);
            }
          }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const settingsItems = [
    { id: 'dashboard', label: '控制台', icon: <LayoutDashboard size={18} />, path: '/dashboard' },
    ...(isAdmin ? [
      { id: 'users', label: '员工管理', icon: <Users size={18} />, path: '/admin/users' },
      { id: 'billing', label: '数据审计', icon: <LayoutDashboard size={18} />, path: '/admin/billing' }
    ] : []),
    { id: 'profile', label: '个人中心', icon: <UserCircle size={18} />, path: '/profile' }
  ];

  const getActiveTab = () => {
    if (location.pathname.startsWith('/manwah')) return 'manwah';
    if (location.pathname.startsWith('/creative-canvas')) return 'creative-canvas';
    if (location.pathname.startsWith('/dashboard')) return 'dashboard';
    if (location.pathname.startsWith('/admin/billing')) return 'billing';
    if (location.pathname.startsWith('/admin/users')) return 'users';
    if (location.pathname.startsWith('/admin')) return 'users';
    if (location.pathname.startsWith('/profile')) return 'profile';
    return 'manwah';
  };

  const activeTab = getActiveTab();
  const isSettingsActive = ['dashboard', 'users', 'profile'].includes(activeTab);

  return (
    <div className="min-h-screen bg-stone-100/50 flex flex-col md:flex-row font-sans">
      
      {/* ----------------- PC 端左侧栏 ----------------- */}
      {activeTab !== 'manwah' && (
        <aside className="hidden md:flex flex-col w-64 bg-white/80 backdrop-blur-xl border-r border-[#E5E0D8]/40 p-4 sticky top-0 h-screen overflow-y-auto shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="text-xl font-black text-brand-charcoal tracking-widest mb-8 px-2 mt-4 flex flex-col">
            MANWAH
            <span className="text-[10px] text-stone-400 font-bold uppercase mt-1 tracking-widest">国内商品企划中心</span>
          </div>
          
          <nav className="space-y-1 flex-1">
            <button 
              onClick={() => navigate('/manwah')} 
              className="w-full flex items-center justify-between p-3 rounded-2xl transition-all text-stone-500 hover:bg-stone-50 hover:text-stone-700"
            >
              <div className="flex items-center gap-3">
                <MonitorPlay size={18} strokeWidth={2.5} />
                <span className="text-sm">传统工作流</span>
              </div>
            </button>

            <button 
              onClick={() => navigate('/creative-canvas/new')} 
              className="w-full flex items-center justify-between p-3 rounded-2xl transition-all text-[#B28C5A] bg-[#F9F5EF] hover:bg-[#F5EFE6] font-bold shadow-sm"
            >
              <div className="flex items-center gap-3">
                <LayoutGrid size={18} strokeWidth={2.5} />
                <span className="text-sm">视觉企划画布</span>
              </div>
              <span className="text-[10px] bg-[#B28C5A] text-white font-bold px-1.5 py-0.5 rounded-full">NEW</span>
            </button>

            <div className="pt-6 pb-2 px-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#B28C5A]/60">设置 Settings</span>
            </div>

            <div className="space-y-1">
              {settingsItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => navigate(item.path)} 
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${
                    activeTab === item.id 
                      ? 'bg-[#F9F5EF] text-[#B28C5A] font-bold shadow-sm' 
                      : 'text-stone-500 hover:bg-[#FDFBF7] hover:text-[#B28C5A]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-sm">{item.label}</span>
                  </div>
                  {activeTab === item.id && <div className="w-1.5 h-1.5 rounded-full bg-[#B28C5A]" />}
                </button>
              ))}
            </div>
          </nav>
        </aside>
      )}

      {/* ----------------- 移动端顶部标题栏 ----------------- */}
      <header className="flex md:hidden items-center justify-between px-5 h-14 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 border-b border-[#E5E0D8]/40 sticky top-0 z-40 shrink-0">
        <div className="font-black tracking-widest text-lg text-brand-charcoal">MANWAH</div>
        {activeTab !== 'manwah' && (
           <div className="text-xs font-bold text-stone-400 capitalize">{activeTab}</div>
        )}
      </header>
      
      {/* 主内容区域 */}
      <main className="flex-1 w-full min-w-0 overflow-x-hidden md:h-screen md:overflow-y-auto pb-[5.5rem] md:pb-0 relative">
         <div className="fixed inset-0 pointer-events-none bg-gradient-to-br from-stone-50 via-[#FDFBF7] to-stone-100/50 -z-10" />
        {children}
      </main>

      {/* ----------------- 液态玻璃 设置弹窗 (Settings Sheet) ----------------- */}
      {showSettingsSheet && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm transition-opacity" onClick={() => setShowSettingsSheet(false)} />
          <div className="relative bg-white/90 backdrop-blur-2xl ring-1 ring-white/50 shadow-2xl w-full sm:w-[400px] rounded-t-3xl sm:rounded-3xl p-6 transform transition-transform animate-slide-up pb-10">
            <div className="w-12 h-1.5 bg-stone-200 rounded-full mx-auto mb-6 shrink-0" />
            <h3 className="text-sm font-bold text-brand-charcoal mb-4 px-2 tracking-widest">设置</h3>
            <div className="space-y-2">
              {settingsItems.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                     setShowSettingsSheet(false);
                     navigate(item.path);
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl transition-colors ${activeTab === item.id ? 'bg-[#F9F5EF] text-[#B28C5A]' : 'bg-stone-50/50 text-stone-600 active:bg-stone-100 hover:bg-stone-50'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl ${activeTab === item.id ? 'bg-white shadow-sm' : 'bg-white shadow-sm'}`}>
                      {item.icon}
                    </div>
                    <span className="font-bold text-sm tracking-wide">{item.label}</span>
                  </div>
                  <ChevronRight size={16} className="text-stone-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- 移动端 底部导航栏 (Liquid Glass Bottom Bar) ----------------- */}
      <div className="flex md:hidden fixed bottom-6 left-6 right-6 z-40 justify-center pointer-events-none">
        <nav className="flex items-center bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 p-1.5 rounded-[2rem] shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-[#E5E0D8]/50 pointer-events-auto">
           <button 
             onClick={() => { setShowSettingsSheet(false); navigate('/manwah'); }} 
             className={`flex flex-col items-center justify-center w-28 h-12 rounded-full transition-all ${
               activeTab === 'manwah' ? 'bg-[#B28C5A] text-white shadow-md' : 'text-stone-400 hover:text-stone-600'
             }`}
           >
             <div className="flex items-center gap-2">
                <MonitorPlay size={18} strokeWidth={activeTab === 'manwah' ? 2.5 : 2} />
                <span className="text-xs font-bold tracking-wide">工作流</span>
             </div>
           </button>

           <div className="w-[1px] h-6 bg-stone-200 mx-1" />

           <button 
             onClick={() => setShowSettingsSheet(true)} 
             className={`flex flex-col items-center justify-center w-28 h-12 rounded-full transition-all ${
               isSettingsActive ? 'bg-[#F9F5EF] text-[#B28C5A]' : 'text-stone-400 hover:text-stone-600'
             }`}
           >
             <div className="flex items-center gap-2">
                <Settings size={18} strokeWidth={isSettingsActive ? 2.5 : 2} />
                <span className="text-xs font-bold tracking-wide">设置</span>
             </div>
           </button>
        </nav>
      </div>
    </div>
  );
}
