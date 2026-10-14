const assert = require('node:assert/strict');
const { test } = require('node:test');
const mediaProxy = require('../api/media-proxy.js');
const { createHandler } = mediaProxy;

const MEDIA_BASE = 'https://165-232-83-159.nip.io';
const cover = '/manhwa/v1/img?u=https://cdn.atsu.moe/static/pages/SL3w0r/bf205ee5cbeab517.avif';
const privateEpisode = `/media/v1/creator/private/${'A'.repeat(44)}/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}/ep.mp4?token=${'a'.repeat(72)}`;
const never = async () => { throw new Error('must not fetch'); };

async function run(query, fetchImpl, { method = 'GET', headers = {} } = {}) {
  const result = { headers: {}, chunks: [], ended: false };
  const res = {
    setHeader(k, v) { result.headers[k] = v; },
    status(v) { result.status = v; return res; },
    json(v) { result.body = v; result.ended = true; return res; },
    write(chunk) { result.chunks.push(Buffer.from(chunk)); return true; },
    end() { result.ended = true; return res; },
  };
  await createHandler({ fetchImpl })({ method, query, headers }, res);
  result.bytes = Buffer.concat(result.chunks);
  return result;
}

test('the default export is a ready handler and createHandler is exposed', () => {
  assert.equal(typeof mediaProxy, 'function');
  assert.equal(typeof createHandler, 'function');
});

test('a 200 streams through with its type and the hour-long public cache', async () => {
  const bytes = Buffer.from('image-bytes');
  const calls = [];
  const result = await run({ path: cover }, async (url, init) => {
    calls.push({ url, init });
    return new Response(bytes, { headers: { 'Content-Type': 'image/avif', 'Content-Length': String(bytes.length) } });
  });
  assert.equal(result.status, 200);
  assert.ok(result.bytes.equals(bytes));
  assert.equal(result.ended, true);
  assert.equal(result.headers['Content-Type'], 'image/avif');
  assert.equal(result.headers['Content-Length'], String(bytes.length));
  assert.equal(result.headers['Cache-Control'], 'public, max-age=3600');
  assert.equal(result.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${MEDIA_BASE}${cover}`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Range, undefined);
});

test('the app\'s double-encoded fallback route reaches the droplet for both atsu page shapes', async () => {
  // getWebMangaPageFallbackUrl builds ?path=encodeURIComponent('/manhwa/v1/img?u=' + encodeURIComponent(cdn));
  // Vercel decodes the query once, so the handler sees the inner encoding.
  for (const cdn of ['https://cdn.atsu.moe/static/pages/SL3w0r/bf205ee5cbeab517.avif',
    'https://cdn.atsu.moe/static/pages/v8Kbg/P7297ifE/0.webp']) {
    let fetched;
    const result = await run({ path: `/manhwa/v1/img?u=${encodeURIComponent(cdn)}` }, async (url) => {
      fetched = url;
      return new Response('x', { headers: { 'Content-Type': 'image/webp' } });
    });
    assert.equal(result.status, 200, cdn);
    assert.equal(fetched, `${MEDIA_BASE}/manhwa/v1/img?u=${cdn}`);
  }
});

test('a range request is forwarded and its 206 is cacheable like any success', async () => {
  let range;
  const result = await run({ path: '/psyopanime/videos/ep1.mp4' }, async (url, init) => {
    range = init.headers.Range;
    return new Response('part', {
      status: 206,
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-3/100', 'Content-Length': '4', 'Accept-Ranges': 'bytes' },
    });
  }, { headers: { range: 'bytes=0-3' } });
  assert.equal(range, 'bytes=0-3');
  assert.equal(result.status, 206);
  assert.equal(result.headers['Content-Range'], 'bytes 0-3/100');
  assert.equal(result.headers['Accept-Ranges'], 'bytes');
  assert.equal(result.headers['Cache-Control'], 'public, max-age=3600');
  assert.equal(result.bytes.toString(), 'part');
});

test('upstream errors pass through with their status and body but are never cached', async () => {
  for (const status of [400, 403, 404, 410, 429, 500, 502, 503]) {
    for (const method of ['GET', 'HEAD']) {
      const result = await run({ path: cover }, async () => new Response(method === 'HEAD' ? null : 'nope', { status }), { method });
      assert.equal(result.status, status, `${method} ${status}`);
      assert.equal(result.headers['Cache-Control'], 'no-store', `${method} ${status}`);
      assert.equal(result.bytes.toString(), method === 'HEAD' ? '' : 'nope');
      assert.equal(result.ended, true);
    }
  }
});

test('private creator media stays private on success and uncached on failure', async () => {
  const ok = await run({ path: privateEpisode }, async () => new Response('v', { headers: { 'Content-Type': 'video/mp4' } }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['Cache-Control'], 'private, no-store');
  const denied = await run({ path: privateEpisode }, async () => new Response('expired', { status: 403 }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers['Cache-Control'], 'no-store');
});

test('the function\'s own errors are uncached and never fetch; OPTIONS is a bare 204', async () => {
  for (const query of [{}, { path: '/api/media-proxy/?path=x' }, { path: '/etc/passwd' }, { path: 'manhwa/v1/img?u=https://x' },
    { path: ['/psyopanime/videos/a.mp4'] }]) {
    const result = await run(query, never);
    assert.equal(result.status, 400, JSON.stringify(query));
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(result.body.error, 'Invalid Sakura media path.');
  }
  const post = await run({ path: cover }, never, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers['Cache-Control'], 'no-store');
  const options = await run({ path: cover }, never, { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.equal(options.headers['Access-Control-Allow-Methods'], 'GET,HEAD,OPTIONS');
  assert.equal(options.headers['Access-Control-Allow-Headers'], 'Range, Content-Type');
});

test('an unreachable droplet is an uncached 502, not an escaped rejection', async () => {
  for (const method of ['GET', 'HEAD']) {
    const result = await run({ path: cover }, async () => { throw new TypeError('fetch failed'); }, { method });
    assert.equal(result.status, 502, method);
    assert.equal(result.headers['Cache-Control'], 'no-store', method);
    assert.equal(result.body.error, 'Sakura media is unavailable.');
  }
});

test('a body that fails mid-stream drops the connection instead of ending a truncated cacheable 200', async () => {
  let sent = false;
  const body = new ReadableStream({
    pull(controller) {
      if (sent) return controller.error(new Error('upstream reset'));
      sent = true;
      controller.enqueue(new TextEncoder().encode('first-half'));
    },
  });
  const result = { headers: {}, chunks: [], ended: false, destroyed: false };
  const res = {
    setHeader(k, v) { result.headers[k] = v; },
    status(v) { result.status = v; return res; },
    write(chunk) { result.chunks.push(Buffer.from(chunk)); return true; },
    end() { result.ended = true; return res; },
    destroy() { result.destroyed = true; },
  };
  await createHandler({ fetchImpl: async () => new Response(body, { headers: { 'Content-Type': 'image/avif', 'Content-Length': '20' } }) })(
    { method: 'GET', query: { path: cover }, headers: {} }, res);
  assert.equal(result.status, 200);
  assert.equal(Buffer.concat(result.chunks).toString(), 'first-half');
  assert.equal(result.ended, false);
  assert.equal(result.destroyed, true);
});

test('a client that goes away stops the upstream read instead of draining the whole file', async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({
    // A long file: 50 chunks, of which the client only takes three.
    pull(controller) {
      pulls += 1;
      if (pulls > 50) return controller.close();
      controller.enqueue(new Uint8Array(1024));
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const res = {
    destroyed: false,
    writes: 0,
    setHeader() {},
    status() { return res; },
    write() { res.writes += 1; if (res.writes === 3) res.destroyed = true; return true; },
    end() { res.ended = true; },
  };
  await createHandler({ fetchImpl: async () => new Response(body, { headers: { 'Content-Type': 'video/mp4' } }) })(
    { method: 'GET', query: { path: '/psyopanime/videos/ep1.mp4' }, headers: {} }, res);
  assert.equal(res.writes, 3);
  assert.equal(res.ended, undefined);
  assert.ok(pulls <= 4, `pulled ${pulls} chunks`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('a missing upstream content type falls back to one inferred from the path', async () => {
  for (const [path, type] of [['/psyopanime/thumbs/a.jpg', 'image/jpeg'], ['/2heanime/videos/a.mov', 'video/quicktime'],
    ['/2heanime/manifest.json', 'application/json'], ['/psyopanime/videos/a.mp4', 'video/mp4']]) {
    const result = await run({ path }, async () => {
      const response = new Response('x');
      response.headers.delete('content-type');
      return response;
    });
    assert.equal(result.headers['Content-Type'], type, path);
  }
});

test('scraper images the droplet marks immutable stay a week at the edge; 18+ pages keep the browser hour', async () => {
  const immutable = (type = 'image/avif') => async () => new Response('x', {
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  const week = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
  assert.equal((await run({ path: cover }, immutable())).headers['Cache-Control'], week);
  assert.equal((await run({ path: '/comics/v1/img?u=https://archive.org/a.jpg' }, immutable('image/jpeg'))).headers['Cache-Control'], week);
  assert.equal((await run({ path: '/hentai/v1/img?u=https://x.test/a.webp' }, immutable('image/webp'))).headers['Cache-Control'],
    'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400');
  // Anything the droplet does not vouch for, or that is not an image, keeps the hour.
  assert.equal((await run({ path: cover }, async () => new Response('x', { headers: { 'Content-Type': 'image/avif' } }))).headers['Cache-Control'],
    'public, max-age=3600');
  assert.equal((await run({ path: cover }, immutable('text/html'))).headers['Cache-Control'], 'public, max-age=3600');
});
