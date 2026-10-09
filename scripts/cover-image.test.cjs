const assert = require('node:assert/strict');
const { test } = require('node:test');
const sharp = require('sharp');
const { createThumbnail, validateCoverUrl, parseWidth, MAX_INPUT_BYTES, MAX_INPUT_PIXELS } = require('../lib/cover-image.js');
const { createHandler } = require('../api/cover-image.js');
const source = 'https://cdn.atsu.moe/static/posters/example-small.avif';
const png = (width = 600, height = 900) => sharp({ create: { width, height, channels: 3, background: '#dc2020' } }).png().toBuffer();
const response = (bytes, type = 'image/png') => new Response(bytes, { headers: { 'Content-Type': type } });
async function runHandler(query, options, method = 'GET') {
  const result = { headers: {} };
  const res = {
    setHeader(k, v) { result.headers[k] = v; },
    status(v) { result.status = v; return res; },
    json(v) { result.body = v; return res; },
    end(v) { result.body = v; return res; },
  };
  await createHandler((url, width) => createThumbnail(url, width, options))({ query, method }, res);
  return result;
}

test('only canonical allowlisted public raster paths and two widths are accepted', () => {
  assert.equal(validateCoverUrl(source).href, source);
  assert.equal(validateCoverUrl('https://www.mangaread.org/wp-content/uploads/2019/12/555-75x106.jpg').hostname, 'www.mangaread.org');
  for (const url of [undefined, [source], 'http://cdn.atsu.moe/static/posters/x.jpg',
    'https://atsu.moe/static/posters/x.jpg', 'https://localhost/static/posters/x.jpg',
    'https://cdn.atsu.moe.evil.test/static/posters/x.jpg', 'https://cdn.atsu.moe:8443/static/posters/x.jpg',
    'https://secret@cdn.atsu.moe/static/posters/x.jpg', `${source}?key=value`, `${source}#hash`,
    'https://cdn.atsu.moe/static/posters/../../private.jpg', 'https://cdn.atsu.moe/static/posters/%2e%2e/private.jpg',
    'https://cdn.atsu.moe/static/posters/x.svg', 'https://www.mangaread.org/account/a.jpg']) {
    assert.throws(() => validateCoverUrl(url), (e) => e.status === 400);
  }
  assert.equal(parseWidth(undefined), 256);
  assert.equal(parseWidth('512'), 512);
  for (const width of ['', '500', '0512', ['256'], 512]) assert.throws(() => parseWidth(width), (e) => e.status === 400);
  assert.equal(MAX_INPUT_BYTES, 8 * 1024 * 1024);
  assert.equal(MAX_INPUT_PIXELS, 16_000_000);
});

test('valid covers become small WebP with bounded dimensions and success caching', async () => {
  const result = await runHandler({ url: source, width: '256' }, { fetchImpl: async () => response(await png()) });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'image/webp');
  assert.match(result.headers['Cache-Control'], /public.*s-maxage=604800/);
  const meta = await sharp(result.body).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 256);
  assert.equal(meta.height, 384);
  assert.equal(meta.exif, undefined);
});

test('small and narrow covers are never enlarged; tall output is bounded', async () => {
  for (const [width, height] of [[30, 50], [1, 5000]]) {
    const bytes = await createThumbnail(source, 512, { fetchImpl: async () => response(await png(width, height)) });
    const meta = await sharp(bytes).metadata();
    assert.ok(meta.width <= width && meta.width <= 512);
    assert.ok(meta.height <= height && meta.height <= 1024);
  }
});

test('animated covers emit only their first frame', async () => {
  const pixels = Buffer.alloc(4 * 8 * 3);
  for (let i = 0; i < pixels.length; i += 3) pixels[i + (i < pixels.length / 2 ? 0 : 2)] = 255;
  const animated = await sharp(pixels, { raw: { width: 4, height: 8, channels: 3, pageHeight: 4 } }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  const out = await createThumbnail(source, 256, { fetchImpl: async () => response(animated, 'image/gif') });
  const meta = await sharp(out).metadata();
  assert.equal(meta.pages || 1, 1);
  assert.equal(meta.height, 4);
  const decoded = await sharp(out).raw().toBuffer();
  assert.ok(decoded[0] > 200 && decoded[2] < 50, 'red first frame, not blue second frame');
});

test('every redirect is validated, including relative redirects; no credentials are sent', async () => {
  const calls = [];
  const bytes = await png();
  await createThumbnail(source, 256, { fetchImpl: async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(Object.keys(init.headers), ['Accept']);
    return calls.length === 1 ? new Response(null, { status: 302, headers: { Location: './example-medium.avif' } }) : response(bytes);
  } });
  assert.deepEqual(calls, [source, 'https://cdn.atsu.moe/static/posters/example-medium.avif']);
  for (const destination of ['http://cdn.atsu.moe/static/posters/x.jpg', 'https://127.0.0.1/x.jpg',
    '/account/x.jpg', 'https://secret@www.mangaread.org/wp-content/uploads/x.jpg']) {
    let fetched = 0;
    await assert.rejects(createThumbnail(source, 256, { fetchImpl: async () => {
      fetched++;
      return new Response(null, { status: 302, headers: { Location: destination } });
    } }), (e) => e.status === 502 && e.code === 'COVER_REDIRECT');
    assert.equal(fetched, 1);
  }
});

test('redirect loops stop after three hops', async () => {
  let calls = 0;
  await assert.rejects(createThumbnail(source, 256, { fetchImpl: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { Location: source } });
  } }), (e) => e.code === 'COVER_REDIRECT');
  assert.equal(calls, 4);
});

test('access denial is preserved with no retry, alternate origin, or error caching', async () => {
  for (const status of [403, 404, 429]) {
    let calls = 0;
    const result = await runHandler({ url: source }, { fetchImpl: async () => {
      calls++;
      return new Response('Unavailable', { status });
    } });
    assert.equal(result.status, status);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(calls, 1);
  }
});

test('HTML, SVG, and malformed raster bytes are rejected even with image MIME', async () => {
  for (const [bytes, type] of [[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'],
    [Buffer.from('<html>login</html>'), 'image/jpeg'], [Buffer.from([255, 216, 255, 0]), 'image/jpeg'],
    [await png(), 'text/html']]) {
    const result = await runHandler({ url: source }, { fetchImpl: async () => response(bytes, type) });
    assert.equal(result.status, 415);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

test('declared or streaming bodies over the byte cap stop and cancel', async () => {
  let cancelled = false;
  const oversized = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(17)); }, cancel() { cancelled = true; } });
  await assert.rejects(createThumbnail(source, 256, { maxInputBytes: 16, fetchImpl: async () => new Response(oversized, {
    headers: { 'Content-Type': 'image/png', 'Content-Length': '1' },
  }) }), (e) => e.status === 413);
  assert.equal(cancelled, true);
  let read = false;
  const declared = await runHandler({ url: source }, { fetchImpl: async () => ({
    ok: true, status: 200, headers: new Headers({ 'Content-Type': 'image/png', 'Content-Length': String(MAX_INPUT_BYTES + 1) }),
    body: { cancel: async () => {}, getReader: () => { read = true; throw new Error('must not read'); } },
  }) });
  assert.equal(declared.status, 413);
  assert.equal(read, false);
});

test('decoded pixel limit rejects small compressed files before conversion', async () => {
  const result = await runHandler({ url: source }, { maxInputPixels: 100, fetchImpl: async () => response(await png(20, 20)) });
  assert.equal(result.status, 413);
  assert.equal(result.body.code, 'COVER_PIXEL_LIMIT');
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('one deadline bounds stalled headers and stalled response bodies', async () => {
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

test('invalid methods and parameters never start a request, HEAD has no body', async () => {
  const mustNotFetch = { fetchImpl: async () => { throw new Error('must not fetch'); } };
  for (const query of [{ url: [source] }, { url: source, width: ['256'] }, { url: source, width: '1024' }, { url: source, token: 'x' }]) {
    const result = await runHandler(query, mustNotFetch);
    assert.equal(result.status, 400);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
  assert.equal((await runHandler({ url: source }, mustNotFetch, 'POST')).status, 405);
  const head = await runHandler({ url: source }, { fetchImpl: async () => response(await png()) }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, undefined);
  assert.ok(Number(head.headers['Content-Length']) > 0);
});
