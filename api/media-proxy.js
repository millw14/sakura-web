const MEDIA_BASE = 'https://165-232-83-159.nip.io';
// `(?:\?[\w.=&%-]*)?$` allows an optional trailing cache-buster query (?v= / ?t=)
// on the file-path routes — the app appends these to covers/thumbnails and the
// degegen manifest, which the old `$`-after-extension anchors rejected (400).
const Q = '(?:\\?[\\w.=&%-]*)?$';
const ALLOWED_PATHS = [
  new RegExp('^\\/psyopanime\\/(?:videos|thumbs)\\/[A-Za-z0-9_-]+\\.(?:mp4|jpg|jpeg|png)' + Q, 'i'),
  new RegExp('^\\/2heanime\\/(?:videos|thumbs)\\/[A-Za-z0-9_.-]+\\.(?:mp4|mov|jpg|jpeg|png)' + Q, 'i'),
  // Show manifests. Without these the web build's manifest fetch 400s and the
  // app silently falls back to its hardcoded episode list — so new episodes,
  // descriptions and thumbnails appear on native but never on web, with no
  // error anywhere. Native hits the droplet directly and is unaffected, which
  // is exactly why this asymmetry is easy to miss.
  new RegExp('^\\/(?:2heanime|psyopanime)\\/manifest\\.json' + Q, 'i'),
  // Any Sakura Original slug, not one named show. This was pinned to
  // `degegen-files`, so publishing burnie-senders served fine on native and
  // 400'd on web with "Invalid Sakura media path" — a failure that shows up
  // only after the episode is uploaded and looks like a broken video. The slug
  // segment excludes `/` and `.`, so it cannot escape the directory.
  new RegExp('^\\/sakura-originals\\/[a-z0-9][a-z0-9-]*\\/(?:episodes\\/)?[A-Za-z0-9_.-]+\\.(?:mp4|mov|jpg|jpeg|png|json)' + Q, 'i'),
  // Comics/Hentai/Manhwa scraper image proxy. The droplet's /img endpoint
  // validates its own `u` target (blocks private hosts) and streams image
  // bytes, so this just needs to reach it over HTTPS to avoid mixed-content on
  // the web build. Every new scraper needs a line here or its covers and pages
  // 400 on web while working perfectly on native.
  /^\/comics\/v1\/img\?u=https?:\/\/\S+$/i,
  /^\/hentai\/v1\/img\?u=https?:\/\/\S+$/i,
  /^\/manhwa\/v1\/img\?u=https?:\/\/\S+$/i,
  // Creator anime episodes (droplet-hosted). Wallet/uuid/file path only.
  /^\/creator-media\/[1-9A-HJ-NP-Za-km-z]{32,44}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.(?:mp4|mov|webm|jpg|jpeg|png)$/i,
  /^\/media\/v1\/creator\/private\/[1-9A-HJ-NP-Za-km-z]{32,44}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.(?:mp4|mov|webm|m4v)\?token=[0-9a-f-]{72}$/i,
];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
}

function contentTypeForPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.json')) return 'application/json';
  return 'video/mp4';
}

// Only a successful upstream answer may be cached. This used to send
// `public, max-age=3600` on every response, so one droplet 404 or 5xx (a
// scraper miss, a restart) was pinned in Vercel's edge cache — seen live as a
// 404 with x-vercel-cache: HIT — and in browsers for an hour, for every user of
// that URL, long after the droplet recovered.
const SUCCESS_CACHE = 'public, max-age=3600';

// A scraper image is the bytes behind one upstream image URL, which never
// change, and the droplet says so (`immutable`) on every good answer. An hour
// at the edge meant manhwa, comics and 18+ reader pages missed often and paid
// 1.2–1.5 s each through the one-worker droplet. Keep them a week at the edge
// and a day in the browser, like api/reader-image.js. Keyed on the droplet's
// own `immutable`, so any answer it does not vouch for keeps the hour.
// 18+ pages get the same week at the edge but keep the browser's hour: that
// section leaves as little as it can on the reader's device.
const SCRAPER_IMAGE = /^\/(?:comics|hentai|manhwa)\/v1\/img\?/i;
const ADULT_IMAGE = /^\/hentai\//i;
const IMMUTABLE_IMAGE_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
const IMMUTABLE_ADULT_IMAGE_CACHE = 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400';

function cacheControlFor(path, upstream) {
  if (!upstream.ok) return 'no-store';
  if (path.startsWith('/media/v1/creator/private/')) return 'private, no-store';
  if (
    upstream.status === 200 &&
    SCRAPER_IMAGE.test(path) &&
    /(?:^|,)\s*immutable\s*(?:,|$)/i.test(upstream.headers.get('cache-control') || '') &&
    (upstream.headers.get('content-type') || '').toLowerCase().startsWith('image/')
  ) {
    return ADULT_IMAGE.test(path) ? IMMUTABLE_ADULT_IMAGE_CACHE : IMMUTABLE_IMAGE_CACHE;
  }
  return SUCCESS_CACHE;
}

async function mediaProxy(req, res, fetchImpl) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Replaced only once a 2xx upstream answer is in hand: every exit before
  // that is an error and must not be cached.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const rawPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
  let path;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    path = rawPath;
  }

  if (!path.startsWith('/') || !ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    res.status(400).json({ error: 'Invalid Sakura media path.' });
    return;
  }

  let upstream;
  try {
    upstream = await fetchImpl(`${MEDIA_BASE}${path}`, {
      method: req.method,
      headers: {
        'User-Agent': 'Sakura-Web-Media-Proxy/1.0',
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
    });
  } catch {
    // The droplet is unreachable (down, restarting, DNS). Answer that here,
    // uncached, instead of letting the rejection escape the handler as
    // Vercel's opaque function-crash 500.
    res.status(502).json({ error: 'Sakura media is unavailable.' });
    return;
  }

  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || contentTypeForPath(path));
  res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
  res.setHeader('Cache-Control', cacheControlFor(path, upstream));

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) res.setHeader('Content-Range', contentRange);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    while (!res.destroyed) {
      const { value, done } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
    }
    // The client went away mid-body (a player seeking, a closed tab): stop
    // pulling the rest of the file off the droplet for nobody.
    void reader.cancel().catch(() => {});
  } catch {
    // The status, length and (for a 2xx) the public, long-lived Cache-Control
    // were set for the whole file, and part of it may already be out, so an
    // error body is no longer possible. Dropping the connection makes the edge
    // and the browser see a failed response, rather than a cleanly ended
    // truncated file they would cache as complete.
    void reader.cancel().catch(() => {});
    res.destroy?.();
  }
}

// `fetchImpl` is injectable for scripts/media-proxy.test.cjs. The default
// export is the handler Vercel has always run.
function createHandler({ fetchImpl = fetch } = {}) {
  return (req, res) => mediaProxy(req, res, fetchImpl);
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
