// dotenv not used
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)?.[1] || '';
const SUPABASE_KEY = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1] || envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1] || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const logData = {
    user_id: "6bf053fd-11bd-432c-b0a1-cabac37a0da9",
    model: "test_model",
    tokens_used: 1,
    cost_usd: 1,
    created_at: new Date().toISOString()
  };

  console.log("Inserting:", logData);
  const { error } = await supabase.from('usage_logs').insert([logData]);
  console.log("Insert Error:", error);
}

test();
