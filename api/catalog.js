// GET /api/catalog/?s=<atsu|manhwa>&op=<operation>&<that operation's parameters>
//
// Read-only atsu and manhwa catalogue data for the web build, from our own
// origin and cacheable at Vercel's edge (see lib/catalog.js for why and for
// the operation table). The app tries this first and falls back to the
// web-content-proxy edge function on any failure, so an answer here is either
// the upstream's JSON exactly as the edge function would return it, or an
// uncached error.
//
// No CORS headers: the only caller is the same-origin web app, and a public
// CORS grant would hand every other site a free, cached atsu/droplet proxy.
const { CatalogError, parseCatalogQuery, loadCatalog, successCache, EMPTY_CACHE, MAX_BYTES, UPSTREAM_TIMEOUT_MS } =
  require('../lib/catalog.js');

/**
 * The query as [key, value] pairs in arrival order, duplicates kept, so that
 * parseCatalogQuery can insist on the canonical form. req.url has the raw
 * query on Vercel; req.query is the fallback for callers that only set that.
 */
function queryEntries(req) {
  const url = typeof req.url === 'string' ? req.url : '';
  const mark = url.indexOf('?');
  if (mark >= 0) return [...new URLSearchParams(url.slice(mark + 1))];
  const entries = [];
  for (const [key, value] of Object.entries(req.query || {})) {
    for (const item of Array.isArray(value) ? value : [value]) entries.push([key, typeof item === 'string' ? item : String(item)]);
  }
  return entries;
}

function sendError(res, error, timedOut) {
  const known = error instanceof CatalogError;
  const status = known ? error.status : timedOut ? 504 : 502;
  const code = known ? error.code : timedOut ? 'CATALOG_TIMEOUT' : 'CATALOG_UPSTREAM_UNAVAILABLE';
  const message = known ? error.message
    : timedOut ? 'The catalogue source took too long to respond.' : 'The catalogue source is unavailable.';
  // Errors are never cached: a failure pinned at the edge would outlive the
  // outage. The stale copy the edge already holds (stale-if-error) is what
  // covers an outage, not this answer.
  res.setHeader('Cache-Control', 'no-store');
  if (known && error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
  const body = { error: message, code };
  if (known && error.upstreamStatus) body.upstreamStatus = error.upstreamStatus;
  return res.status(status).json(body);
}

function createHandler({ fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  return async function catalog(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Replaced only once a good upstream answer is in hand.
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error: 'Method not allowed.', code: 'CATALOG_METHOD_NOT_ALLOWED' });
    }

    let request;
    try {
      request = parseCatalogQuery(queryEntries(req));
    } catch (error) {
      return sendError(res, error, false);
    }

    const controller = new AbortController();
    const clientClosed = () => controller.abort();
    res.once?.('close', clientClosed);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let result;
    try {
      result = await loadCatalog(request, { fetchImpl, signal: controller.signal, maxBytes });
    } catch (error) {
      if (res.destroyed) return;
      return sendError(res, error, timedOut);
    } finally {
      clearTimeout(timer);
      res.off?.('close', clientClosed);
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', String(Buffer.byteLength(result.body)));
    res.setHeader('Cache-Control', result.empty ? EMPTY_CACHE : successCache(request.ttl));
    res.status(200);
    return res.end(req.method === 'HEAD' ? undefined : result.body);
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.queryEntries = queryEntries;
