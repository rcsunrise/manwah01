import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity } from 'lucide-react';

export const ApiStatusChecker = ({ userUuid }: { userUuid: string }) => {
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [message, setMessage] = useState('');

  const checkConnection = async () => {
    setTesting(true);
    setMessage('');
    
    try {
      const { data: authData } = await supabase.auth.getSession();
      const session = authData?.session;
      const response = await fetch('/api/ai/test-connection', {
        headers: { 
           'x-user-uuid': userUuid,
           'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      const data = await response.json();

      if (data.status === 'success') {
        setStatus('success');
        setMessage(`已接通 (${data.deptName})`);
      } else {
        setStatus('failed');
        setMessage(data.message || '连接失败');
      }
    } catch (err) {
      setStatus('failed');
      setMessage("网络异常");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button 
        onClick={checkConnection}
        disabled={testing}
        className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${
          status === 'success' 
            ? 'bg-emerald-100 text-emerald-700' 
            : status === 'failed' 
              ? 'bg-red-100 text-red-700' 
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }`}
        title={message || '检测当前部门 Key 是否可用'}
      >
        <Activity size={12} className={testing ? 'animate-pulse' : ''} />
        {testing ? '检测中...' : status === 'success' ? '正常' : status === 'failed' ? '失败' : 'API连通性'}
      </button>
      {message && status === 'failed' && (
        <span className="text-[10px] text-red-500 max-w-[100px] truncate" title={message}>{message}</span>
      )}
    </div>
  );
};
