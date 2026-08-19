import { GoogleGenAI } from '@google/genai';
import { isProviderKeyValid, resolveApiConfig } from '../ai/providerConfig';

export { resolveApiConfig } from '../ai/providerConfig';

export async function createServerGenAI(userUuid: string = 'system') {
  const config = await resolveApiConfig(userUuid);
  if (!isProviderKeyValid(config.apiKey)) {
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
      timeout: 360000
    }
  } as any);

  return { ai, config, isValidKey: true };
}
