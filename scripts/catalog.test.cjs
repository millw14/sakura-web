const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  parseCatalogQuery, catalogPath, S_MAXAGE, SWR, EMPTY_CACHE, ATSU_TYPES, MAX_BYTES,
} = require('../lib/catalog.js');
const catalog = require('../api/catalog.js');
const { createHandler, queryEntries } = catalog;
const mediaProxy = require('../api/media-proxy.js');

const never = async () => { throw new Error('must not fetch'); };
const json = (body, init = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status: init.status || 200,
  headers: { 'Content-Type': 'application/json', ...init.headers },
});

async function run(url, fetchImpl, { method = 'GET', ...options } = {}) {
  const result = { headers: {}, ended: false };
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    setHeader(k, v) { result.headers[k] = v; },
    status(v) { result.status = v; return res; },
    json(v) { result.body = v; result.ended = true; return res; },
    end(chunk) { result.raw = chunk; result.ended = true; return res; },
  });
  await createHandler({ fetchImpl, ...options })({ method, url, query: {} }, res);
  result.listeners = res.eventNames().map((name) => [name, res.listenerCount(name)]);
  return result;
}

const entries = (url) => [...new URLSearchParams(url.slice(url.indexOf('?') + 1))];
const parse = (url) => parseCatalogQuery(entries(url));
const SEARCH_TAIL = 'query_by=title%2CenglishTitle%2CotherNames%2Cauthors&query_by_weights=4%2C3%2C2%2C1'
  + '&num_typos=4%2C3%2C2%2C1&include_fields=id%2Ctitle%2CenglishTitle%2Cposter%2CposterSmall%2CposterMedium'
  + '%2Ctype%2CisAdult%2Cstatus%2Cyear%2CmbRating%2Cpopularity&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse'
  + '+%26%26+type%3A%3D%5BManga%2CManwha%2CManhua%2COEL%5D&infix=off%2Coff%2Cfallback%2Coff';

// The app (sakura-mobile/lib/catalog-client.ts) builds these exact strings;
// its test pins the same list, so the two sides cannot drift apart silently.
const CANONICAL = [
  ['/api/catalog/?s=atsu&op=trending&page=0',
    'https://atsu.moe/api/infinite/trending?page=0&types=Manga%2CManwha%2CManhua%2COEL', 'list'],
  ['/api/catalog/?s=atsu&op=popular&page=50',
    'https://atsu.moe/api/infinite/popular?page=50&types=Manga%2CManwha%2CManhua%2COEL', 'list'],
  ['/api/catalog/?s=atsu&op=detail&id=sVC2A', 'https://atsu.moe/api/manga/page?id=sVC2A', 'detail'],
  ['/api/catalog/?s=atsu&op=chapters&id=sVC2A', 'https://atsu.moe/api/manga/allChapters?mangaId=sVC2A', 'chapters'],
  ['/api/catalog/?s=atsu&op=read&mangaId=sVC2A&chapterId=YrFZ5',
    'https://atsu.moe/api/read/chapter?mangaId=sVC2A&chapterId=YrFZ5', 'pages'],
  ['/api/catalog/?s=atsu&op=search&q=solo+leveling&limit=24',
    `https://atsu.moe/collections/manga/documents/search?q=solo+leveling&${SEARCH_TAIL}&page=1&per_page=24`, 'list'],
  ['/api/catalog/?s=manhwa&op=popular&limit=60', 'http://165.232.83.159/manhwa/v1/popular?limit=60', 'list'],
  ['/api/catalog/?s=manhwa&op=search&q=martial&limit=48&offset=0',
    'http://165.232.83.159/manhwa/v1/search?q=martial&limit=48&offset=0', 'list'],
  ['/api/catalog/?s=manhwa&op=details&id=mr%3Amartial-peak', 'http://165.232.83.159/manhwa/v1/details?id=mr%3Amartial-peak', 'detail'],
  ['/api/catalog/?s=manhwa&op=chapters&id=cz%3Asolo-leveling&limit=2000&offset=2000',
    'http://165.232.83.159/manhwa/v1/chapters?id=cz%3Asolo-leveling&limit=2000&offset=2000', 'chapters'],
  ['/api/catalog/?s=manhwa&op=pages&id=mr%3Amartial-peak&chapterId=chapter-524.5',
    'http://165.232.83.159/manhwa/v1/pages?id=mr%3Amartial-peak&chapterId=chapter-524.5', 'pages'],
];

test('every operation maps to one fixed upstream URL and round-trips to its canonical path', () => {
  assert.equal(ATSU_TYPES, 'Manga,Manwha,Manhua,OEL');
  for (const [url, upstream, ttl] of CANONICAL) {
    const request = parse(url);
    assert.equal(request.upstreamUrl, upstream, url);
    assert.equal(request.ttl, ttl, url);
    assert.equal(request.path, url, url);
    assert.equal(catalogPath(request.source, request.op, request.params), url);
  }
  // Non-Latin slugs are real (the droplet decodes %-escaped mangaread slugs).
  assert.equal(parse('/api/catalog/?s=manhwa&op=details&id=mr%3A%EB%82%98-%ED%98%BC%EC%9E%90').params.id, 'mr:나-혼자');
  assert.equal(parse('/api/catalog/?s=atsu&op=search&q=%E9%AC%BC&limit=1').params.q, '鬼');
});

test('anything but the canonical form of a known operation is refused before any fetch', async () => {
  const refused = [
    '/api/catalog/', '/api/catalog/?s=atsu', '/api/catalog/?op=trending&s=atsu&page=0',
    '/api/catalog/?s=hentai&op=popular&limit=24', '/api/catalog/?s=comics&op=popular&limit=24',
    '/api/catalog/?s=atsu&op=filteredView&page=0', '/api/catalog/?s=__proto__&op=trending&page=0',
    '/api/catalog/?s=atsu&op=constructor&page=0', '/api/catalog/?s=atsu&op=toString&page=0',
    // Parameters: missing, extra, reordered, repeated, renamed.
    '/api/catalog/?s=atsu&op=trending', '/api/catalog/?s=atsu&op=trending&page=0&types=Manga',
    '/api/catalog/?s=atsu&op=trending&page=0&page=1', '/api/catalog/?s=atsu&op=trending&p=0',
    '/api/catalog/?s=atsu&op=read&chapterId=YrFZ5&mangaId=sVC2A', '/api/catalog/?s=atsu&op=search&limit=24&q=solo',
    '/api/catalog/?s=atsu&op=trending&page=0&cb=123', '/api/catalog/?s=atsu&s=atsu&op=trending&page=0',
    // Numbers: one spelling each, inside the upstream's own range.
    '/api/catalog/?s=atsu&op=trending&page=00', '/api/catalog/?s=atsu&op=trending&page=01',
    '/api/catalog/?s=atsu&op=trending&page=%2B1', '/api/catalog/?s=atsu&op=trending&page=-1',
    '/api/catalog/?s=atsu&op=trending&page=1.0', '/api/catalog/?s=atsu&op=trending&page=+1',
    '/api/catalog/?s=atsu&op=trending&page=51', '/api/catalog/?s=atsu&op=trending&page=1e1',
    '/api/catalog/?s=manhwa&op=popular&limit=0', '/api/catalog/?s=manhwa&op=popular&limit=61',
    '/api/catalog/?s=manhwa&op=search&q=a&limit=24&offset=501', '/api/catalog/?s=manhwa&op=chapters&id=mr%3Ax&limit=2001&offset=0',
    '/api/catalog/?s=atsu&op=search&q=a&limit=101',
    // Ids: no paths, hosts, spaces, escapes or other prefixes.
    '/api/catalog/?s=atsu&op=detail&id=', '/api/catalog/?s=atsu&op=detail&id=..%2Fadmin',
    '/api/catalog/?s=atsu&op=detail&id=a%2Fb', '/api/catalog/?s=atsu&op=detail&id=a+b',
    '/api/catalog/?s=atsu&op=detail&id=https%3A%2F%2Fevil.test', `/api/catalog/?s=atsu&op=detail&id=${'a'.repeat(65)}`,
    '/api/catalog/?s=atsu&op=detail&id=a%25b', '/api/catalog/?s=atsu&op=detail&id=a%3Fx%3D1',
    '/api/catalog/?s=manhwa&op=details&id=martial-peak', '/api/catalog/?s=manhwa&op=details&id=xx%3Amartial-peak',
    '/api/catalog/?s=manhwa&op=details&id=mr%3A', '/api/catalog/?s=manhwa&op=details&id=mr%3A-x',
    '/api/catalog/?s=manhwa&op=details&id=mr%3Aa%2F..%2Fb', '/api/catalog/?s=manhwa&op=details&id=mr%3Aa%26x%3D1',
    '/api/catalog/?s=manhwa&op=pages&id=mr%3Aa&chapterId=', '/api/catalog/?s=manhwa&op=pages&id=mr%3Aa&chapterId=a%2Fb',
    // Search text: trimmed, non-empty, bounded, printable.
    '/api/catalog/?s=atsu&op=search&q=&limit=24', '/api/catalog/?s=atsu&op=search&q=+solo&limit=24',
    '/api/catalog/?s=atsu&op=search&q=solo+&limit=24', `/api/catalog/?s=atsu&op=search&q=${'a'.repeat(201)}&limit=24`,
    '/api/catalog/?s=manhwa&op=search&q=a%0Ab&limit=24&offset=0',
  ];
  for (const url of refused) {
    assert.throws(() => parse(url), (e) => e.status === 400 && e.code === 'CATALOG_INVALID_REQUEST', url);
    const result = await run(url, never);
    assert.equal(result.status, 400, url);
    assert.equal(result.headers['Cache-Control'], 'no-store', url);
    assert.equal(result.body.code, 'CATALOG_INVALID_REQUEST', url);
  }
});

test('a good answer is the upstream JSON byte for byte, with per-operation edge caching', async () => {
  const lifetimes = { list: 300, detail: 1800, chapters: 300, pages: 86400 };
  // Chapter lists are the one answer a day-old copy gets visibly wrong (the
  // newest chapter missing for whoever a new-chapter push sent first), so the
  // edge may serve one at most 10 minutes old; everything else a day.
  const stale = { list: 86400, detail: 86400, chapters: 300, pages: 86400 };
  assert.deepEqual(S_MAXAGE, lifetimes);
  assert.deepEqual(SWR, stale);
  for (const [url, upstream, ttl] of CANONICAL) {
    const body = `{"items":[{"id":"x"}],"chapters":[1],"readChapter":{"pages":[1]},"mangaPage":{"id":"x"},"hits":[1],"issues":[1],"pages":[1],"comic":{"id":"x"},"note":"${url}"}`;
    const calls = [];
    const result = await run(url, async (target, init) => {
      calls.push({ target, init });
      return json(body);
    });
    assert.equal(result.status, 200, url);
    assert.equal(result.raw, body, url);
    assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(result.headers['Content-Length'], String(Buffer.byteLength(body)));
    assert.equal(result.headers['Cache-Control'],
      `public, max-age=60, s-maxage=${lifetimes[ttl]}, stale-while-revalidate=${stale[ttl]}, stale-if-error=86400`, url);
    assert.equal(result.headers['Access-Control-Allow-Origin'], undefined, 'same-origin only');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].target, upstream);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    assert.deepEqual(calls[0].init.headers, upstream.startsWith('https://atsu.moe')
      ? { Accept: 'application/json', Referer: 'https://atsu.moe' }
      : { Accept: 'application/json' });
    assert.deepEqual(result.listeners, [], 'the close listener is removed');
  }
  const head = await run(CANONICAL[0][0], async () => json('{"items":[1]}'), { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.raw, undefined);
  assert.match(head.headers['Cache-Control'], /s-maxage=300/);
});

test('empty answers are kept at the edge only briefly and never served stale', async () => {
  const empties = [
    ['/api/catalog/?s=atsu&op=trending&page=50', { items: [] }],
    ['/api/catalog/?s=atsu&op=detail&id=nope', { mangaPage: null, moments: {} }],
    ['/api/catalog/?s=atsu&op=chapters&id=x', { chapters: [] }],
    ['/api/catalog/?s=atsu&op=read&mangaId=x&chapterId=y', { readChapter: { pages: [] } }],
    ['/api/catalog/?s=atsu&op=search&q=zzzz&limit=12', { found: 0, hits: [] }],
    ['/api/catalog/?s=manhwa&op=popular&limit=60', { items: [] }],
    ['/api/catalog/?s=manhwa&op=search&q=zzzz&limit=24&offset=0', {}],
    ['/api/catalog/?s=manhwa&op=details&id=mr%3Ax', { comic: null }],
    ['/api/catalog/?s=manhwa&op=chapters&id=mr%3Ax&limit=2000&offset=0', { issues: [] }],
    ['/api/catalog/?s=manhwa&op=pages&id=mr%3Ax&chapterId=chapter-1', { pages: [] }],
  ];
  for (const [url, body] of empties) {
    const result = await run(url, async () => json(body));
    assert.equal(result.status, 200, url);
    assert.deepEqual(JSON.parse(result.raw), body, url);
    assert.equal(result.headers['Cache-Control'], EMPTY_CACHE, url);
  }
  assert.equal(EMPTY_CACHE, 'public, max-age=0, s-maxage=30');
  // Older droplet builds answered /search with `results`; that is not empty.
  const legacy = await run('/api/catalog/?s=manhwa&op=search&q=a&limit=24&offset=0', async () => json({ results: [{ id: 'mr:a' }] }));
  assert.match(legacy.headers['Cache-Control'], /s-maxage=300/);
});

test('upstream failures map to uncached errors the app can fall back from', async () => {
  const url = '/api/catalog/?s=atsu&op=detail&id=sVC2A';
  const cases = [
    [async () => json({ error: 'nope' }, { status: 404 }), 404, 'CATALOG_NOT_FOUND'],
    [async () => new Response('gone', { status: 410 }), 404, 'CATALOG_NOT_FOUND'],
    [async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } }), 429, 'CATALOG_RATE_LIMITED'],
    [async () => new Response('<html>challenge</html>', { status: 403 }), 502, 'CATALOG_UPSTREAM_ERROR'],
    [async () => new Response('boom', { status: 500 }), 502, 'CATALOG_UPSTREAM_ERROR'],
    [async () => new Response('busy', { status: 503 }), 502, 'CATALOG_UPSTREAM_ERROR'],
    [async () => new Response('<html>Just a moment…</html>', { headers: { 'Content-Type': 'text/html' } }), 502, 'CATALOG_BAD_UPSTREAM'],
    [async () => new Response(''), 502, 'CATALOG_BAD_UPSTREAM'],
    [async () => json('{"items":[1'), 502, 'CATALOG_BAD_UPSTREAM'],
    [async () => json({ error: 'Upstream HTTP 500' }), 502, 'CATALOG_UPSTREAM_ERROR'],
    [async () => { throw new TypeError('fetch failed'); }, 502, 'CATALOG_UPSTREAM_UNAVAILABLE'],
  ];
  for (const [fetchImpl, status, code] of cases) {
    const result = await run(url, fetchImpl);
    assert.equal(result.status, status, code);
    assert.equal(result.body.code, code);
    assert.equal(result.headers['Cache-Control'], 'no-store', code);
    assert.equal(typeof result.body.error, 'string');
    assert.equal(result.raw, undefined, 'no upstream body leaks into an error');
  }
  const limited = await run(url, cases[2][0]);
  assert.equal(limited.headers['Retry-After'], '7');
  const upstream500 = await run(url, cases[4][0]);
  assert.equal(upstream500.body.upstreamStatus, 500);
});

test('a stalled upstream is aborted and answered 504 inside the function deadline', async () => {
  let signal;
  const started = Date.now();
  const result = await run('/api/catalog/?s=manhwa&op=popular&limit=60', (target, init) => new Promise((_, reject) => {
    signal = init.signal;
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  }), { timeoutMs: 30 });
  assert.equal(result.status, 504);
  assert.equal(result.body.code, 'CATALOG_TIMEOUT');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 2000);
  // A body that stalls after the headers is cut off by the same deadline.
  const stalledBody = await run('/api/catalog/?s=manhwa&op=popular&limit=60', async (target, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"items":['));
      init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
    },
  }), { headers: { 'Content-Type': 'application/json' } }), { timeoutMs: 30 });
  assert.equal(stalledBody.status, 504);
  const { UPSTREAM_TIMEOUT_MS } = require('../lib/catalog.js');
  assert.ok(UPSTREAM_TIMEOUT_MS < 10_000, 'ends before the 10 s default function limit');
});

test('oversized answers are refused, whether declared or streamed', async () => {
  const url = '/api/catalog/?s=atsu&op=chapters&id=sVC2A';
  const declared = await run(url, async () => new Response('{}', { headers: { 'Content-Length': String(MAX_BYTES + 1) } }));
  assert.equal(declared.status, 502);
  assert.equal(declared.body.code, 'CATALOG_TOO_LARGE');
  let cancelled = false;
  const streamed = await run(url, async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(64)); },
    cancel() { cancelled = true; },
  })), { maxBytes: 1000 });
  assert.equal(streamed.status, 502);
  assert.equal(streamed.body.code, 'CATALOG_TOO_LARGE');
  assert.equal(streamed.headers['Cache-Control'], 'no-store');
  assert.equal(cancelled, true, 'the upstream read is cancelled');
  assert.ok(MAX_BYTES < 4.5 * 1024 * 1024, 'below the Vercel response limit');
});

test('only GET and HEAD; the function is never a CORS endpoint', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const result = await run(CANONICAL[0][0], never, { method });
    assert.equal(result.status, 405, method);
    assert.equal(result.headers.Allow, 'GET, HEAD');
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  }
});

test('the raw query decides order and duplicates; req.query is only a fallback', () => {
  assert.deepEqual(queryEntries({ url: '/api/catalog/?s=atsu&op=trending&page=0&page=1', query: { s: 'x' } }),
    [['s', 'atsu'], ['op', 'trending'], ['page', '0'], ['page', '1']]);
  assert.deepEqual(queryEntries({ url: '/api/catalog/', query: { s: 'atsu', op: 'trending', page: ['0', '1'] } }),
    [['s', 'atsu'], ['op', 'trending'], ['page', '0'], ['page', '1']]);
  assert.deepEqual(queryEntries({}), []);
});

test('media-proxy keeps immutable droplet images at the edge for a week, everything else as before', async () => {
  const image = '/manhwa/v1/img?u=https://www.mangaread.org/wp-content/uploads/2019/12/555.jpg';
  const send = async (path, response, method = 'GET') => {
    const result = { headers: {} };
    const res = {
      setHeader(k, v) { result.headers[k] = v; },
      status(v) { result.status = v; return res; },
      json(v) { result.body = v; return res; },
      write() { return true; },
      end() { return res; },
    };
    await mediaProxy.createHandler({ fetchImpl: async () => response() })({ method, query: { path }, headers: {} }, res);
    return result;
  };
  const droplet = (extra = {}, status = 200) => () => new Response(status === 206 ? 'part' : 'jpeg', {
    status,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable', ...extra },
  });
  const WEEK = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
  for (const source of ['manhwa', 'comics', 'hentai']) {
    assert.equal((await send(image.replace('manhwa', source), droplet())).headers['Cache-Control'], WEEK, source);
  }
  assert.equal((await send(image, droplet(), 'HEAD')).headers['Cache-Control'], WEEK);
  // Not marked immutable by the droplet, not an image, a partial body, or not
  // a scraper image at all: the hour-long cache stays.
  assert.equal((await send(image, droplet({ 'Cache-Control': 'public, max-age=60' }))).headers['Cache-Control'], 'public, max-age=3600');
  assert.equal((await send(image, droplet({ 'Cache-Control': 'public, max-age=60, not-immutable' }))).headers['Cache-Control'], 'public, max-age=3600');
  assert.equal((await send(image, droplet({ 'Content-Type': 'text/html' }))).headers['Cache-Control'], 'public, max-age=3600');
  assert.equal((await send(image, droplet({}, 206))).headers['Cache-Control'], 'public, max-age=3600');
  assert.equal((await send('/psyopanime/thumbs/a.jpg', droplet())).headers['Cache-Control'], 'public, max-age=3600');
  // Failures are still never cached.
  for (const status of [404, 502]) {
    const failed = await send(image, () => new Response('no', { status, headers: { 'Cache-Control': 'public, immutable' } }));
    assert.equal(failed.headers['Cache-Control'], 'no-store', String(status));
  }
});

test('vercel.json pins functions to one European region, which every plan allows', () => {
  const config = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.deepEqual(config.regions, ['fra1']);
  assert.equal(config.functions, undefined, 'per-function regions would need a multi-region plan');
  assert.equal(config.trailingSlash, true, 'the app calls /api/catalog/ with its trailing slash');
});

// Opt-in: CATALOG_LIVE=1 node --test scripts/catalog.test.cjs
test('live: each operation answers from the real upstreams', { skip: !process.env.CATALOG_LIVE }, async () => {
  const handler = createHandler();
  const live = async (url) => {
    const result = { headers: {} };
    const res = Object.assign(new EventEmitter(), {
      setHeader(k, v) { result.headers[k] = v; },
      status(v) { result.status = v; return res; },
      json(v) { result.body = v; return res; },
      end(chunk) { result.raw = chunk; return res; },
    });
    const started = Date.now();
    await handler({ method: 'GET', url, query: {} }, res);
    result.ms = Date.now() - started;
    result.data = result.raw ? JSON.parse(result.raw) : result.body;
    return result;
  };
  const trending = await live('/api/catalog/?s=atsu&op=trending&page=0');
  assert.equal(trending.status, 200, JSON.stringify(trending.body));
  const id = trending.data.items[0].id;
  const chapters = await live(`/api/catalog/?s=atsu&op=chapters&id=${id}`);
  assert.ok(chapters.data.chapters.length > 0);
  const read = await live(`/api/catalog/?s=atsu&op=read&mangaId=${id}&chapterId=${chapters.data.chapters[0].id}`);
  assert.ok(read.data.readChapter.pages.length > 0);
  assert.ok((await live(`/api/catalog/?s=atsu&op=detail&id=${id}`)).data.mangaPage.title);
  assert.ok((await live('/api/catalog/?s=atsu&op=search&q=solo&limit=12')).data.hits.length > 0);
  const popular = await live('/api/catalog/?s=manhwa&op=popular&limit=60');
  assert.ok(popular.data.items.length > 0);
  const mw = encodeURIComponent(popular.data.items[0].id);
  assert.ok((await live(`/api/catalog/?s=manhwa&op=details&id=${mw}`)).data.comic.id);
  const mwChapters = await live(`/api/catalog/?s=manhwa&op=chapters&id=${mw}&limit=2000&offset=0`);
  assert.ok(mwChapters.data.issues.length > 0);
  const chapterId = encodeURIComponent(mwChapters.data.issues[0].id);
  assert.ok((await live(`/api/catalog/?s=manhwa&op=pages&id=${mw}&chapterId=${chapterId}`)).data.pages.length > 0);
  assert.ok((await live('/api/catalog/?s=manhwa&op=search&q=martial&limit=48&offset=0')).data.items.length > 0);
});
