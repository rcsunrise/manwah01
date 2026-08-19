import { supabaseAdmin } from '../../src/lib/supabase';

export type ProviderName = 'google' | 'routerhub' | 'vectorengine';

export interface ApiProviderConfig {
  apiKey?: string;
  baseUrl: string;
  deptId: string | null;
  provider: ProviderName;
  routingMode?: number | null;
  method1Key?: string | null;
  source: 'department' | 'global' | 'none';
}

export const isProviderKeyValid = (key: string | null | undefined): key is string =>
  Boolean(
    key &&
    !key.includes('在这里填入') &&
    !key.toLowerCase().includes('placeholder') &&
    !key.toLowerCase().startsWith('dummy') &&
    key.trim() !== ''
  );

export function detectProvider(baseUrl: string | null | undefined): ProviderName {
  const normalized = (baseUrl || '').toLowerCase();
  if (normalized.includes('vectorengine')) return 'vectorengine';
  if (normalized.includes('generativelanguage.googleapis.com')) return 'google';
  return 'routerhub';
}

function normalizeConfig(
  row: any,
  deptId: string | null,
  source: ApiProviderConfig['source']
): ApiProviderConfig | null {
  if (!row || !isProviderKeyValid(row.api_key)) return null;
  const configuredBaseUrl = String(row.api_base_url || '').trim();
  const provider = detectProvider(configuredBaseUrl);
  const baseUrl = configuredBaseUrl || (provider === 'routerhub' ? 'https://api.routerhub.ai/v1beta' : '');
  return {
    apiKey: row.api_key,
    baseUrl,
    deptId,
    provider,
    routingMode: row.routing_mode,
    method1Key: row.method1_key,
    source
  };
}

export async function getUserApiConfig(userId: string) {
  if (!userId || userId === 'system') return null;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      dept_id,
      department_configs ( api_key, api_base_url, dept_name, routing_mode, method1_key )
    `)
    .eq('id', userId)
    .single();

  if (error || !data?.department_configs) return null;
  const departmentConfigs = Array.isArray(data.department_configs)
    ? data.department_configs[0]
    : data.department_configs;
  return { ...data, department_configs: departmentConfigs };
}

async function getGlobalApiConfig(): Promise<ApiProviderConfig | null> {
  try {
    const { data } = await supabaseAdmin
      .from('department_configs')
      .select('api_base_url, api_key, routing_mode, method1_key')
      .eq('dept_name', '全站系统')
      .maybeSingle();
    return normalizeConfig(data, null, 'global');
  } catch (error) {
    console.warn('Failed to fetch global provider config:', error);
    return null;
  }
}

export async function resolveApiConfig(userUuid: string = 'system'): Promise<ApiProviderConfig> {
  if (userUuid !== 'system') {
    try {
      const userConfig = await getUserApiConfig(userUuid);
      const departmentConfig = normalizeConfig(
        userConfig?.department_configs,
        userConfig?.dept_id || null,
        'department'
      );
      if (departmentConfig) return departmentConfig;
    } catch (error) {
      console.warn('Failed to fetch department provider config:', error);
    }
  }

  const globalConfig = await getGlobalApiConfig();
  if (globalConfig) return globalConfig;

  return {
    apiKey: undefined,
    baseUrl: '',
    deptId: null,
    provider: 'routerhub',
    source: 'none'
  };
}

export async function getFallbackConfig(
  deptId?: string | null,
  method1Key?: string | null
): Promise<ApiProviderConfig | null> {
  if (isProviderKeyValid(method1Key)) {
    return {
      apiKey: method1Key,
      provider: 'routerhub',
      baseUrl: 'https://api.routerhub.ai/v1beta',
      deptId: deptId || null,
      source: deptId ? 'department' : 'global'
    };
  }

  if (deptId) {
    try {
      const { data } = await supabaseAdmin
        .from('department_configs')
        .select('method1_key, api_key, api_base_url')
        .eq('dept_id', deptId)
        .maybeSingle();

      if (isProviderKeyValid(data?.method1_key)) {
        return {
          apiKey: data.method1_key,
          provider: 'routerhub',
          baseUrl: 'https://api.routerhub.ai/v1beta',
          deptId,
          source: 'department'
        };
      }
      const config = normalizeConfig(data, deptId, 'department');
      if (config && config.provider !== 'vectorengine') return config;
    } catch (error) {
      console.warn('Failed to fetch department fallback config:', error);
    }
  }

  const globalConfig = await getGlobalApiConfig();
  if (globalConfig?.method1Key && isProviderKeyValid(globalConfig.method1Key)) {
    return {
      apiKey: globalConfig.method1Key,
      provider: 'routerhub',
      baseUrl: 'https://api.routerhub.ai/v1beta',
      deptId: null,
      source: 'global'
    };
  }
  if (globalConfig && globalConfig.provider !== 'vectorengine') return globalConfig;
  return null;
}
