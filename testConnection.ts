import { supabaseAdmin } from './src/lib/supabase';

async function testConnection() {
  const { data, error } = await supabaseAdmin.from('system_settings').select('*');
  if (error) {
    console.error('❌ 连接失败，请检查配置：', error.message);
  } else {
    console.log('✅ 连接成功！读取到的系统配置：', data);
  }
}

testConnection();
