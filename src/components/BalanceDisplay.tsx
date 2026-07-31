import React from 'react';

interface BalanceDisplayProps {
  quotaLimit: number;
  quotaUsed: number;
  variant?: 'modern' | 'default';
}

export const BalanceDisplay: React.FC<BalanceDisplayProps> = ({ quotaLimit, quotaUsed, variant }) => {
  const remainingTokens = Math.max(0, quotaLimit - (quotaUsed || 0));
  
  // 将单位转换为 "W" (万个 Token)
  const displayW = (remainingTokens / 10000).toLocaleString(undefined, { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  });
  
  // 将 Token 换回美元显示 (10,000 Points = 1 USD)
  const displayUSD = (remainingTokens / 10000).toLocaleString(undefined, { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const usagePercent = quotaLimit > 0 ? (quotaUsed / quotaLimit) * 100 : 0;

  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl p-6">
        <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-bold text-gray-500">部门可用额度</div>
            <div className="bg-black text-white text-[10px] px-2 py-0.5 rounded">ACTIVE</div>
        </div>
        <div className="text-4xl font-black text-gray-900 tracking-tighter mb-4">{displayUSD} <span className="text-sm text-gray-400">/ {displayW}W</span></div>
        
        <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-gray-500">使用进度</span>
            <span className="text-gray-800">{usagePercent.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 border border-gray-800 p-[1px]">
            <div 
              className="bg-[#6ED19F] h-full rounded-full border-r border-gray-800 transition-all duration-500" 
              style={{ width: `${Math.min(100, usagePercent)}%` }}
            ></div>
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-2">
            <span>总额度 {(quotaLimit / 10000).toFixed(0)}W</span>
            <span className="text-[#D37F46] font-bold">已消耗 {((quotaUsed || 0) / 10000).toFixed(2)}W</span>
        </div>
    </div>
  );
};
