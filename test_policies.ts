import { supabaseAdmin } from './src/lib/supabase';
async function test() {
  const { data: q1, error: e1 } = await supabaseAdmin.from('profiles').select('*').limit(1);
  console.log("Admin Query profiles:", e1 ? e1.message : "Success");
}
test();
