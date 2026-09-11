// Cloudflare Worker - CORS proxy for R34 Media Hub Pro
// ----------------------------------------------------------------------------
// 1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create -> Worker
// 2. Name it (e.g. r34-cors) and deploy.
// 3. In the app: Global Settings -> Network & Proxy Settings -> Proxy URL:
//    https://r34-cors.<your-subdomain>.workers.dev/?
//
// The app appends ?url=<encoded target>, and the encoded target is forwarded
// as-is with permissive CORS headers. Only sites WITHOUT native CORS
// (yande.re and Konachan) are routed through the proxy; Rule34/e621 go direct.
//
// Hardening:
//  - Only GET/HEAD/OPTIONS are allowed.
//  - Only http/https targets are accepted (no SSRF to internal schemes).
//  - Browser Origin/Referer/Cookie are never forwarded upstream.
//  - Simple per-IP rate limit protects the origin boorus from abuse.
//  - Security headers added on every proxied response.
// ----------------------------------------------------------------------------

// Sliding-window rate limit: max 120 requests per IP per minute.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const rateBuckets = new Map(); // ip -> [timestamps]

function rateLimit(ip) {
  if (!ip) return null;
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  let bucket = rateBuckets.get(ip) || [];
  bucket = bucket.filter((t) => t > cutoff);
  if (bucket.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, bucket);
    return 429;
  }
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return null;
}

function securityHeaders(headers) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-XSS-Protection', '0');
  return headers;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Handle CORS preflight (OPTIONS) explicitly - never counted against the rate limit.
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: securityHeaders(new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        })),
      });
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Enforce per-IP rate limit.
    const ip = request.headers.get('CF-Connecting-IP');
    const limited = rateLimit(ip);
    if (limited === 429) {
      return new Response('Too many requests. Please wait a moment and try again.', {
        status: 429,
        headers: securityHeaders(new Headers({
          'Access-Control-Allow-Origin': '*',
          'Retry-After': '60',
        })),
      });
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
  // Forward as a clean server-side request, honoring redirects.
  const res = await fetch(parsed.href, {
    method: 'GET',
    redirect: 'follow',
  });
  return res;
}

async function corsResponse(promise) {
  try {
    const res = await promise;
    const headers = securityHeaders(new Headers(res.headers));
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (e) {
    return new Response(`Proxy error: ${e.message}`, { status: 502 });
  }
}