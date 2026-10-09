const sharp = require('sharp');

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 16_000_000;
const TIMEOUT_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

class CoverImageError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function validateCoverUrl(value) {
  const invalid = () => new CoverImageError(400, 'INVALID_COVER_URL', 'Choose a supported public cover URL.');
  if (typeof value !== 'string' || value.length > 2048 || /[\\\s%]/.test(value)) throw invalid();
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw invalid();
  const poster = /^\/static\/posters\/[A-Za-z0-9_-]+(?:-(?:small|medium|large))?\.(?:avif|webp|png|jpe?g|gif)$/i;
  const wordpress = /^\/wp-content\/uploads\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_().-]+\.(?:avif|webp|png|jpe?g|gif)$/i;
  if (!((url.hostname === 'cdn.atsu.moe' && poster.test(url.pathname)) ||
    (url.hostname === 'www.mangaread.org' && wordpress.test(url.pathname)))) throw invalid();
  return url;
}

function parseWidth(value) {
  if (value === undefined) return 256;
  if (value !== '256' && value !== '512') {
    throw new CoverImageError(400, 'INVALID_WIDTH', 'Cover width must be 256 or 512.');
  }
  return Number(value);
}

function cancelBody(response) {
  // Do not wait for a remote stream to acknowledge cancellation.
  void response.body?.cancel().catch(() => {});
}

function isRasterImage(bytes) {
  return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') ||
    (bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 40)));
}

async function readCover(url, fetchImpl, signal, maxBytes) {
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    const response = await fetchImpl(url.href, {
      redirect: 'manual', signal,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      cancelBody(response);
      if (redirects === 3 || !location) {
        throw new CoverImageError(502, 'COVER_REDIRECT', 'The cover source returned an unsupported redirect.');
      }
      try { url = validateCoverUrl(new URL(location, url).href); } catch {
        throw new CoverImageError(502, 'COVER_REDIRECT', 'The cover source redirected outside its allowed image paths.');
      }
      continue;
    }
    if (!response.ok) {
      cancelBody(response);
      const status = [403, 404, 429].includes(response.status) ? response.status : 502;
      throw new CoverImageError(status, 'COVER_SOURCE_UNAVAILABLE', 'The public cover source is unavailable.');
    }
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) {
      cancelBody(response);
      throw new CoverImageError(415, 'INVALID_COVER_IMAGE', 'The cover source did not return a supported image.');
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      cancelBody(response);
      throw new CoverImageError(413, 'COVER_TOO_LARGE', 'The cover exceeds the 8 MiB input limit.');
    }
    if (!response.body) throw new CoverImageError(415, 'INVALID_COVER_IMAGE', 'The cover image is empty.');
    const reader = response.body.getReader();
    const cancelRead = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancelRead, { once: true });
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) throw new CoverImageError(413, 'COVER_TOO_LARGE', 'The cover exceeds the 8 MiB input limit.');
        chunks.push(Buffer.from(value));
      }
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', cancelRead);
      void reader.cancel().catch(() => {});
    }
    const bytes = Buffer.concat(chunks, length);
    if (!isRasterImage(bytes)) throw new CoverImageError(415, 'INVALID_COVER_IMAGE', 'The cover is not a supported raster image.');
    return bytes;
  }
}

async function createThumbnail(source, width, {
  fetchImpl = fetch, timeoutMs = TIMEOUT_MS,
  maxInputBytes = MAX_INPUT_BYTES, maxInputPixels = MAX_INPUT_PIXELS,
} = {}) {
  const url = validateCoverUrl(source);
  if (width !== 256 && width !== 512) throw new CoverImageError(400, 'INVALID_WIDTH', 'Cover width must be 256 or 512.');
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let pipeline;
  let timer;
  const work = async () => {
    const bytes = await readCover(url, fetchImpl, controller.signal, maxInputBytes);
    controller.signal.throwIfAborted();
    // Restrict decoding as well as download size. SVG is rejected before sharp.
    // pages:1 decodes only the first frame of animated GIF/WebP/AVIF covers.
    pipeline = sharp(bytes, { limitInputPixels: maxInputPixels, limitInputChannels: 4,
      failOn: 'warning', pages: 1, page: 0, animated: false });
    try {
      const metadata = await pipeline.metadata();
      controller.signal.throwIfAborted();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > maxInputPixels) {
        throw new CoverImageError(413, 'COVER_PIXEL_LIMIT', 'The cover exceeds the decoded image limit.');
      }
      const seconds = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
      return await pipeline.rotate().resize({ width, height: width * 2, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75, effort: 3 }).timeout({ seconds }).toBuffer();
    } catch (error) {
      if (error instanceof CoverImageError) throw error;
      if (/pixel limit/i.test(error.message)) throw new CoverImageError(413, 'COVER_PIXEL_LIMIT', 'The cover exceeds the decoded image limit.');
      if (/timeout/i.test(error.message)) throw new CoverImageError(504, 'COVER_TIMEOUT', 'The cover took too long to load.');
      throw new CoverImageError(415, 'INVALID_COVER_IMAGE', 'The cover image could not be decoded.');
    }
  };
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          pipeline?.destroy();
          reject(new CoverImageError(504, 'COVER_TIMEOUT', 'The cover took too long to load.'));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof CoverImageError) throw error;
    throw new CoverImageError(502, 'COVER_SOURCE_UNAVAILABLE', 'The public cover source is unavailable.');
  } finally {
    clearTimeout(timer);
    controller.abort();
    pipeline?.destroy();
  }
}

module.exports = { CoverImageError, validateCoverUrl, parseWidth, createThumbnail,
  MAX_INPUT_BYTES, MAX_INPUT_PIXELS, TIMEOUT_MS };
