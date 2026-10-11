const assert = require('node:assert/strict');
const { test } = require('node:test');
const sharp = require('sharp');
const { fetchReaderImage, validateReaderUrl, MAX_INPUT_BYTES, TIMEOUT_MS } = require('../lib/reader-image.js');
const { createHandler } = require('../api/reader-image.js');

const source = 'https://cdn.atsu.moe/static/pages/sVC2A/9L82jefe/0.webp';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const response = (bytes = png, type = 'image/png') => new Response(bytes, { headers: { 'Content-Type': type } });

async function runHandler(query, options, method = 'GET') {
  const result = { headers: {} };
  const res = {
    setHeader(k, v) { result.headers[k] = v; },
    status(v) { result.status = v; return res; },
    json(v) { result.body = v; return res; },
    end(v) { result.body = v; return res; },
  };
  await createHandler((url) => fetchReaderImage(url, options))({ query, method }, res);
  return result;
}

test('only canonical public chapter page URLs are accepted', () => {
  assert.equal(validateReaderUrl(source).href, source);
  for (const extension of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']) {
    assert.equal(validateReaderUrl(`https://cdn.atsu.moe/static/pages/A-_1/B-_2/12.${extension}`).hostname, 'cdn.atsu.moe');
  }
  for (const url of [undefined, [source], '', 'https:' + 'a'.repeat(2048),
    source.replace('https:', 'http:'), source.replace('cdn.atsu.moe', 'atsu.moe'),
    source.replace('cdn.atsu.moe', 'cdn.atsu.moe.evil.test'), source.replace('cdn.atsu.moe', '127.0.0.1'),
    source.replace('cdn.atsu.moe', 'cdn.atsu.moe:443'), source.replace('cdn.atsu.moe', 'cdn.atsu.moe:8443'),
    source.replace('cdn.atsu.moe', 'secret@cdn.atsu.moe'), source.replace('cdn.atsu.moe', 'CDN.atsu.moe'),
    `${source}?token=x`, `${source}?`, `${source}#`, `${source}#hash`, `${source} `,
    source.replace('/static/', '/private/../static/'), source.replace('/static/', '/%73tatic/'),
    source.replace('/static/', '\\static/'), source.replace('/0.webp', '/name.webp'),
    source.replace('/0.webp', '/nested/0.webp'), source.replace('.webp', '.svg'),
    'https://cdn.atsu.moe/static/posters/cover.jpg']) {
    assert.throws(() => validateReaderUrl(url), (e) => e.status === 400, String(url));
  }
  assert.equal(MAX_INPUT_BYTES, 16 * 1024 * 1024);
  assert.equal(TIMEOUT_MS, 20_000);
});

test('all supported raster types retain exact bytes and original resolution', async () => {
  for (const [format, type] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['gif', 'image/gif'], ['avif', 'image/avif']]) {
    const original = await sharp({ create: { width: 900, height: 1400, channels: 3, background: '#dc2020' } }).toFormat(format).toBuffer();
    const result = await runHandler({ url: source }, { fetchImpl: async () => response(original, `${type}; charset=binary`) });
    assert.equal(result.status, 200, format);
    assert.equal(result.headers['Content-Type'], type);
    assert.equal(result.headers['Content-Length'], String(original.length));
    assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(result.headers['Cache-Control'], 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    assert.deepEqual(result.body, original);
    const metadata = await sharp(result.body).metadata();
    assert.equal(metadata.width, 900);
    assert.equal(metadata.height, 1400);
  }
});

test('redirects stay on allowed page paths without credentials or spoofed headers', async () => {
  const calls = [];
  const result = await fetchReaderImage(source, { fetchImpl: async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(Object.keys(init.headers), ['Accept']);
    return calls.length === 1 ? new Response(null, { status: 302, headers: { Location: './1.webp' } }) : response();
  } });
  assert.deepEqual(calls, [source, source.replace('/0.webp', '/1.webp')]);
  assert.deepEqual(result.bytes, png);
  for (const destination of ['http://cdn.atsu.moe/static/pages/a/b/0.webp', 'https://127.0.0.1/0.webp',
    '/static/posters/a.webp', 'https://secret@cdn.atsu.moe/static/pages/a/b/0.webp',
    'https://cdn.atsu.moe:443/static/pages/a/b/0.webp', '//cdn.atsu.moe:443/static/pages/a/b/0.webp',
    '/static/pages/a/b/%30.webp', '/static/pages/a/b/0.webp?token=x', '/static/pages/a/b/0.webp#x']) {
    let fetched = 0;
    let cancelled = false;
    await assert.rejects(fetchReaderImage(source, { fetchImpl: async () => {
      fetched++;
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 302, headers: { Location: destination } });
    } }), (e) => e.status === 502 && e.code === 'READER_REDIRECT');
    assert.equal(fetched, 1);
    assert.equal(cancelled, true);
  }
});

test('missing redirect destinations and loops stop without unbounded requests', async () => {
  let calls = 0;
  await assert.rejects(fetchReaderImage(source, { fetchImpl: async () => {
    calls++;
    return new Response(null, { status: 307, headers: { Location: source } });
  } }), (e) => e.code === 'READER_REDIRECT');
  assert.equal(calls, 4);
  await assert.rejects(fetchReaderImage(source, { fetchImpl: async () => new Response(null, { status: 302 }) }), (e) => e.code === 'READER_REDIRECT');
});

test('source errors preserve denial and missing-page statuses without retries or caching', async () => {
  for (const upstream of [403, 404, 410, 429, 401, 500, 503, 206]) {
    let calls = 0;
    let cancelled = false;
    const result = await runHandler({ url: source }, { fetchImpl: async () => {
      calls++;
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: upstream });
    } });
    assert.equal(result.status, [403, 404, 410, 429].includes(upstream) ? upstream : 502);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
});

test('unsupported MIME, missing signatures, and mismatched signatures are rejected', async () => {
  for (const [bytes, type] of [[png, 'text/html'], [png, 'image/jpeg'], [Buffer.from('<html>error</html>'), 'image/png'],
    [Buffer.from('<svg/>'), 'image/svg+xml'], [Buffer.from('RIFF'), 'image/webp'], [Buffer.alloc(0), 'image/png'],
    [Buffer.from('0000ftypxxxxavifxxxx'), 'image/avif']]) {
    const result = await runHandler({ url: source }, { fetchImpl: async () => response(bytes, type) });
    assert.equal(result.status, 415);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

test('declared and streamed oversized images are cancelled before unbounded buffering', async () => {
  let cancelled = false;
  const oversized = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(17)); }, cancel() { cancelled = true; } });
  const streamed = await runHandler({ url: source }, { maxInputBytes: 16, fetchImpl: async () => new Response(oversized, {
    headers: { 'Content-Type': 'image/png', 'Content-Length': '1' },
  }) });
  assert.equal(streamed.status, 413);
  assert.equal(streamed.headers['Cache-Control'], 'no-store');
  assert.equal(cancelled, true);
  let read = false;
  let declaredCancelled = false;
  const declared = await runHandler({ url: source }, { fetchImpl: async () => ({
    status: 200, headers: new Headers({ 'Content-Type': 'image/png', 'Content-Length': String(MAX_INPUT_BYTES + 1) }),
    body: { cancel: async () => { declaredCancelled = true; }, getReader: () => { read = true; throw new Error('must not read'); } },
  }) });
  assert.equal(declared.status, 413);
  assert.equal(read, false);
  assert.equal(declaredCancelled, true);
});

test('one deadline aborts stalled headers and cancels stalled body reads', async () => {
  for (const stallBody of [false, true]) {
    let aborted = false;
    let cancelled = false;
    const started = Date.now();
    const result = await runHandler({ url: source }, { timeoutMs: 15, fetchImpl: async (_url, init) => {
      init.signal.addEventListener('abort', () => { aborted = true; });
      if (!stallBody) return new Promise(() => {});
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'image/png' } });
    } });
    assert.equal(result.status, 504);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.ok(Date.now() - started < 1000);
    assert.equal(aborted, true);
    if (stallBody) assert.equal(cancelled, true);
  }
});

test('invalid requests never fetch, and HEAD omits success and error bodies', async () => {
  let calls = 0;
  const mustNotFetch = { fetchImpl: async () => { calls++; throw new Error('must not fetch'); } };
  for (const query of [{}, { url: [source] }, { url: source, width: '512' }, { url: source, token: 'x' }]) {
    const result = await runHandler(query, mustNotFetch);
    assert.equal(result.status, 400);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
  assert.equal((await runHandler({ url: source }, mustNotFetch, 'POST')).status, 405);
  assert.equal((await runHandler({ url: source }, mustNotFetch, 'OPTIONS')).status, 204);
  assert.equal(calls, 0);
  const head = await runHandler({ url: source }, { fetchImpl: async () => response() }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, undefined);
  assert.equal(head.headers['Content-Length'], String(png.length));
  const errorHead = await runHandler({ url: source }, { fetchImpl: async () => new Response(null, { status: 403 }) }, 'HEAD');
  assert.equal(errorHead.status, 403);
  assert.equal(errorHead.body, undefined);
  assert.equal(errorHead.headers['Cache-Control'], 'no-store');
});

test('network failures are not cached and do not expose internal errors', async () => {
  const result = await runHandler({ url: source }, { fetchImpl: async () => { throw new Error('internal transport detail'); } });
  assert.equal(result.status, 502);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.doesNotMatch(result.body.error, /internal transport/);
});
