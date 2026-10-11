const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const PAGE_URL = /^https:\/\/cdn\.atsu\.moe\/static\/pages\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[0-9]+\.(?:webp|jpe?g|png|avif|gif)$/;

class ReaderImageError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function validateReaderUrl(value) {
  // Match before URL normalization, which otherwise hides default ports and dot segments.
  if (typeof value !== 'string' || value.length > 2048 || /[\\\s%]/.test(value) || !PAGE_URL.test(value)) {
    throw new ReaderImageError(400, 'INVALID_READER_URL', 'Choose a supported public chapter image URL.');
  }
  return new URL(value);
}

function cancelBody(response) {
  // Remote cancellation must not keep the request alive after its deadline.
  void response.body?.cancel().catch(() => {});
}

function imageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const boxLength = bytes.readUInt32BE(0);
    if (boxLength >= 16 && boxLength <= bytes.length) {
      // Brand entries are four bytes; offset 12 is the minor version, not a brand.
      for (let offset = 8; offset + 4 <= boxLength; offset += 4) {
        if (offset !== 12 && /^(?:avif|avis)$/.test(bytes.toString('ascii', offset, offset + 4))) return 'image/avif';
      }
    }
  }
  return null;
}

async function readImage(url, fetchImpl, signal, maxBytes) {
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    const response = await fetchImpl(url.href, {
      redirect: 'manual', signal,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
    });
    if (signal.aborted) {
      cancelBody(response);
      signal.throwIfAborted();
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      cancelBody(response);
      if (redirects === 3 || !location || /[\\\s%]/.test(location)) {
        throw new ReaderImageError(502, 'READER_REDIRECT', 'The chapter image source returned an unsupported redirect.');
      }
      try {
        // Absolute targets are checked before parsing so canonical-URL rules still apply.
        const destination = location.startsWith('//') ? `https:${location}` :
          /^[A-Za-z][A-Za-z0-9+.-]*:/.test(location) ? location : new URL(location, url).href;
        url = validateReaderUrl(destination);
      } catch {
        throw new ReaderImageError(502, 'READER_REDIRECT', 'The chapter image source redirected outside its allowed image paths.');
      }
      continue;
    }
    if (response.status !== 200) {
      cancelBody(response);
      const status = [403, 404, 410, 429].includes(response.status) ? response.status : 502;
      throw new ReaderImageError(status, 'READER_SOURCE_UNAVAILABLE', 'The public chapter image source is unavailable.');
    }
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) {
      cancelBody(response);
      throw new ReaderImageError(415, 'INVALID_READER_IMAGE', 'The chapter source did not return a supported raster image.');
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      cancelBody(response);
      throw new ReaderImageError(413, 'READER_TOO_LARGE', 'The chapter image exceeds the 16 MiB limit.');
    }
    if (!response.body) throw new ReaderImageError(415, 'INVALID_READER_IMAGE', 'The chapter image is empty.');
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
        if (length > maxBytes) throw new ReaderImageError(413, 'READER_TOO_LARGE', 'The chapter image exceeds the 16 MiB limit.');
        chunks.push(Buffer.from(value));
      }
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', cancelRead);
      cancelRead();
    }
    const bytes = Buffer.concat(chunks, length);
    if (imageType(bytes) !== contentType) {
      throw new ReaderImageError(415, 'INVALID_READER_IMAGE', 'The chapter image does not match its raster content type.');
    }
    return { bytes, contentType };
  }
}

async function fetchReaderImage(source, {
  fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxInputBytes = MAX_INPUT_BYTES,
} = {}) {
  const url = validateReaderUrl(source);
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      readImage(url, fetchImpl, controller.signal, maxInputBytes),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new ReaderImageError(504, 'READER_TIMEOUT', 'The chapter image took too long to load.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof ReaderImageError) throw error;
    throw new ReaderImageError(502, 'READER_SOURCE_UNAVAILABLE', 'The public chapter image source is unavailable.');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

module.exports = { ReaderImageError, validateReaderUrl, fetchReaderImage, MAX_INPUT_BYTES, TIMEOUT_MS };
