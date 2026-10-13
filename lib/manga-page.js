// Same-origin source for atsu chapter page images (api/manga-page.js).
//
// atsu.moe/static/pages answers 410 Gone. cdn.atsu.moe serves the same path to
// a plain server-side GET, but answers a browser <img> with 403 (it keys on
// the Sec-Fetch-* headers browsers add) and sends no CORS header to fetch().
// So on the web build atsu chapters could be neither read nor downloaded. This
// fetches the page on the server and hands it back from our own origin.
//
// It is deliberately narrow: one host, one path shape, raster images only. The
// caller picks a page, never a host, so this cannot be used as an open proxy.

const UPSTREAM_HOST = 'cdn.atsu.moe';
const MAX_URL_LENGTH = 2048;
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
// Enough for every signature below; AVIF names its brand within the first 40 bytes.
const SNIFF_BYTES = 64;
const ACCEPT = 'image/avif,image/webp,image/png,image/jpeg,image/gif';
const PAGE_PATH = /^\/static\/pages\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:avif|webp|png|jpe?g|gif)$/i;
// No SVG: it is scriptable, and this would serve it from our own origin.
const IMAGE_TYPES = new Set(['image/avif', 'image/webp', 'image/png', 'image/jpeg', 'image/gif']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class MangaPageError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    this.status = status;
    this.code = code;
    if (retryAfter) this.retryAfter = retryAfter;
  }
}

function validateMangaPageUrl(value) {
  const invalid = () => new MangaPageError(400, 'INVALID_PAGE_URL', 'Choose a supported atsu chapter page URL.');
  // `%` is refused outright: the URL parser decodes %2e%2e into a `..` segment.
  if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH || /[\\\s%?#@]/.test(value)) throw invalid();
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  // The parser silently resolves dot segments, lowercases the host and drops
  // default ports. Requiring its output to equal the input refuses every
  // spelling that needed normalising, instead of reasoning about each one.
  if (url.href !== value) throw invalid();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw invalid();
  if (url.hostname !== UPSTREAM_HOST && url.hostname !== 'atsu.moe') throw invalid();
  if (!PAGE_PATH.test(url.pathname)) throw invalid();
  // The app still has atsu.moe page URLs from the API; the CDN serves the same path.
  if (url.hostname !== UPSTREAM_HOST) url.hostname = UPSTREAM_HOST;
  return url;
}

function isRasterImage(bytes) {
  return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') ||
    (bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 40)));
}

function cancelBody(response) {
  // Do not wait for a remote stream to acknowledge cancellation.
  void response.body?.cancel().catch(() => {});
}

function upstreamError(response) {
  if (response.status === 404 || response.status === 410) {
    return new MangaPageError(404, 'PAGE_NOT_FOUND', 'This chapter page is not available.');
  }
  if (response.status === 429) {
    return new MangaPageError(429, 'PAGE_RATE_LIMITED', 'The page source is busy. Try again shortly.',
      response.headers.get('retry-after') || undefined);
  }
  return new MangaPageError(502, 'PAGE_SOURCE_UNAVAILABLE', 'The page source is unavailable.');
}

/**
 * Open one validated page upstream. Resolves once the response is known to be
 * a raster image within the size cap, with the first bytes already read (they
 * proved the format) and the rest still streaming:
 *   { contentType, contentLength (number | null), head: Buffer, reader, cancel() }
 * Every redirect target must pass validateMangaPageUrl too.
 */
async function openMangaPage(url, { fetchImpl = fetch, signal, maxBytes = MAX_BYTES } = {}) {
  for (let redirects = 0; ; redirects++) {
    signal?.throwIfAborted();
    const response = await fetchImpl(url.href, { redirect: 'manual', signal, headers: { Accept: ACCEPT } });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      cancelBody(response);
      if (redirects >= MAX_REDIRECTS || !location) {
        throw new MangaPageError(502, 'PAGE_REDIRECT', 'The page source returned an unsupported redirect.');
      }
      try { url = validateMangaPageUrl(new URL(location, url).href); } catch {
        throw new MangaPageError(502, 'PAGE_REDIRECT', 'The page source redirected outside its allowed image paths.');
      }
      continue;
    }
    if (response.status !== 200) {
      cancelBody(response);
      throw response.ok
        ? new MangaPageError(502, 'PAGE_SOURCE_UNAVAILABLE', 'The page source is unavailable.')
        : upstreamError(response);
    }
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) {
      cancelBody(response);
      throw new MangaPageError(415, 'INVALID_PAGE_IMAGE', 'The page source did not return a supported image.');
    }
    // fetch() decodes a content-encoded body, so its declared length would be wrong.
    const encoded = (response.headers.get('content-encoding') || 'identity').toLowerCase() !== 'identity';
    const declared = Number(response.headers.get('content-length'));
    if (declared > maxBytes) {
      cancelBody(response);
      throw new MangaPageError(413, 'PAGE_TOO_LARGE', 'The page exceeds the 15 MiB limit.');
    }
    if (!response.body) throw new MangaPageError(502, 'INVALID_PAGE_IMAGE', 'The page image is empty.');

    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    const chunks = [];
    let length = 0;
    try {
      while (length < SNIFF_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        length += value.byteLength;
      }
    } catch (error) {
      cancel();
      throw error;
    }
    const head = Buffer.concat(chunks, length);
    if (length > maxBytes) {
      cancel();
      throw new MangaPageError(413, 'PAGE_TOO_LARGE', 'The page exceeds the 15 MiB limit.');
    }
    if (!isRasterImage(head)) {
      cancel();
      throw new MangaPageError(415, 'INVALID_PAGE_IMAGE', 'The page source did not return a supported image.');
    }
    const contentLength = !encoded && Number.isSafeInteger(declared) && declared > 0 ? declared : null;
    return { contentType, contentLength, head, reader, cancel };
  }
}

module.exports = {
  MangaPageError, validateMangaPageUrl, openMangaPage, isRasterImage,
  MAX_BYTES, MAX_URL_LENGTH, TIMEOUT_MS, MAX_REDIRECTS,
};
