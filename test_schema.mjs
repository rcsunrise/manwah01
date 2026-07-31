import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('usage_logs').select('*').limit(1);
  console.log("Error:", error);
  if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
  } else {
    console.log("No rows found. Attempting to insert a dummy row to get schema error or success.");
    const res = await supabase.from('usage_logs').insert([{
      user_id: "6bf053fd-11bd-432c-b0a1-cabac37a0da9",
      model: "test",
      tokens_used: 1,
      cost_usd: 1
    }]).select();
    console.log("Insert response:", res);
  }
}

run();
