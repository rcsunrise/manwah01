import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xuvbnsxjvxqoywzlkxdf.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log("Fetching incorrectly billed 3pro records...");
  
  // Get all usage logs that contain pro image preview and were incorrectly billed
  const { data: logs, error: fetchErr } = await supabase
    .from('usage_logs')
    .select('*, profiles(username, dept_id)')
    .ilike('model', '%pro%image-preview%');
    
  if (fetchErr) {
    console.error("Error fetching:", fetchErr);
    return;
  }

  // Find those that were explicitly billed at 550 or other incorrect values.
  const recordsToFix = logs.filter(r => {
    return r.tokens_used === 550 || r.tokens_used === 500;
  });

  console.log(`Found ${recordsToFix.length} records that need correction.`);

  const userDeltas = {}; // user_id -> delta points
  const deptDeltas = {}; // dept_id -> delta points

  // First we calculate the intended fixes
  for (const record of recordsToFix) {
    const is4K = record.model.includes('4K') || record.model_res === '4K';
    const is2K = record.model.includes('2K') || record.model_res === '2K';
    const is1K = record.model.includes('1K') || record.model_res === '1K';
    
    let targetPoints = 5000; // default for 4K
    if (is1K) targetPoints = 1250;
    else if (is2K) targetPoints = 2500;
    else if (is4K) targetPoints = 5000;
    else {
      // By default if no res indicated, and it's a generation, we fall back to what?
      // Our logic says 5000 is 4K endpoint which is the default for Pro if not matched
      targetPoints = 5000; 
    }

    const diff = targetPoints - record.tokens_used;
    
    if (diff > 0) {
      if (!userDeltas[record.user_id]) userDeltas[record.user_id] = 0;
      userDeltas[record.user_id] += diff;

      // Assign to department
      const deptId = record.dept_id || (record.profiles && record.profiles.dept_id) || 'Unassigned';
      if (!deptDeltas[deptId]) deptDeltas[deptId] = 0;
      deptDeltas[deptId] += diff;

      // UPDATE THE ROW
      const cost_usd = targetPoints / 10000;
      await supabase.from('usage_logs')
        .update({ tokens_used: targetPoints, cost_usd: cost_usd })
        .eq('id', record.id);
    }
  }

  // Update profiles
  console.log("Updating user profiles...");
  for (const [userId, diffPoints] of Object.entries(userDeltas)) {
    const { data: profile } = await supabase.from('profiles').select('quota_used').eq('id', userId).single();
    if (profile) {
      await supabase.from('profiles')
        .update({ quota_used: profile.quota_used + diffPoints })
        .eq('id', userId);
    }
  }

  // Prepare a string report
  let report = "【修复与统计报告：Gemini 3 Pro 账单修正】\n";
  report += `共修正错算记录: ${recordsToFix.length} 条\n\n`;
  report += "--- 部门差额补扣统计 ---\n";
  for (const [deptId, diff] of Object.entries(deptDeltas)) {
    // try to fetch dept name if it's a uuid
    let deptName = deptId;
    if (deptId !== 'Unassigned') {
      const { data: deptInfo } = await supabase.from('departments').select('name').eq('id', deptId).maybeSingle();
      if (deptInfo && deptInfo.name) deptName = deptInfo.name;
    }
    const cost = (diff / 10000).toFixed(3);
    report += `部门: ${deptName} | 补扣点数: +${diff} 点 | 折合修正: $${cost}\n`;
  }
  report += "------------------------\n";
  console.log("\n" + report);
}

run();
