const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const handler = require('../api/public-domain-comics.js');
const realFetch = global.fetch;
after(() => { global.fetch = realFetch; });
const id = 'ia-LittleNemo1905-1914ByWinsorMccay';
const manifest = { items: [0, 1].map((n) => ({ width: 1600, items: [{ items: [{ motivation: 'painting', body: {
  type: 'Image', format: 'image/jpeg', id: `https://iiif.archive.org/image/iiif/3/public-comic%2Fpage${n}.jp2/full/max/0/default.jpg`,
} }] }] })) };
const image = Buffer.alloc(9000);
image[0] = 0xff; image[1] = 0xd8; image[2] = 0xff;

async function request(query, method = 'GET') {
  const result = { status: 200, headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(value) { result.status = value; return res; },
    json(value) { result.body = value; return res; },
    end() { return res; },
  };
  await handler({ method, query }, res);
  return result;
}

test('catalogue is curated and search preserves legitimate empty results', async () => {
  global.fetch = async () => { throw new Error('catalogue must not fetch'); };
  const popular = await request({ path: '/popular' });
  assert.equal(popular.status, 200);
  assert.equal(popular.body.items.length, 3);
  assert.match(popular.headers['Cache-Control'], /s-maxage=3600/);
  assert.equal((await request({ path: '/search', q: 'buster brown' })).body.items.length, 2);
  assert.deepEqual((await request({ path: '/search', q: 'unknown title' })).body.items, []);
});

test('invalid routes, methods and non-curated IDs never fetch caller-selected resources', async () => {
  global.fetch = async () => { throw new Error('must not fetch'); };
  assert.equal((await request({ path: '/admin' })).status, 400);
  assert.equal((await request({ path: '/popular' }, 'POST')).status, 405);
  assert.equal((await request({ path: '/details', id: 'https://localhost/private' })).status, 404);
  assert.equal((await request({ path: '/pages', id, chapterId: 'ia-another-part-1' })).status, 404);
});

test('chapter and page routes verify actual image bytes and match the reader contract', async () => {
  let images = 0;
  global.fetch = async (url) => {
    if (url.endsWith('/manifest.json')) return Response.json(manifest);
    images += 1;
    assert.ok(url.startsWith('https://iiif.archive.org/image/iiif/'));
    return new Response(image, { headers: { 'Content-Type': 'image/jpeg' } });
  };
  const chapters = await request({ path: '/chapters', id });
  assert.equal(chapters.status, 200);
  assert.equal(chapters.body.issues[0].id, `${id}-part-1`);
  const pages = await request({ path: '/pages', id, chapterId: `${id}-part-1` });
  assert.equal(pages.status, 200);
  assert.equal(pages.body.pages.length, 2);
  assert.equal(pages.body.verified, true);
  assert.equal(images, 2);
});

test('HTML disguised as an image returns an uncached availability error', async () => {
  global.fetch = async () => new Response('<html>Unavailable</html>', { headers: { 'Content-Type': 'image/jpeg' } });
  const result = await request({ path: '/pages', id, chapterId: `${id}-part-1` });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'COMICS_UNAVAILABLE');
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('manifest network errors remain retryable instead of returning zero chapters', async () => {
  global.fetch = async () => { throw new Error('network unavailable'); };
  const result = await request({ path: '/chapters', id: 'ia-BusterBrownhisd00Outc' });
  assert.equal(result.status, 503);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});
