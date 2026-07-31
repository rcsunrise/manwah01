export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const routerHubKey = process.env.ROUTERHUB_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  
  const apiKey = routerHubKey || geminiKey;
  const baseUrl = routerHubKey ? 'https://api.routerhub.ai' : 'https://generativelanguage.googleapis.com';

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key is missing. If you just added the key in AI Studio, please click Deploy to Cloud Run again to apply the new secret.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;
    
    const targetUrl = new URL(`${baseUrl}${path}`);
    
    // Copy query parameters
    url.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });
    // Set API key
    targetUrl.searchParams.set('key', apiKey);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (routerHubKey) {
      headers['Authorization'] = `Bearer ${routerHubKey}`;
    } else if (geminiKey) {
      headers['x-goog-api-key'] = geminiKey;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const payloadBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body ? req.body : undefined;

    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: payloadBody,
    });
    
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('X-Proxy-Provider', routerHubKey ? 'routerhub' : 'google');

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error) {
    console.error('Proxy Error:', error);
    return new Response(JSON.stringify({ error: 'Proxy Request Failed', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
