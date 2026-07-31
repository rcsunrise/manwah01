import { supabaseAdmin } from './src/lib/supabase.js';

async function test() {
  console.log("Testing Supabase Admin connection...");
  try {
    const { data, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      console.error("Error listing buckets:", error);
    } else {
      console.log("Buckets:", data);
    }
    
    const { data: tableData, error: tableError } = await supabaseAdmin.from('pre_process_logs').select('count', { count: 'exact', head: true });
    if (tableError) {
      console.error("Error checking pre_process_logs table:", tableError);
    } else {
      console.log("pre_process_logs table exists.");
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
