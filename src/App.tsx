import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase, initRuntimeSupabase } from './lib/supabase';
import LoginPage from './pages/Login';
import Layout from './components/Layout';

const ManwahStudio = lazy(() => import('./pages/ManwahStudio'));
const CreativeCanvasPage = lazy(() => import('./pages/creative-canvas/CreativeCanvasPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const DepartmentBilling = lazy(() => import('./pages/DepartmentBilling'));
const Profile = lazy(() => import('./pages/Profile'));

// 认证保护组件
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let subscription: any = null;

    initRuntimeSupabase().then((client) => {
      if (client.isFailClosed) {
        setConfigError("正式环境数据库配置不可用，请联系管理员");
        setLoading(false);
        return;
      }

      client.auth.getSession().then(({ data, error }: any) => {
        if (error) {
          console.warn("Auth session error:", error.message);
          client.auth.signOut().catch(() => {});
          setSession(null);
        } else {
          setSession(data?.session || null);
        }
        setLoading(false);
      }).catch((err: any) => {
        console.warn("Failed to get session:", err);
        client.auth.signOut().catch(() => {});
        setSession(null);
        setLoading(false);
      });

      const res = client.auth.onAuthStateChange((_event: any, session: any) => {
        setSession(session);
      });
      subscription = res?.data?.subscription;
    }).catch(err => {
      console.error("Supabase init error:", err);
      setConfigError("正式环境数据库配置不可用，请联系管理员");
      setLoading(false);
    });

    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-800 mx-auto mb-4"></div>
          <p className="text-stone-600 font-bold text-sm">正在连接数据服务...</p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-md max-w-md text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">!</div>
          <h2 className="text-lg font-bold text-stone-800">数据库配置不可用</h2>
          <p className="text-stone-600 text-sm">{configError}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// loading fallback
const SuspenseFallback = () => <div className="min-h-screen flex items-center justify-center p-4">Loading...</div>;

function ProtectedApp() {
  const location = useLocation();
  const isManwah = location.pathname.startsWith('/manwah');
  const isCreativeCanvas = location.pathname.startsWith('/creative-canvas');
  
  if (isCreativeCanvas) {
    return (
      <Suspense fallback={<SuspenseFallback />}>
        <Routes>
          <Route path="/creative-canvas/new" element={<CreativeCanvasPage />} />
          <Route path="/creative-canvas/:workspaceId" element={<CreativeCanvasPage />} />
          <Route path="*" element={<Navigate to="/creative-canvas/new" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Layout>
      <div style={{ display: isManwah ? 'block' : 'none', height: '100%', width: '100%' }}>
        <Suspense fallback={<SuspenseFallback />}>
          <ManwahStudio />
        </Suspense>
      </div>
      <Suspense fallback={<SuspenseFallback />}>
        <Routes>
          <Route path="/manwah" element={null} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/billing" element={<DepartmentBilling />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/" element={<Navigate to="/manwah" replace />} />
          <Route path="*" element={<Navigate to="/manwah" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="*" 
          element={
            <RequireAuth>
              <ProtectedApp />
            </RequireAuth>
          } 
        />
      </Routes>
    </Router>
  );
}
