let PROXY = localStorage.getItem('r34_proxy_url') || ''; // Empty = direct API access (Rule34/e621/MangaDex allow CORS). Set a proxy URL (keep /?url= at the end) only for sites that need one.

// Route a request through the user proxy only when the active site has no built-in CORS.
function shouldProxyRequest() {
  if (!PROXY) return false;
  const site = typeof window.getCurrentSite === 'function' ? window.getCurrentSite() : null;
  if (!site || site.cors !== false) return false;
  return true;
}

// Returns the raw URL for direct access, or the proxied URL when required.
window.proxifyUrl = function proxifyUrl(originalUrl) {
  return shouldProxyRequest() ? PROXY + encodeURIComponent(originalUrl) : originalUrl;
};

// MangaDex fetch with CORS fallback: MangaDex is behind Cloudflare and, from
// some networks/IPs, serves a challenge page WITHOUT Access-Control-Allow-
// Origin (status 200). Browsers then throw at read time. If that happens and a
// user proxy is configured, retry the exact same request through it.
//
// Deliberately does NOT use the shared throttledFetch queue: a doomed MangaDex
// request (blocked CORS) used to occupy the homepage feed's rate-limiter with
// multi-second backoffs, stalling the Rule34 home grid for ~20s on affected
// networks. MangaDex now retries on its own isolated schedule.
const mdFetchDirect = async function mdFetchDirect(url, options, attempts) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options || {});
      if (res.ok) return res;
      lastErr = new Error('MangaDex HTTP ' + res.status);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500));
  }
  throw lastErr;
};
window.mdFetch = async function mdFetch(url, options) {
  try {
    return await mdFetchDirect(url, options, 2);
  } catch (err) {
    if (PROXY && url.indexOf(PROXY) !== 0) {
      return await mdFetchDirect(PROXY + encodeURIComponent(url), options, 2);
    }
    throw err;
  }
};
// API / autocompletion / page size are now driven by the active site (js/sites.js).
let API = '';
let AUTOCOMPLETE_API = '';
let PER_PAGE = 40;

function syncSiteRuntime() {
  const site = typeof window.getCurrentSite === 'function' ? window.getCurrentSite() : null;
  API = (site && site.api) || '';
  AUTOCOMPLETE_API = (site && site.autocomplete) || '';
  PER_PAGE = (site && site.perPage) || 40;
}

// Recompute site-derived globals whenever the active site changes.
window.syncSiteRuntime = syncSiteRuntime;
window.resetBooruCalibration = function () {
  latestPostId = null;
  idCalibrated = false;
};
syncSiteRuntime();

// --- Cloudinary Video Optimization ---
// 1. Create a Cloudinary account.
// 2. Add an Auto-upload mapping in Settings -> Upload:
//    Folder: api-videos
//    URL prefix: https://wwebm.rule34.xxx/images/
// 3. Fill in your Cloud Name and Folder Name below:
const CLOUDINARY_CLOUD_NAME = ''; // Leave empty to disable
const CLOUDINARY_FOLDER = '';

function getOptimizedVideoUrl(rawUrl) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_FOLDER || !rawUrl) return rawUrl;

  // Extract the path after /images/ since Rule34 hosts videos across different subdomains
  const match = rawUrl.match(/https?:\/\/[^\/]+\/images\/(.+)/);
  if (match) {
    const path = match[1];
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/q_auto,f_auto,w_720/${CLOUDINARY_FOLDER}/${path}`;
  }
  return rawUrl;
}

document.addEventListener('DOMContentLoaded', () => {
  const proxyInput = document.getElementById('proxy-input');
  const proxySaveBtn = document.getElementById('proxy-save-btn');
  if (proxyInput) {
    proxyInput.value = localStorage.getItem('r34_proxy_url') || '';
  }
  if (proxySaveBtn) {
    proxySaveBtn.addEventListener('click', () => {
      let val = proxyInput.value.trim();
      if (val && !val.endsWith('url=')) {
        val += (val.includes('?') ? '&url=' : '?url=');
      }
      if (val) {
        if (typeof window.safeLocalStorageSet === 'function') window.safeLocalStorageSet('r34_proxy_url', val);
        else localStorage.setItem('r34_proxy_url', val);
        PROXY = val;
      } else {
        localStorage.removeItem('r34_proxy_url');
        PROXY = '';
      }
      if (typeof triggerToastNotification === 'function') {
        triggerToastNotification("Proxy settings saved. Reloading feed...");
      }
      if (typeof doSearch === 'function') doSearch();
    });
  }
});
let latestPostId = null;
let idCalibrated = false;

// --- Rate Limiting & Throttler ---
let highPriorityQueue = [];
let lowPriorityQueue = [];
let isFetchingQueue = false;
let currentFetchDelay = 700; // ~1.4 requests per second baseline
let queueTimeoutId = null;
let isCoolingDown = false;

// Rule34 & friends reply 429 WITHOUT the CORS allow-origin header, so the
// browser turns their rate-limit responses into opaque TypeErrors. We can't
// see the status, but a failing network request during a feed burst is almost
// always the API throttling us -> treat it like a 429 and back off.
const NETWORK_ERROR_MAX_ATTEMPTS = 3;

function processFetchQueue() {
  if (highPriorityQueue.length === 0 && lowPriorityQueue.length === 0) {
    isFetchingQueue = false;
    return;
  }
  isFetchingQueue = true;

  const isHighPriority = highPriorityQueue.length > 0;
  const req = isHighPriority ? highPriorityQueue.shift() : lowPriorityQueue.shift();

  // Schedule the next pull exactly once, and letting a backoff path override
  // the normal pacing. Never schedule from two places (that silently cancels
  // the 3s backoff and keeps hammering the API).
  const scheduleNext = (delay) => {
    clearTimeout(queueTimeoutId);
    queueTimeoutId = setTimeout(processFetchQueue, delay);
  };

  // Launch fetch without blocking the queue
  fetch(req.url, req.options)
    .then(async res => {
      if (res.status === 429) {
        console.warn(`[RATE LIMIT] 429 Too Many Requests. Backing off for 3 seconds...`);
        
        // Show user-facing notification
        if (!isCoolingDown) {
          isCoolingDown = true;
          if (typeof triggerToastNotification === 'function') {
            triggerToastNotification("API overloaded, waiting till it cooled down...");
          }
          setTimeout(() => { isCoolingDown = false; }, 3000);
        }

        // Re-insert at the front of the queue it came from
        if (isHighPriority) highPriorityQueue.unshift(req);
        else lowPriorityQueue.unshift(req);

        scheduleNext(3000); // 3 second backoff
        return;
      }
      
      // Save successful responses to cache
      if (res.ok && req.useCache && (!req.options.method || req.options.method.toUpperCase() === 'GET')) {
        const resClone = res.clone();
        try {
          const data = await resClone.json();
          // Keep transient responses fresh and bounded; the cache is only an optimization.
          const cacheEntry = JSON.stringify({ cachedAt: Date.now(), data });
          if (typeof window.safeSessionStorageSet === 'function') {
            window.safeSessionStorageSet(`r34_cache_${req.url}`, cacheEntry);
          } else {
            try { sessionStorage.setItem(`r34_cache_${req.url}`, cacheEntry); } catch (_) { /* Cache is optional. */ }
          }
        } catch(jsonErr) {}
      }

      req.resolve(res);
      scheduleNext(currentFetchDelay);
    })
    .catch(err => {
      // Network/CORS failure: almost always a rate-limited response (429) that
      // the browser blocked because the API omits the CORS header on errors.
      req.attempts = (req.attempts || 0) + 1;
      if (req.attempts <= NETWORK_ERROR_MAX_ATTEMPTS) {
        // Retry with a cooldown so we don't sit in an infinite error loop.
        if (!isCoolingDown) {
          isCoolingDown = true;
          if (typeof triggerToastNotification === 'function') {
            triggerToastNotification("Connection throttled, backing off...");
          }
          setTimeout(() => { isCoolingDown = false; }, 4000);
        }
        if (isHighPriority) highPriorityQueue.unshift(req);
        else lowPriorityQueue.unshift(req);
        scheduleNext(3000);
        return;
      }
      req.reject(err);
      scheduleNext(currentFetchDelay); // request gave up; keep the queue moving
    });
}

function throttledFetch(url, options = {}, isBackground = false, useCache = true) {
  return new Promise((resolve, reject) => {
    // --- Session Caching for Testing/Development ---
    // This prevents hitting the API limit when you refresh the page constantly
    if (useCache && (!options.method || options.method.toUpperCase() === 'GET')) {
      const cacheKey = `r34_cache_${url}`;
      let cached = null;
      try { cached = sessionStorage.getItem(cacheKey); } catch (_) { /* Storage can be disabled. */ }
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          const isEnvelope = parsedCache && typeof parsedCache === 'object' && 'cachedAt' in parsedCache && 'data' in parsedCache;
          const isFresh = !isEnvelope || Date.now() - parsedCache.cachedAt < 6 * 60 * 60 * 1000;
          if (!isFresh) {
            try { sessionStorage.removeItem(cacheKey); } catch (_) { /* Cache is optional. */ }
          } else {
            const parsedData = isEnvelope ? parsedCache.data : parsedCache;
            const serializedData = JSON.stringify(parsedData);
            const fakeResponse = {
              ok: true,
              status: 200,
              json: () => Promise.resolve(parsedData),
              text: () => Promise.resolve(serializedData),
              clone: () => ({
                ok: true,
                status: 200,
                json: () => Promise.resolve(parsedData),
                text: () => Promise.resolve(serializedData)
              })
            };
            return resolve(fakeResponse); // Instantly resolve from a fresh cache entry.
          }
        } catch (e) {
          try { sessionStorage.removeItem(cacheKey); } catch (_) { /* Cache is optional. */ }
        }
      }
    }

    const req = { url, options, resolve, reject, useCache };
    if (isBackground) {
      lowPriorityQueue.push(req);
    } else {
      highPriorityQueue.push(req);
    }
    if (!isFetchingQueue) {
      processFetchQueue();
    }
  });
}

window.clearBackgroundFetchQueue = function () {
  lowPriorityQueue = [];
};

// --- Debounce Utility ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function getLatestId() {
  if (latestPostId !== null) return latestPostId;
  try {
    const url = window.buildBooruSearchUrl ? window.buildBooruSearchUrl({ limit: 1, page: 0 }) : null;
    if (!url) return latestPostId;
    const res = await throttledFetch(proxifyUrl(url));
    const data = typeof window.adaptPosts === 'function' ? window.adaptPosts(await res.json()) : await res.json();
    if (data && data[0]) {
      latestPostId = parseInt(data[0].id);
      idCalibrated = true;
    }
  } catch (e) {
    if (latestPostId === null) latestPostId = 11200000;
  }
  return latestPostId;
}

const POSTS_PER_DAY = 6000;
async function getIdRange(days) {
  if (days === 'all') return null;
  const latest = await getLatestId();
  const minId = Math.max(0, latest - (days * POSTS_PER_DAY));
  return { min: minId, max: latest };
}

let autocompleteAbortController = null;

async function queryAutocomplete(query, callback = null) {
  if (autocompleteAbortController) {
    autocompleteAbortController.abort();
  }
  autocompleteAbortController = new AbortController();

  const targetUrl = typeof window.getAutocompleteUrl === 'function'
    ? window.getAutocompleteUrl(query)
    : `https://api.rule34.xxx/autocomplete.php?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(proxifyUrl(targetUrl), {
      signal: autocompleteAbortController.signal
    });
    const data = await res.json();
    if (callback) {
      callback(data);
    } else if (typeof renderSuggestions === 'function') {
      renderSuggestions(data);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Autocomplete fetch loop fail:', err);
    }
  }
}
