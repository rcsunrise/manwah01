import { supabase } from '../lib/supabase';
import { PromptTemplate } from '../types';

export async function fetchSystemPrompts(): Promise<PromptTemplate[]> {
  try {
    // 按 ID 排序 (p0, p1, p2... 依次保障顺序)
    const { data, error } = await supabase
      .from('system_prompts')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error("加载系统提示词库失败:", error.message);
      return []; 
    }

    if (data && data.length > 0) {
      return data as PromptTemplate[];
    }
    
    return [];
  } catch (err) {
    console.error("请求系统提示词时发生异常:", err);
    return [];
  }
}
