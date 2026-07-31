import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

function getImagePoints(modelKey: string, res: string): number {
  if (modelKey.includes('3.0') || modelKey.includes('3-pro') || modelKey.includes('旗舰')) {
    if (res === '1K') return 1250;
    if (res === '2K') return 2500;
    return 5000;
  }
  return 550;
}

async function fix() {
  const { data: logs, error } = await supabase
    .from('usage_logs')
    .select('*')
    .ilike('model', '%3-pro%');
    
  if (error) {
    console.error("Error fetching logs", error);
    return;
  }
  
  if (!logs || logs.length === 0) {
    console.log("No logs found");
    return;
  }

  const userDiffs = new Map<string, number>();
  
  let fixedCount = 0;

  for (const log of logs) {
    let res = log.model_res;
    if (!res) {
      if (log.model.includes('4K')) res = '4K';
      else if (log.model.includes('2K')) res = '2K';
      else if (log.model.includes('1K')) res = '1K';
      else res = '1K'; // default? Wait, if no resolution, but it's image preview, default to 1K? Or maybe default to 4K? 
      // Image points function sets resolution to '1K' if missing.
    }
    
    // Wait, the image points function in server:
    // const res = resolution || '1K';
    // Let's use the same.
    const modelKey = log.model.toLowerCase();
    const correctTokens = getImagePoints(modelKey, res || '1K');
    
    if (log.tokens_used !== correctTokens) {
      const diff = correctTokens - log.tokens_used;
      const cost_usd = correctTokens / 10000;
      
      console.log(`Fixing log ${log.id}: ${log.model} - ${log.tokens_used} -> ${correctTokens}`);
      
      const { error: updateError } = await supabase
        .from('usage_logs')
        .update({
          tokens_used: correctTokens,
          cost_usd: cost_usd
        })
        .eq('id', log.id);
        
      if (updateError) {
        console.error(`Failed to update log ${log.id}`, updateError);
        continue;
      }
      
      userDiffs.set(log.user_id, (userDiffs.get(log.user_id) || 0) + diff);
      fixedCount++;
    }
  }
  
  console.log(`Fixed ${fixedCount} usage logs.`);
  
  console.log("Updating user profiles...");
  let usersFixedCount = 0;
  for (const [userId, diff] of Array.from(userDiffs.entries())) {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('points_balance, total_points_used')
      .eq('id', userId)
      .single();
      
    if (profileErr || !profile) {
      console.error(`Error fetching profile for ${userId}`, profileErr);
      continue;
    }
    
    const newBalance = (profile.points_balance || 0) - diff;
    const newUsed = (profile.total_points_used || 0) + diff;
    
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        points_balance: newBalance,
        total_points_used: newUsed
      })
      .eq('id', userId);
      
    if (updateErr) {
      console.error(`Failed to update profile for ${userId}`, updateErr);
    } else {
      console.log(`Updated user ${userId}: balance ${profile.points_balance} -> ${newBalance}`);
      usersFixedCount++;
    }
  }
  
  console.log(`Updated ${usersFixedCount} users.`);
}

fix();
