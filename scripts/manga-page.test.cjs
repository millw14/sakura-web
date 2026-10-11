const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { validateMangaPageUrl, MAX_BYTES } = require('../lib/manga-page.js');
const { createHandler } = require('../api/manga-page.js');

const page = 'https://cdn.atsu.moe/static/pages/WfNS4/3ZJkaVrj/0.webp';
const webp = (size = 2048) => {
  const bytes = Buffer.alloc(size);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  return bytes;
};
const avif = () => {
  const bytes = Buffer.alloc(512);
  bytes.write('ftypavif', 4, 'ascii');
  return bytes;
};
const image = (bytes, type = 'image/webp', extra = {}) =>
  new Response(bytes, { headers: { 'Content-Type': type, 'Content-Length': String(bytes.length), ...extra } });

async function run(query, fetchImpl, { method = 'GET', blockWrites = false, disconnectAfterMs, ...options } = {}) {
  const result = { headers: {}, chunks: [], ended: false, destroyed: false };
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    setHeader(k, v) { result.headers[k] = v; },
    status(v) { result.status = v; return res; },
    json(v) { result.body = v; result.ended = true; return res; },
    write(chunk) { result.chunks.push(Buffer.from(chunk)); return !blockWrites; },
    end() { result.ended = true; return res; },
    destroy() { result.destroyed = true; res.destroyed = true; res.emit('close'); },
  });
  const disconnect = disconnectAfterMs == null ? null : setTimeout(() => res.destroy(), disconnectAfterMs);
  try { await createHandler({ fetchImpl, ...options })({ method, query }, res); }
  finally { clearTimeout(disconnect); }
  result.listeners = res.eventNames().map(name => [name, res.listenerCount(name)]);
  result.bytes = Buffer.concat(result.chunks);
  return result;
}

test('only canonical cdn.atsu.moe page paths are accepted; atsu.moe maps to the CDN', () => {
  assert.equal(validateMangaPageUrl(page).href, page);
  assert.equal(validateMangaPageUrl('https://cdn.atsu.moe/static/pages/a_1/B-2/hash.avif').hostname, 'cdn.atsu.moe');
  assert.equal(validateMangaPageUrl('https://atsu.moe/static/pages/WfNS4/3ZJkaVrj/0.webp').href, page);
  for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'AVIF']) {
    assert.doesNotThrow(() => validateMangaPageUrl(`https://cdn.atsu.moe/static/pages/a/b/1.${ext}`));
  }
  for (const url of [undefined, '', [page], 42, 'http://cdn.atsu.moe/static/pages/a/b/0.webp',
    'https://CDN.atsu.moe/static/pages/a/b/0.webp', 'https://cdn.atsu.moe.evil.test/static/pages/a/b/0.webp',
    'https://evil.test/static/pages/a/b/0.webp', 'https://www.atsu.moe/static/pages/a/b/0.webp',
    'https://cdn.atsu.moe:443/static/pages/a/b/0.webp', 'https://cdn.atsu.moe:8443/static/pages/a/b/0.webp',
    'https://user:pass@cdn.atsu.moe/static/pages/a/b/0.webp', `${page}?x=1`, `${page}?`, `${page}#frag`,
    'https://cdn.atsu.moe/static/pages/a/b/../../../posters/x.webp', 'https://cdn.atsu.moe/static/pages/a/%2e%2e/b/0.webp',
    'https://cdn.atsu.moe/static/pages/a/b/c/0.webp', 'https://cdn.atsu.moe/static/pages/a/0.webp',
    'https://cdn.atsu.moe/static/posters/a.webp', 'https://cdn.atsu.moe/static/pages/a/b/x.svg',
    'https://cdn.atsu.moe/static/pages/a/b/.webp', 'https://cdn.atsu.moe/static/pages/a/b/0.webp ',
    'https://cdn.atsu.moe\\static/pages/a/b/0.webp', `https://cdn.atsu.moe/static/pages/a/b/${'x'.repeat(2100)}.webp`]) {
    assert.throws(() => validateMangaPageUrl(url), (e) => e.status === 400 && e.code === 'INVALID_PAGE_URL', String(url).slice(0, 80));
  }
});

test('a valid page streams with its upstream type, CORS and year-long immutable caching', async () => {
  const bytes = webp(200_000);
  const calls = [];
  const result = await run({ u: page }, async (url, init) => {
    calls.push({ url, init });
    return image(bytes);
  });
  assert.equal(result.status, 200);
  assert.ok(result.bytes.equals(bytes));
  assert.equal(result.ended, true);
  assert.equal(result.headers['Content-Type'], 'image/webp');
  assert.equal(result.headers['Content-Length'], String(bytes.length));
  assert.equal(result.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(result.headers['Cache-Control'], 'public, max-age=31536000, s-maxage=31536000, immutable');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, page);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.deepEqual(Object.keys(calls[0].init.headers), ['Accept'], 'no cookies, referer or browser fetch metadata');
  assert.match(calls[0].init.headers.Accept, /^image\//);
});

test('atsu.moe page URLs are fetched from the CDN', async () => {
  let fetched;
  const result = await run({ u: 'https://atsu.moe/static/pages/WfNS4/3ZJkaVrj/0.webp' }, async (url) => {
    fetched = url;
    return image(avif(), 'image/avif');
  });
  assert.equal(result.status, 200);
  assert.equal(fetched, page);
  assert.equal(result.headers['Content-Type'], 'image/avif');
});

test('HEAD answers headers only; OPTIONS, other methods and other parameters never fetch', async () => {
  const head = await run({ u: page }, async () => image(webp()), { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.bytes.length, 0);
  assert.equal(head.headers['Content-Type'], 'image/webp');
  const never = async () => { throw new Error('must not fetch'); };
  assert.equal((await run({ u: page }, never, { method: 'OPTIONS' })).status, 204);
  const post = await run({ u: page }, never, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD, OPTIONS');
  for (const query of [{}, { u: [page, page] }, { u: page, v: '1' }, { url: page }, { u: 'https://evil.test/x.webp' }]) {
    const result = await run(query, never);
    assert.equal(result.status, 400, JSON.stringify(query));
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(typeof result.body.error, 'string');
  }
});

test('upstream failures map to honest, uncached statuses', async () => {
  const cases = [
    [404, 404, 'PAGE_NOT_FOUND'], [410, 404, 'PAGE_NOT_FOUND'], [403, 502, 'PAGE_SOURCE_UNAVAILABLE'],
    [500, 502, 'PAGE_SOURCE_UNAVAILABLE'], [204, 502, 'PAGE_SOURCE_UNAVAILABLE'],
  ];
  for (const [upstream, status, code] of cases) {
    const result = await run({ u: page }, async () => new Response(upstream === 204 ? null : 'x', { status: upstream }));
    assert.equal(result.status, status, `upstream ${upstream}`);
    assert.equal(result.body.code, code);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
  const limited = await run({ u: page }, async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '7');
  const network = await run({ u: page }, async () => { throw new TypeError('fetch failed'); });
  assert.equal(network.status, 502);
});

test('non-images are refused even when labelled as images', async () => {
  for (const [body, type] of [['<html>blocked</html>', 'text/html'], ['<svg onload="x()"/>', 'image/svg+xml'],
    ['<html>blocked</html>', 'image/webp'], [Buffer.alloc(0), 'image/webp']]) {
    const result = await run({ u: page }, async () => new Response(body, { headers: { 'Content-Type': type } }));
    assert.equal(result.status, 415, `${type}: ${String(body).slice(0, 20)}`);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

test('oversized pages are refused up front, or cut off mid-stream when undeclared', async () => {
  const declared = await run({ u: page }, async () => new Response(webp(), {
    headers: { 'Content-Type': 'image/webp', 'Content-Length': String(MAX_BYTES + 1) },
  }));
  assert.equal(declared.status, 413);

  const big = webp(4096);
  const streamed = await run({ u: page }, async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(big.subarray(0, 1024));
      controller.enqueue(big.subarray(1024));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'image/webp' } }), { maxBytes: 2000 });
  assert.equal(streamed.destroyed, true, 'a truncated image must never complete as a 200');
  assert.equal(streamed.ended, false);
  assert.equal(streamed.headers['Content-Length'], undefined);
});

test('a content-encoded body never forwards its encoded length', async () => {
  const bytes = webp();
  const result = await run({ u: page }, async () => new Response(bytes, {
    headers: { 'Content-Type': 'image/webp', 'Content-Length': '17', 'Content-Encoding': 'gzip' },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Length'], undefined);
});

test('redirects are followed only to other allowed page URLs, at most three times', async () => {
  const other = 'https://cdn.atsu.moe/static/pages/WfNS4/3ZJkaVrj/1.webp';
  let calls = 0;
  const ok = await run({ u: page }, async (url) => {
    calls += 1;
    return calls === 1 ? new Response(null, { status: 302, headers: { Location: './1.webp' } }) : (assert.equal(url, other), image(webp()));
  });
  assert.equal(ok.status, 200);
  assert.equal(calls, 2);
  for (const location of ['https://evil.test/static/pages/a/b/0.webp', 'https://cdn.atsu.moe/static/posters/x.webp', '']) {
    const result = await run({ u: page }, async () => new Response(null, { status: 301, headers: location ? { Location: location } : {} }));
    assert.equal(result.status, 502, location);
    assert.equal(result.body.code, 'PAGE_REDIRECT');
  }
  let loops = 0;
  const loop = await run({ u: page }, async () => { loops += 1; return new Response(null, { status: 307, headers: { Location: page } }); });
  assert.equal(loop.status, 502);
  assert.equal(loops, 4);
});

test('a slow upstream times out as an uncached 504', async () => {
  const result = await run({ u: page }, (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), { timeoutMs: 30 });
  assert.equal(result.status, 504);
  assert.equal(result.body.code, 'PAGE_TIMEOUT');
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('a stalled client under backpressure still respects the request deadline', { timeout: 1000 }, async () => {
  const result = await run({ u: page }, async () => image(webp()), { timeoutMs: 20, blockWrites: true });
  assert.equal(result.destroyed, true);
  assert.equal(result.ended, false);
  assert.deepEqual(result.listeners, []);
});

test('client disconnect cancels an upstream request immediately', { timeout: 1000 }, async () => {
  let aborted = false;
  const result = await run({ u: page }, (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
  }), { timeoutMs: 500, disconnectAfterMs: 20 });
  assert.equal(aborted, true);
  assert.equal(result.ended, false, 'do not write an error response to a disconnected client');
  assert.deepEqual(result.listeners, []);
});

test('a mismatched image length never finishes successfully for downstream caches', async () => {
  for (const declared of [1024, 4096]) {
    const result = await run({ u: page }, async () => image(webp(2048), 'image/webp', { 'Content-Length': String(declared) }));
    assert.equal(result.destroyed, true);
    assert.equal(result.ended, false);
  }
});
