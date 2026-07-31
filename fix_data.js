import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xuvbnsxjvxqoywzlkxdf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fix() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, username, employee_id, quota_used, dept_id');
  if (error) { console.error(error); return; }

  let totalFixes = 0;
  for (const p of profiles) {
    if (p.quota_used > 0) {
      console.log(`User ${p.employee_id} (${p.username}) has quota_used: ${p.quota_used}`);
      // Find actual usage in usage_logs
      const { data: logs } = await supabase.from('usage_logs').select('tokens_used').eq('user_id', p.id);
      const actualTokens = logs?.reduce((acc, l) => acc + (l.tokens_used || 0), 0) || 0;
      console.log(`  Actual tokens in usage_logs: ${actualTokens}`);

      if (actualTokens < p.quota_used) {
        // Missing logs!
        const missingTokens = p.quota_used - actualTokens;
        const missingUsd = missingTokens / 1000000;
        console.log(`  Missing tokens: ${missingTokens} ($${missingUsd})`);
        
        // Insert a dummy log to balance
        const { error: insErr } = await supabase.from('usage_logs').insert([{
           user_id: p.id,
           model: 'manual_sync_correction',
           tokens_used: missingTokens,
           cost_usd: missingUsd,
           created_at: new Date().toISOString()
        }]);
        if (insErr) {
           console.error("  Failed to insert:", insErr);
        } else {
           console.log("  Successfully inserted sync log.");
           totalFixes++;
        }
      }
    }
  }
  console.log("Total fixes applied:", totalFixes);
}
fix();
