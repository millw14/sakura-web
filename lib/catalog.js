// Same-origin, edge-cacheable catalogue reads for the web build (api/catalog.js).
//
// The web app used to fetch every atsu and manhwa list, detail, chapter list
// and page list through the web-content-proxy Supabase edge function. That is
// a cross-origin POST: it pays a CORS preflight (~330 ms, the function sent no
// Access-Control-Max-Age), a second TLS connection, ~75 ms of Deno overhead,
// and it can never be cached by anyone, so every view of every user went all
// the way to atsu or the one-worker droplet (0.6–1.2 s per call, 1.5–3.5 s on a
// cold droplet scrape). The bodies are identical for every user, so a GET with
// s-maxage + stale-while-revalidate lets Vercel's CDN answer almost all of
// them in ~80 ms and hide droplet scrapes behind a stale copy.
//
// It is deliberately narrow, like lib/manga-page.js: a fixed table of
// operations, each with a fixed parameter list in a fixed order, every value
// validated, and the upstream URL built here from constants. The caller picks
// an operation and an id, never a host or a path, so this is not an open
// proxy, and one title maps to exactly one URL, so to one edge-cache entry.
// The body is the upstream JSON unchanged — exactly what web-content-proxy
// returns on success — so the app's parsers do not change.

const ATSU_BASE = 'https://atsu.moe';
// The droplet speaks plain HTTP only; that is fine server-side, and is why the
// browser could never call it directly. Same default as web-content-proxy.
const MANHWA_BASE = 'http://165.232.83.159/manhwa/v1';

// Must stay equal to TYPES in sakura-mobile/lib/manga.ts: the app only maps a
// request here when its query matches these constants exactly.
const ATSU_TYPES = 'Manga,Manwha,Manhua,OEL';
// The Typesense query the app sends for manga search (lib/manga.ts
// searchManga), minus q / page / per_page. Same rule: an app request that
// differs in any of these stays on the edge function.
const ATSU_SEARCH_PARAMS = [
  ['query_by', 'title,englishTitle,otherNames,authors'],
  ['query_by_weights', '4,3,2,1'],
  ['num_typos', '4,3,2,1'],
  ['include_fields', 'id,title,englishTitle,poster,posterSmall,posterMedium,type,isAdult,status,year,mbRating,popularity'],
  ['filter_by', 'hidden:!=true && isAdult:=false && type:=[Manga,Manwha,Manhua,OEL]'],
  ['infix', 'off,off,fallback,off'],
];

// Genre/status browsing (lib/manga.ts browseManga + mangaBrowseFilter in the
// app). The caller picks a genre id, a status and a sort; the Typesense filter
// is rebuilt here, so the adult and light-novel exclusions are always in it
// and cannot be asked away. Same rule as search: an app request whose filter
// differs from what these build stays on the edge function.
const ATSU_BROWSE_BASE = [
  'hidden:!=true',
  'isAdult:=false',
  'medium:=Comic',
  `type:=[${ATSU_TYPES}]`,
  'genreIds:!=[10,41,46]',
];
const ATSU_BROWSE_SORTS = {
  popular: 'views:desc',
  rating: 'mbRating:desc',
  trending: 'trending:desc',
  added: 'dateAdded:desc',
};
const ATSU_BROWSE_STATUSES = ['Ongoing', 'Completed', 'Hiatus'];
const ATSU_BROWSE_FIELDS = 'id,title,englishTitle,poster,posterSmall,posterMedium,type,mbRating';

function atsuBrowseFilter(genre, status) {
  const parts = [...ATSU_BROWSE_BASE];
  if (genre) parts.push(`genreWeightKeys:=[\`${genre}:core\`,\`${genre}:defining\`]`);
  if (status) parts.push(`status:=${status}`);
  return parts.join(' && ');
}

// Under the 10 s a function may run on plans without Fluid compute, so a slow
// upstream ends in our own JSON 504 (which the app falls back from) rather
// than Vercel's opaque FUNCTION_INVOCATION_TIMEOUT page. Healthy answers take
// 0.25–0.4 s from atsu and up to ~3.5 s for a cold droplet scrape.
const UPSTREAM_TIMEOUT_MS = 9_000;
// Below the 4.5 MB a Vercel function may return. The largest real answers are
// a few hundred KB (atsu allChapters for 1,000+ chapters ~200 KB; a 2,000-row
// manhwa chapter page ~200 KB), so this only stops something pathological.
const MAX_BYTES = 4 * 1024 * 1024;

// Edge lifetimes, by how quickly the answer really changes. Browsers keep
// 60 s; the CDN keeps the answer s-maxage seconds, then serves it stale while
// it refreshes in the background for SWR seconds, so after the first view in
// a region nobody waits on an upstream again. While the upstream is failing
// it serves the last good copy for a day (stale-if-error) whatever the op.
const S_MAXAGE = { list: 300, detail: 1800, chapters: 300, pages: 86400, updates: 60 };
// Except chapter lists. A day-stale list is the one answer that is visibly
// wrong: the first reader in a region after a release — the one a
// new-chapter push sent there — would get yesterday's list without the
// chapter they came for, and the app keeps whatever it gets for its own
// 15 minutes. s-maxage + SWR here keeps any list it serves under 10 minutes
// old, inside the droplet's own 15-minute scrape cache, while a burst of
// readers still shares one upstream fetch.
// "Latest updates" is only worth showing fresh: a minute at the edge, and
// never more than five minutes stale.
const SWR = { list: 86400, detail: 86400, chapters: 300, pages: 86400, updates: 300 };
// An empty answer is also what an upstream hiccup looks like (the droplet
// answers 200 with no items when its sources fail), and the app refuses to
// cache one. Keep it at the edge only briefly, and never serve it stale.
const EMPTY_CACHE = 'public, max-age=0, s-maxage=30';

class CatalogError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    if (extra.retryAfter) this.retryAfter = extra.retryAfter;
    if (extra.upstreamStatus) this.upstreamStatus = extra.upstreamStatus;
  }
}

const invalid = (message = 'Choose a supported catalogue request.') =>
  new CatalogError(400, 'CATALOG_INVALID_REQUEST', message);

// Validators return the canonical value or null. Canonical means one spelling
// per value — no leading zeros, no `+`, no padding — so a title cannot be
// spread over several edge-cache entries.
function int(min, max) {
  return (value) => {
    if (!/^(?:0|[1-9][0-9]{0,5})$/.test(value)) return null;
    const n = Number(value);
    return n >= min && n <= max ? value : null;
  };
}

function pattern(regex) {
  return (value) => (regex.test(value) ? value : null);
}

function oneOf(values) {
  return (value) => (values.includes(value) ? value : null);
}

/** '' (none) or a positive genre id in canonical form. */
function optional(check) {
  return (value) => (value === '' ? '' : check(value));
}

function searchText(maxLength) {
  return (value) => (
    value && value.length <= maxLength && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) ? value : null
  );
}

// atsu ids are short base62-ish strings ("sVC2A", chapter "YrFZ5").
const ATSU_ID = pattern(/^[A-Za-z0-9_-]{1,64}$/);
// Manhwa ids are opaque `mr:` / `cz:` slugs the droplet minted; it decodes
// %-escapes itself, so ids arrive decoded and may hold non-Latin letters.
const MANHWA_ID = pattern(/^(?:mr|cz):[\p{L}\p{N}][\p{L}\p{N}._~-]{0,199}$/u);
const MANHWA_CHAPTER = pattern(/^[\p{L}\p{N}][\p{L}\p{N}._~-]{0,199}$/u);

function upstreamUrl(base, path, params) {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of params) url.searchParams.set(key, value);
  return url.href;
}

const listOf = (...keys) => (data) => {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key].length === 0;
  }
  return true;
};

const atsu = (path, params) => upstreamUrl(ATSU_BASE, path, params);
const manhwa = (path, params) => upstreamUrl(MANHWA_BASE, path, params);

// Each op: its parameters in canonical order, how long the edge may keep it,
// the upstream URL, and what an empty answer looks like.
const SOURCES = {
  atsu: {
    headers: { Accept: 'application/json', Referer: ATSU_BASE },
    ops: {
      trending: {
        params: [['page', int(0, 50)]],
        ttl: 'list',
        url: (p) => atsu('/api/infinite/trending', [['page', p.page], ['types', ATSU_TYPES]]),
        isEmpty: listOf('items'),
      },
      popular: {
        params: [['page', int(0, 50)]],
        ttl: 'list',
        url: (p) => atsu('/api/infinite/popular', [['page', p.page], ['types', ATSU_TYPES]]),
        isEmpty: listOf('items'),
      },
      detail: {
        params: [['id', ATSU_ID]],
        ttl: 'detail',
        url: (p) => atsu('/api/manga/page', [['id', p.id]]),
        isEmpty: (data) => !data?.mangaPage,
      },
      chapters: {
        params: [['id', ATSU_ID]],
        ttl: 'chapters',
        url: (p) => atsu('/api/manga/allChapters', [['mangaId', p.id]]),
        isEmpty: listOf('chapters'),
      },
      read: {
        params: [['mangaId', ATSU_ID], ['chapterId', ATSU_ID]],
        ttl: 'pages',
        url: (p) => atsu('/api/read/chapter', [['mangaId', p.mangaId], ['chapterId', p.chapterId]]),
        isEmpty: (data) => listOf('pages')(data?.readChapter),
      },
      search: {
        params: [['q', searchText(200)], ['limit', int(1, 100)]],
        ttl: 'list',
        url: (p) => atsu('/collections/manga/documents/search',
          [['q', p.q], ...ATSU_SEARCH_PARAMS, ['page', '1'], ['per_page', p.limit]]),
        isEmpty: listOf('hits'),
      },
      browse: {
        params: [
          ['genre', optional(int(1, 9999))],
          ['status', optional(oneOf(ATSU_BROWSE_STATUSES))],
          ['sort', oneOf(Object.keys(ATSU_BROWSE_SORTS))],
          ['page', int(1, 500)],
          ['limit', int(1, 60)],
        ],
        ttl: 'list',
        url: (p) => atsu('/collections/manga/documents/search', [
          ['q', '*'],
          ['filter_by', atsuBrowseFilter(p.genre, p.status)],
          ['sort_by', ATSU_BROWSE_SORTS[p.sort]],
          ['include_fields', ATSU_BROWSE_FIELDS],
          ['page', p.page],
          ['per_page', p.limit],
        ]),
        isEmpty: listOf('hits'),
      },
      // Titles that just got a chapter (atsu's home2 shelves). mediums=Comic
      // keeps light novels out; the app drops adult rows as before.
      recentlyUpdated: {
        params: [['offset', int(0, 2000)], ['limit', int(1, 60)]],
        ttl: 'updates',
        url: (p) => atsu('/api/home2/recentlyUpdated',
          [['offset', p.offset], ['limit', p.limit], ['types', ATSU_TYPES], ['mediums', 'Comic']]),
        isEmpty: listOf('items'),
      },
      hotUpdates: {
        params: [['offset', int(0, 2000)], ['limit', int(1, 60)]],
        ttl: 'updates',
        url: (p) => atsu('/api/home2/hotUpdates',
          [['offset', p.offset], ['limit', p.limit], ['types', ATSU_TYPES], ['mediums', 'Comic']]),
        isEmpty: listOf('items'),
      },
    },
  },
  manhwa: {
    headers: { Accept: 'application/json' },
    // Limits mirror the droplet's own clamps (scripts/droplet/manhwa-scraper
    // server.js), so every accepted request gets exactly the answer it asked for.
    ops: {
      popular: {
        params: [['limit', int(1, 60)]],
        ttl: 'list',
        url: (p) => manhwa('/popular', [['limit', p.limit]]),
        isEmpty: listOf('items', 'results'),
      },
      search: {
        params: [['q', searchText(200)], ['limit', int(1, 60)], ['offset', int(0, 500)]],
        ttl: 'list',
        url: (p) => manhwa('/search', [['q', p.q], ['limit', p.limit], ['offset', p.offset]]),
        isEmpty: listOf('items', 'results'),
      },
      details: {
        params: [['id', MANHWA_ID]],
        ttl: 'detail',
        url: (p) => manhwa('/details', [['id', p.id]]),
        isEmpty: (data) => !(data?.comic || data?.manga || data?.id),
      },
      chapters: {
        params: [['id', MANHWA_ID], ['limit', int(1, 2000)], ['offset', int(0, 5000)]],
        ttl: 'chapters',
        url: (p) => manhwa('/chapters', [['id', p.id], ['limit', p.limit], ['offset', p.offset]]),
        isEmpty: listOf('issues', 'chapters'),
      },
      pages: {
        params: [['id', MANHWA_ID], ['chapterId', MANHWA_CHAPTER]],
        ttl: 'pages',
        url: (p) => manhwa('/pages', [['id', p.id], ['chapterId', p.chapterId]]),
        isEmpty: listOf('pages', 'images'),
      },
    },
  },
};

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const MAX_PARAMS = Math.max(...Object.values(SOURCES).flatMap((source) => Object.values(source.ops).map((op) => op.params.length)));

/**
 * Validate a request's query, given as [key, value] pairs in the order they
 * arrived. Requires exactly `s`, `op` and that op's parameters, in that order,
 * each once and in canonical form; anything else is a 400, so the edge cache
 * holds one entry per item and cannot be busted with junk parameters.
 * Returns { source, op, params, ttl, upstreamUrl, headers, isEmpty, path }.
 */
function parseCatalogQuery(entries) {
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 2 + MAX_PARAMS) throw invalid();
  const [[sKey, source], [opKey, op]] = entries;
  if (sKey !== 's' || opKey !== 'op' || !own(SOURCES, source) || !own(SOURCES[source].ops, op)) throw invalid();
  const spec = SOURCES[source].ops[op];
  const rest = entries.slice(2);
  if (rest.length !== spec.params.length) throw invalid();
  const params = {};
  spec.params.forEach(([name, check], index) => {
    const [key, raw] = rest[index];
    const value = key === name && typeof raw === 'string' ? check(raw) : null;
    if (value === null) throw invalid();
    params[name] = value;
  });
  return {
    source,
    op,
    params,
    ttl: spec.ttl,
    upstreamUrl: spec.url(params),
    headers: SOURCES[source].headers,
    isEmpty: spec.isEmpty,
    path: catalogPath(source, op, params),
  };
}

/** The one canonical URL for an operation; the app builds the same string. */
function catalogPath(source, op, params = {}) {
  const spec = SOURCES[source]?.ops?.[op];
  if (!spec) throw invalid();
  const query = new URLSearchParams([['s', source], ['op', op], ...spec.params.map(([name]) => [name, String(params[name])])]);
  return `/api/catalog/?${query.toString()}`;
}

function successCache(ttl) {
  return `public, max-age=60, s-maxage=${S_MAXAGE[ttl]}, stale-while-revalidate=${SWR[ttl]}, stale-if-error=86400`;
}

function cancelBody(response) {
  // Do not wait for a remote stream to acknowledge cancellation.
  void response.body?.cancel().catch(() => {});
}

function upstreamError(response) {
  const upstreamStatus = response.status;
  if (upstreamStatus === 404 || upstreamStatus === 410) {
    return new CatalogError(404, 'CATALOG_NOT_FOUND', 'This title is not in the catalogue.', { upstreamStatus });
  }
  if (upstreamStatus === 429) {
    return new CatalogError(429, 'CATALOG_RATE_LIMITED', 'The catalogue source is busy. Try again shortly.',
      { upstreamStatus, retryAfter: response.headers.get('retry-after') || undefined });
  }
  return new CatalogError(502, 'CATALOG_UPSTREAM_ERROR', 'The catalogue source is unavailable.', { upstreamStatus });
}

const tooLarge = () => new CatalogError(502, 'CATALOG_TOO_LARGE', 'The catalogue answer is too large.');

async function readCapped(response, maxBytes) {
  // fetch() decodes a compressed body, so a declared length can only prove
  // "too large", never "small enough"; the running count below does that.
  if (Number(response.headers.get('content-length')) > maxBytes) {
    cancelBody(response);
    throw tooLarge();
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw tooLarge();
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

/**
 * Fetch one validated request upstream. Resolves { body, empty } where body
 * is the upstream JSON text, untouched, and empty says whether it carried no
 * results. Throws CatalogError for answers that must not be cached; network
 * failures and aborts propagate as-is for the handler to classify.
 */
async function loadCatalog(request, { fetchImpl = fetch, signal, maxBytes = MAX_BYTES } = {}) {
  const response = await fetchImpl(request.upstreamUrl, { headers: request.headers, signal });
  if (!response.ok) {
    cancelBody(response);
    throw upstreamError(response);
  }
  const body = await readCapped(response, maxBytes);
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    // An HTML challenge page or a truncated answer: never cache it as data.
    throw new CatalogError(502, 'CATALOG_BAD_UPSTREAM', 'The catalogue source returned an unreadable answer.');
  }
  // The edge function turns `{ error }` into a thrown error in the app, so a
  // 200 carrying one is a failure here too, and must not be pinned at the edge.
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    throw new CatalogError(502, 'CATALOG_UPSTREAM_ERROR', 'The catalogue source reported an error.');
  }
  return { body, empty: request.isEmpty(data) };
}

module.exports = {
  CatalogError, parseCatalogQuery, catalogPath, loadCatalog, successCache,
  ATSU_TYPES, ATSU_SEARCH_PARAMS, atsuBrowseFilter, ATSU_BASE, MANHWA_BASE, S_MAXAGE, SWR, EMPTY_CACHE, MAX_BYTES, UPSTREAM_TIMEOUT_MS,
};
