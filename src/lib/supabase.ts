import { createClient } from '@supabase/supabase-js';

const safeProcessEnv = typeof process !== 'undefined' ? process.env : {} as Record<string, string | undefined>;

const isPlaceholder = (val: string | undefined) => !val || val.includes('在这里填入') || val.includes('placeholder');

// Vite 必须使用 import.meta.env 才能在浏览器端读取变量
const supabaseUrl = 
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || 
  safeProcessEnv.VITE_SUPABASE_URL || 
  safeProcessEnv.SUPABASE_URL || 
  '';

const supabaseAnonKey = 
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || 
  safeProcessEnv.VITE_SUPABASE_ANON_KEY || 
  safeProcessEnv.SUPABASE_ANON_KEY || 
  '';

const supabaseServiceKey = safeProcessEnv.SUPABASE_SERVICE_ROLE_KEY || safeProcessEnv.SUPABASE_SERVICE_KEY || '';

if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)) {
  console.warn("⚠️ Supabase 环境变量可能未配置或仍为占位符！当前 URL:", supabaseUrl);
}

// 拥有最高权限的 Admin 客户端（用于创建用户、修改配置等管理操作，仅在 Node.js 即服务端使用）
export const supabaseAdmin = typeof window === 'undefined' ? createClient(
  isPlaceholder(supabaseUrl) ? 'https://placeholder.supabase.co' : supabaseUrl, 
  isPlaceholder(supabaseServiceKey) ? 'placeholder-key' : supabaseServiceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
) : null as any;

// 客户端普通版（用于前端或常规的 Token 扣减逻辑，遵循 RLS 权限）
const _global = typeof window !== 'undefined' ? window : globalThis;
// @ts-ignore
if (!_global.__SUPABASE_CLIENT__) {
  // @ts-ignore
  _global.__SUPABASE_CLIENT__ = createClient(
    isPlaceholder(supabaseUrl) ? 'https://placeholder.supabase.co' : supabaseUrl, 
    isPlaceholder(supabaseAnonKey) ? 'placeholder-key' : supabaseAnonKey
  );
}
// @ts-ignore
export const supabase = _global.__SUPABASE_CLIENT__;
