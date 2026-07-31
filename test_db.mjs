import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./src/lib/SUPABASE_CONFIG.json', 'utf8'));
const supabase = createClient(config.url, config.anonKey);

async function test() {
  const { data, error } = await supabase.from('usage_logs').select('cost_usd, dept_id').limit(1);
  console.log('Error 1:', error);
  
  const { data: data2, error: error2 } = await supabase.from('usage_logs').select('cost_usd, profiles!inner(dept_id)').limit(1);
  console.log('Error 2:', error2);
}

test();
