import { supabaseAdmin } from './src/lib/supabase';
async function test() {
  const { data, error } = await supabaseAdmin.from('profiles').select('*').limit(1);
  console.log("Profiles test directly (admin):", error ? error.message : "Success");
}
test();
