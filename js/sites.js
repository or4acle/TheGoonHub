/* Multi-site support for the media hub.
   Sites registry, URL builders, response adapters and the site switcher UI.
   Load this file BEFORE js/api.js. */

(function () {
  const SITE_KEY = 'r34_site_id';

  const SITES = [
    {
      id: 'rule34',
      name: 'Rule34',
      api: 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&api_key=2116381cf8a58c1de26faacfac84d760099e863311a98c1d060028461c82ab831d579f74e72983e6af34adbb661039c6a610d8f422be912fee3cb90b39d38f1a&user_id=6064624',
      tagApi: 'https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&api_key=2116381cf8a58c1de26faacfac84d760099e863311a98c1d060028461c82ab831d579f74e72983e6af34adbb661039c6a610d8f422be912fee3cb90b39d38f1a&user_id=6064624&name=',
      autocomplete: 'https://api.rule34.xxx/autocomplete.php?q={q}',
      tagsApi: true,
      format: 'gelbooru',
      perPage: 40,
      cors: true
    },
    {
      id: 'e621',
      name: 'e621',
      api: 'https://e621.net/posts.json',
      autocomplete: 'https://e621.net/tags/autocomplete.json?search[name_matches]={q}&expiry=7',
      tagsApi: false,
      format: 'e621',
      perPage: 40,
      experimental: true,
      cors: true
    },
    {
      id: 'yandere',
      name: 'yande.re',
      api: 'https://yande.re/post.json',
      tagApi: 'https://yande.re/tag.json?limit=1&name=',
      autocomplete: 'https://yande.re/autocomplete.php?term={q}',
      tagsApi: true,
      format: 'moebooru',
      perPage: 40,
      cors: false
    },
    {
      id: 'konachan',
      name: 'Konachan',
      api: 'https://konachan.com/post.json',
      tagApi: 'https://konachan.com/tag.json?limit=1&name=',
      autocomplete: 'https://konachan.com/autocomplete.php?term={q}',
      tagsApi: true,
      format: 'moebooru',
      perPage: 40,
      cors: false
    }
  ];

  let memorySiteId = null;

  function readStoredSiteId() {
    try { return localStorage.getItem(SITE_KEY) || memorySiteId || 'rule34'; } catch (_) { return memorySiteId || 'rule34'; }
  }

  function getSiteById(id) {
    return SITES.find(s => s.id === id) || null;
  }

  window.getCurrentSite = function () {
    const id = memorySiteId || readStoredSiteId();
    return getSiteById(id) || SITES[0];
  };

  window.getSiteById = getSiteById;
  window.getAllSites = function () { return SITES.slice(); };

  window.setCurrentSite = function (id) {
    const site = getSiteById(id) || SITES[0];
    memorySiteId = site.id;
    if (typeof window.safeLocalStorageSet === 'function') {
      window.safeLocalStorageSet(SITE_KEY, site.id);
    } else {
      try { localStorage.setItem(SITE_KEY, site.id); } catch (_) { /* keep in-memory fallback */ }
    }
    return site;
  };

  // Build a full search URL for the current site.
  // gelbooru-family: &tags=&limit=&pid=&json=1
  // danbooru/e621:   ?tags=&limit=&page=
  // moebooru:        ?tags=&limit=&page= (yande.re / konachan)
  window.buildBooruSearchUrl = function ({ tags = '', limit = 40, page = 0, extra = '' } = {}) {
    const site = window.getCurrentSite();
    if (!site) return null;

    let finalTags = tags;
    if (site.format !== 'gelbooru' && tags) {
      finalTags = String(tags).split(/\s+/).map(t => {
        switch (t) {
          case 'sort:score:desc': return 'order:score';
          case 'sort:score:asc': return 'order:score_asc';
          case 'sort:id:desc': return 'order:id';
          case 'sort:id:asc': return site.format === 'danbooru' ? 'order:id_asc' : '';
          case 'sort:random': return 'order:random';
          default: return t;
        }
      }).filter(Boolean).join(' ');
    }

    let url;
    if (site.format === 'danbooru' || site.format === 'e621' || site.format === 'moebooru') {
      url = `${site.api}?limit=${limit}&page=${page + 1}`;
      if (finalTags) url += `&tags=${encodeURIComponent(finalTags)}`;
    } else {
      url = `${site.api}&limit=${limit}&pid=${page}&json=1`;
      if (finalTags) {
        url += `&tags=${encodeURIComponent(finalTags).replace(/%2B/g, '+')}`;
      }
    }

    if (extra) url += `&${extra}`;
    return url;
  };

  // Build the tag lookup URL (gelbooru-family uses the XML tags API, moebooru
  // uses tag.json; both expose tag categories).
  window.buildTagLookupUrl = function () {
    const site = window.getCurrentSite();
    if (!site || !site.tagsApi) return null;
    if (typeof site.tagApi === 'string' && site.tagApi) return site.tagApi;
    return site.api.replace('s=post', 's=tag');
  };

  window.getAutocompleteUrl = function (query) {
    const site = window.getCurrentSite();
    const tpl = (site && site.autocomplete) || 'https://api.rule34.xxx/autocomplete.php?q={q}';
    return tpl.replace('{q}', encodeURIComponent(query));
  };

  // Normalize posts from any supported site into the Rule34-shape the UI expects.
  window.adaptPosts = function (data) {
    const site = window.getCurrentSite();
    let list = Array.isArray(data) ? data
      : (data && Array.isArray(data.posts) ? data.posts
        : (data && typeof data.id !== 'undefined' ? [data] : []));
    if (!site) return list;
    if (site.format === 'moebooru') {
      return list.map(p => ({
        id: p.id,
        file_url: p.file_url,
        sample_url: p.sample_url || p.file_url,
        preview_url: p.preview_url || p.sample_url || p.file_url,
        tags: p.tags || '',
        score: typeof p.score === 'number' ? p.score : 0,
        width: p.width,
        height: p.height,
        created_at: p.created_at,
        source: p.source || '',
        format: p.file_ext || (p.file_url ? p.file_url.split('.').pop() : '')
      }));
    }
    if (site.format === 'danbooru') {
      return list.map(p => ({
        id: p.id,
        file_url: p.file_url,
        sample_url: p.large_file_url || p.file_url,
        preview_url: p.preview_file_url || p.large_file_url || p.file_url,
        tags: p.tag_string || '',
        score: typeof p.score === 'number' ? p.score : (p.up_score || 0),
        width: p.image_width,
        height: p.image_height,
        created_at: p.created_at,
        source: p.source || '',
        format: p.file_ext || ''
      }));
    }
    if (site.format === 'e621') {
      return list.map(p => {
        const score = (p.score && typeof p.score.total === 'number') ? p.score.total : (typeof p.score === 'number' ? p.score : 0);
        const tagObj = p.tags || {};
        const tagParts = ['general', 'species', 'character', 'artist', 'copyright', 'meta'];
        const tags = tagParts.reduce((acc, k) => acc.concat(tagObj[k] || []), []).join(' ');
        return {
          id: p.id,
          file_url: p.file && p.file.url,
          sample_url: (p.sample && p.sample.url) || (p.file && p.file.url),
          preview_url: (p.preview && p.preview.url) || (p.sample && p.sample.url) || (p.file && p.file.url),
          tags,
          score,
          width: p.file && p.file.width,
          height: p.file && p.file.height,
          created_at: p.created_at,
          source: p.sources && p.sources[0] ? p.sources[0] : '',
          format: p.file && p.file.ext
        };
      });
    }
    return list;
  };

  // Numeric tag categories (1=artist, 3=copyright, 4=character, 5=metadata).
  const TAG_TYPE_NAMES = { 0: 'general', 1: 'artist', 3: 'copyright', 4: 'character', 5: 'metadata' };
  window.mapTagType = function (type) {
    if (typeof type === 'number') return TAG_TYPE_NAMES[type] || 'general';
    return type || 'general';
  };

  function populateSiteSelect() {
    const sel = document.getElementById('site-select');
    if (!sel) return;
    sel.innerHTML = '';
    SITES.forEach(site => {
      const opt = document.createElement('option');
      opt.value = site.id;
      opt.textContent = site.experimental ? `${site.name} (experimental)` : site.name;
      sel.appendChild(opt);
    });
    sel.value = window.getCurrentSite().id;
    sel.addEventListener('change', () => {
      const name = window.setCurrentSite(sel.value).name;
      if (typeof window.syncSiteRuntime === 'function') window.syncSiteRuntime();
      document.title = `R34 Media Hub Pro — ${name}`;
      if (typeof window.resetBooruCalibration === 'function') window.resetBooruCalibration();
      if (typeof triggerToastNotification === 'function') {
        triggerToastNotification(`Switched to ${name}. Refreshing feed...`);
      }
      if (typeof doSearch === 'function') {
        window.setTimeout(doSearch, 50);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    populateSiteSelect();
  });
}());