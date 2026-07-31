import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import ManwahStudio from './pages/ManwahStudio';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminUsers from './pages/AdminUsers';
import DepartmentBilling from './pages/DepartmentBilling';
import Profile from './pages/Profile';
import Layout from './components/Layout';

// 认证保护组件
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">Loading...</div>;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function ProtectedApp() {
  const location = useLocation();
  const isManwah = location.pathname.startsWith('/manwah');
  
  return (
    <Layout>
      <div style={{ display: isManwah ? 'block' : 'none', height: '100%', width: '100%' }}>
        <ManwahStudio />
      </div>
      <Routes>
        <Route path="/manwah" element={null} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/billing" element={<DepartmentBilling />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/" element={<Navigate to="/manwah" replace />} />
        <Route path="*" element={<Navigate to="/manwah" replace />} />
      </Routes>
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
