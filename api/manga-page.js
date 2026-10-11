// GET /api/manga-page/?u=<encodeURIComponent(https://cdn.atsu.moe/static/pages/<id>/<chapter>/<file>)>
//
// Serves one atsu chapter page from our own origin so the web build can both
// show it in an <img> and fetch() it into the offline library (see
// lib/manga-page.js for why the CDN cannot be used directly). Page URLs are
// content-addressed, so a success is cached for a year at the edge and in the
// browser; errors are never cached.
const { MangaPageError, validateMangaPageUrl, openMangaPage, MAX_BYTES, TIMEOUT_MS } = require('../lib/manga-page.js');

const SUCCESS_CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';

async function write(res, chunk, signal) {
  signal.throwIfAborted();
  if (res.destroyed) throw new Error('The client went away.');
  if (res.write(chunk) || typeof res.once !== 'function') return;
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off?.('drain', done);
      res.off?.('close', closed);
      res.off?.('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = (error) => { cleanup(); reject(error); };
    const closed = () => failed(new Error('The client went away.'));
    const aborted = () => failed(signal.reason);
    res.once('drain', done);
    res.once('close', closed);
    res.once('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    else if (res.destroyed) closed();
  });
}

function sendError(res, error, timedOut) {
  const known = error instanceof MangaPageError;
  const status = known ? error.status : timedOut ? 504 : 502;
  const code = known ? error.code : timedOut ? 'PAGE_TIMEOUT' : 'PAGE_SOURCE_UNAVAILABLE';
  const message = known ? error.message : timedOut ? 'The page took too long to load.' : 'The page source is unavailable.';
  res.setHeader('Cache-Control', 'no-store');
  if (known && error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
  return res.status(status).json({ error: message, code });
}

function createHandler({ fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  return async function mangaPage(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
    }

    const controller = new AbortController();
    const clientClosed = () => controller.abort();
    res.once?.('close', clientClosed);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      res.off?.('close', clientClosed);
    };

    let page;
    try {
      const query = req.query || {};
      // A fixed parameter set keeps the edge cache to one entry per page.
      if (Object.keys(query).some((key) => key !== 'u')) {
        throw new MangaPageError(400, 'INVALID_PAGE_REQUEST', 'Only u is supported.');
      }
      page = await openMangaPage(validateMangaPageUrl(query.u), { fetchImpl, signal: controller.signal, maxBytes });
    } catch (error) {
      cleanup();
      controller.abort();
      if (res.destroyed) return;
      return sendError(res, error, timedOut);
    }

    res.setHeader('Content-Type', page.contentType);
    if (page.contentLength !== null) res.setHeader('Content-Length', String(page.contentLength));
    res.setHeader('Cache-Control', SUCCESS_CACHE);
    res.status(200);
    if (req.method === 'HEAD') {
      cleanup();
      page.cancel();
      return res.end();
    }

    try {
      if (page.contentLength !== null && page.head.length > page.contentLength) {
        throw new Error('The page exceeds its declared length.');
      }
      await write(res, page.head, controller.signal);
      let total = page.head.length;
      while (true) {
        const { done, value } = await page.reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new MangaPageError(413, 'PAGE_TOO_LARGE', 'The page exceeds the 15 MiB limit.');
        if (page.contentLength !== null && total > page.contentLength) throw new Error('The page exceeds its declared length.');
        await write(res, Buffer.from(value), controller.signal);
      }
      if (page.contentLength !== null && total !== page.contentLength) throw new Error('The page ended before its declared length.');
      res.end();
    } catch {
      // The 200 and its headers are already out, so an error body is no longer
      // possible. Dropping the connection is the honest signal left: the
      // browser and the edge both treat it as a failed response, rather than
      // caching a truncated image for a year.
      page.cancel();
      controller.abort();
      res.destroy?.();
    } finally {
      cleanup();
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
