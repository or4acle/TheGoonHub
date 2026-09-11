// Cloudflare Worker — CORS proxy for R34 Media Hub Pro
// ----------------------------------------------------------------------------
// 1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create -> Worker
// 2. Name it (e.g. r34-cors) and deploy.
// 3. In the app: Global Settings -> Network -> Proxy URL:
//    https://r34-cors.<your-subdomain>.workers.dev/?
//
// The app appends ?url=<encoded target>, so any founder of the requested
// endpoint is forwarded as-is with permissive CORS headers. Only the sites
// without native CORS (Gelbooru/Safebooru/XBooru/TBIB/Danbooru) are routed
// through the proxy; Rule34/e621 go direct.
// ----------------------------------------------------------------------------

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Handle CORS preflight (OPTIONS) explicitly.
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Preferred form: ?url=<encoded target>
    const target = url.searchParams.get('url');
    if (target) {
      return corsResponse(fetchTarget(target));
    }

    // Fallback form: /<encoded target>
    const pathBase = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (pathBase) {
      return corsResponse(fetchTarget(pathBase));
    }

    return new Response('Missing ?url= parameter', { status: 400 });
  },
};

async function fetchTarget(target) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Response('Only http/https targets allowed', { status: 400 });
  }
  // Do NOT forward Origin/Referer/Cookie/User-Agent from the browser:
  // some booru APIs reject requests carrying a foreign Origin.
  const res = await fetch(parsed.href, {
    method: 'GET',
    redirect: 'follow',
  });
  return res;
}

async function corsResponse(promise) {
  try {
    const res = await promise;
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (e) {
    return new Response(`Proxy error: ${e.message}`, { status: 502 });
  }
}