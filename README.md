<div align="center">
  <!-- Logo and Title -->
  <img src="Icons/icons8-image-48.png" alt="logo" width="30%"/>
  <h1>R34 Media Hub Pro</h1>
  <p>Advanced multi-site media browser with a local vault and recommendation engine :))))</p>

  <img src="https://img.shields.io/badge/Platform-Web%20App-6f1ab1" alt="Platform"/>
  <img src="https://img.shields.io/badge/API-Rule34%20%7C%20Gelbooru%20%7C%20Danbooru%20%7C%20e621-blue" alt="APIs"/>
  <img src="https://img.shields.io/badge/Storage-IndexedDB%20Local-brightgreen" alt="Storage"/>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D14-orange" alt="Node.js"/>
</div>

## Overview

R34 Media Hub Pro is a modern, fully client-side media browser that pulls from
multiple booru APIs (Rule34, Gelbooru, Safebooru, XBooru, TBIB, Danbooru, e621)
plus MangaDex. It combines a powerful tag-based search with a **local Vault**
(IndexedDB) and a **Recommendation Engine** that studies your saved art and
learning behavior to generate a personalized discovery feed.

Everything is stored locally in your browser — no accounts, no servers, no data
leaving your machine beyond the image-board APIs you query.

## Features

- **Multi-site support:** Rule34, Gelbooru (SFW), Safebooru (SFW), XBooru, TBIB, Danbooru and e621, selected from the header dropdown.
- **Booru tag search:** autocomplete, multi-pill tags, exact/exclude (`-tag`), fuzzy (`~tag`) and wildcard (`tag*`) modifiers.
- **Global whitelist & blacklist:** tags that are always included or always excluded across every search.
- **Timeframe & sorting capsules:** filter by last 7/30/90/180/365 days and sort by score, time or random.
- **Local Vault:** save posts to folders (IndexedDB), export & import your whole collection as JSON.
- **Recommendation Engine:** analyzes your Vault DNA (character/artist/series/general tag seeds), renders a roulette wheel and generates a personalized discovery feed.
- **Lightbox recommendations:** "More like this" suggestions generated from the currently open post.
- **Manga browser:** full MangaDex search, filters (rating, status, language, year), Read-all / single-page reader and local bookshelf.
- **Infinite scroll + background preloading** for a seamless Pinterest-style grid.
- **CORS proxy support:** works out of the box on direct CORS-enabled sites; a user-supplied proxy URL is used for the rest.

## Installation

### Option A - Local (recommended for development)

1. Install [Node.js](https://nodejs.org) `>= 14` (Node is only needed to serve the static files).
2. Download or clone this repository.
3. Run the local server:

   ```bash
   npm start
   ```

   or double-click `start-local.bat` on Windows.
4. Open <http://localhost:8080>

Alternatively, if you have Python: `python -m http.server 8080` in the project root.

### Option B - GitHub Pages (deploy)

This project is a static site and works on any static host.

1. Push this repository to GitHub.
2. Go to **Settings -> Pages** and set **Source** to the `main` branch (from root).
3. Your app will be live at `https://<user>.github.io/<repo>/`.

> **Note:** Rule34, e621 and MangaDex allow cross-origin requests, so those sites
> work through GitHub Pages with no extra setup. To use the browser-side
> proxy-free sites (Gelbooru, Safebooru, XBooru, TBIB) on a static host, set a
> CORS proxy (see below).

## CORS Proxy (optional)

Some booru APIs do not send `Access-Control-Allow-Origin` headers. If you want to
use Gelbooru/Safebooru/XBooru/TBIB from a static deployment (or from a browser
that blocks direct requests), set a CORS proxy in the app:

1. Open **Global Settings** (the gear icon in the Vault taskbar).
2. Under *Network & Proxy Settings*, paste a proxy URL and click **Save Proxy**.

The proxy must accept `?url=<encoded target>` and forward the request with CORS
headers. A free Cloudflare Worker is recommended — the full, hardened version
lives in [cloudflare-worker.js](cloudflare-worker.js) (handles OPTIONS
preflight, strips browser `Origin`/`Referer`/`Cookie` so boorus don't reject
the request, and rejects non-http targets):

```js
// Cloudflare Worker — copy into https://dash.cloudflare.com -> Workers -> Create
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      }});
    }
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const target = url.searchParams.get('url');
    if (!target) return new Response('Missing ?url= parameter', { status: 400 });
    const res = await fetch(target, { method: 'GET' });
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
```

Deploy it, copy your worker URL (e.g. `https://your-name.workers.dev`), then use
`https://your-name.workers.dev/?` as the proxy URL in the app.

## How to Use

- **Search:** type tags with autocomplete, press `Enter` (or the spacebar) to turn them into pills, then search. Use `-` / `~` / `*` modifiers per tag.
- **Vault:** click the profile button (or the Vault tab) to browse your saved collection, create folders, bulk-move, export or import.
- **Algorithm Discovery:** open the Algorithm tab to tune weights (Character / Artist / Series / General), Batch Size, Discovery Ratio and Freshness, then click **Generate Personalized Feed**.
- **Lightbox:** click any image to open it, view its tags, save it, download it, and see "More like this" recommendations.
- **Manga:** switch to the Manga tab and search titles or authors; open a reader in continuous or single-page mode.
- **Site switcher:** use the dropdown in the search bar to switch API sources on the fly.

## Settings

| Setting | Location | Description |
|---|---|---|
| Site | Search bar dropdown | Active API source (Rule34, Gelbooru, Safebooru, XBooru, TBIB, Danbooru, e621) |
| Proxy URL | Global Settings -> Network | CORS proxy for sites without CORS (`https://proxy.workers.dev/?`) |
| Grid Density | Global Settings -> UI & Layout | Compact / Normal / Large thumbnail sizing |
| Global Whitelist | Global Settings -> Content Filtering | Tags always appended to every search |
| Global Blacklist | Global Settings -> Content Filtering | Tags always excluded from every search |
| Character / Artist / Series / General Weight | Algorithm tab | Multipliers applied to tag seeds in the DNA engine |
| Batch Size | Algorithm tab | Posts to fetch per discovery batch (10-100) |
| Discovery Ratio | Algorithm tab | Percentage of random discovery vs. targeted posts |
| Freshness | Algorithm tab | Share of uncached "no sort:random" queries |
| Concurrent Fetches | Algorithm tab | Number of parallel tag queries per batch |
| Base Search | Algorithm tab | Optional tag prefix applied to every algorithm query |

## Algorithm DNA

The recommendation engine turns your saved art into a personalized feed:

1. **Vault scans** — every saved post contributes its tags, weighted by recency (newest posts score highest).
2. **Tag typing** — tags are resolved against the active site's tags API and classified as character / artist / copyright / general.
3. **Weights** — your DNA multipliers are applied and a weighted roulette selects which tags to query.
4. **Blending** — targeted tag queries are blended with random discovery batches.
5. **Learn** — the tags you search for and the posts you view are also tracked, so your feed keeps adapting to what you actually engage with.

## Credits

- The booru communities and APIs: Rule34, Gelbooru, Safebooru, XBooru, TBIB, Danbooru, e621.
- MangaDex for the manga search and reading API.
- Icons from [Icons8](https://icons8.com).