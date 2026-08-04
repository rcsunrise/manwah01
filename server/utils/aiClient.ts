import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '../../src/lib/supabase';

const isKeyInvalid = (key: string | undefined) =>
  !key || key.includes('在这里填入') || key.includes('placeholder') || key.trim() === '';

export async function resolveApiConfig(userUuid: string = 'system') {
  let apiKey = process.env.ROUTERHUB_API_KEY;
  let baseUrl = "https://api.routerhub.ai/v1beta";
  let deptId = null;
  let provider = 'routerhub';

  if (userUuid !== 'system') {
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('dept_id')
        .eq('id', userUuid)
        .single();

      if (profile?.dept_id) {
        const { data: deptConfig } = await supabaseAdmin
          .from('department_configs')
          .select('api_key, api_base_url, routing_mode, method1_key')
          .eq('dept_id', profile.dept_id)
          .maybeSingle();

        if (deptConfig?.api_key && !isKeyInvalid(deptConfig.api_key)) {
          return {
            apiKey: deptConfig.api_key,
            baseUrl: deptConfig.api_base_url || baseUrl,
            deptId: profile.dept_id,
            provider: (deptConfig.api_base_url || "").includes("vectorengine") ? "vectorengine" : "routerhub",
            routingMode: deptConfig.routing_mode,
            method1Key: deptConfig.method1_key
          };
        }
      }
    } catch (e) {
      console.warn("Error fetching user dept config:", e);
    }
  }

  // Check global system department config
  try {
    const { data } = await supabaseAdmin
      .from('department_configs')
      .select('api_base_url, api_key, routing_mode, method1_key')
      .eq('dept_name', '全站系统')
      .maybeSingle();

    if (data?.api_key && !isKeyInvalid(data.api_key)) {
      return {
        apiKey: data.api_key,
        baseUrl: data.api_base_url || baseUrl,
        deptId: null,
        provider: (data.api_base_url || "").includes("vectorengine") ? "vectorengine" : "routerhub",
        routingMode: data.routing_mode,
        method1Key: data.method1_key
      };
    }
  } catch (e) {
    console.warn("Error fetching global dept config:", e);
  }

  // Fallback to GEMINI_API_KEY
  if (isKeyInvalid(apiKey) && !isKeyInvalid(process.env.GEMINI_API_KEY)) {
    return {
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      deptId: null,
      provider: 'google'
    };
  }

  return { apiKey, baseUrl, deptId, provider };
}

export async function createServerGenAI(userUuid: string = 'system') {
  const config = await resolveApiConfig(userUuid);
  if (isKeyInvalid(config.apiKey)) {
    return { ai: null, config, isValidKey: false };
  }

  let baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  if (!baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }

  const headers: Record<string, string> = {};
  if (config.provider === 'routerhub' || config.provider === 'vectorengine') {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  } else {
    headers['x-goog-api-key'] = config.apiKey!;
  }

  const customFetch = (url: string | URL | Request, init?: RequestInit) => {
    let targetUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    try {
      const u = new URL(targetUrl);
      if (config.provider === 'routerhub' || config.provider === 'vectorengine') {
        u.searchParams.delete('key');
      }
      return fetch(u.toString(), init);
    } catch (e) {
      return fetch(targetUrl, init);
    }
  };

  const ai = new GoogleGenAI({
    apiKey: config.apiKey || 'proxy-key',
    fetch: customFetch as any,
    httpOptions: {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      headers,
      timeout: 120000
    }
  } as any);

  return { ai, config, isValidKey: true };
}
