const MEDIA_BASE = 'http://165-232-83-159.nip.io';
// `(?:\?[\w.=&%-]*)?$` allows an optional trailing cache-buster query (?v= / ?t=)
// on the file-path routes — the app appends these to covers/thumbnails and the
// degegen manifest, which the old `$`-after-extension anchors rejected (400).
const Q = '(?:\\?[\\w.=&%-]*)?$';
const ALLOWED_PATHS = [
  new RegExp('^\\/psyopanime\\/(?:videos|thumbs)\\/[A-Za-z0-9_-]+\\.(?:mp4|jpg|jpeg|png)' + Q, 'i'),
  new RegExp('^\\/2heanime\\/videos\\/[A-Za-z0-9_.-]+\\.(?:mp4|mov)' + Q, 'i'),
  new RegExp('^\\/sakura-originals\\/degegen-files\\/(?:episodes\\/)?[A-Za-z0-9_.-]+\\.(?:mp4|mov|jpg|jpeg|png|json)' + Q, 'i'),
  // Comics/Hentai scraper image proxy. The droplet's /img endpoint validates
  // its own `u` target (blocks private hosts) and streams image bytes, so this
  // just needs to reach it over HTTPS to avoid mixed-content on the web build.
  /^\/comics\/v1\/img\?u=https?:\/\/\S+$/i,
  /^\/hentai\/v1\/img\?u=https?:\/\/\S+$/i,
  // Creator anime episodes (droplet-hosted). Wallet/uuid/file path only.
  /^\/creator-media\/[1-9A-HJ-NP-Za-km-z]{32,44}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.(?:mp4|mov|webm|jpg|jpeg|png)$/i,
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

module.exports = async function mediaProxy(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

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

  const upstream = await fetch(`${MEDIA_BASE}${path}`, {
    method: req.method,
    headers: {
      'User-Agent': 'Sakura-Web-Media-Proxy/1.0',
      ...(req.headers.range ? { Range: req.headers.range } : {}),
    },
  });

  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || contentTypeForPath(path));
  res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

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
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
};
