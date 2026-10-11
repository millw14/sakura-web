// Public-domain reading API. The dependency-free adapter is also used by the
// Sakura comics service; keep lib/public-domain-comics.mjs in sync with its
// scripts/droplet/comics-scraper/internet-archive.js source.
const sourcePromise = import('../lib/public-domain-comics.mjs').then(({ createInternetArchive, fetchArchiveJson }) =>
  createInternetArchive({ fetchJson: fetchArchiveJson }));

function integer(value, fallback, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

const PROBE_TIMEOUT_MS = 10_000;

// Whether a failed probe proves the page is broken (`definitive`) or only that
// the archive was slow or busy. Only the first kind may fail the chapter.
class ProbeError extends Error {
  constructor(message, definitive) { super(message); this.definitive = definitive; }
}

async function verifyPage(url, timeoutMs) {
  // These URLs are parsed from a curated manifest by a strict hostname/path
  // allowlist; the caller never supplies an image URL to this endpoint.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const interrupted = () => new ProbeError(controller.signal.aborted ? 'Comic page probe timed out.' : 'Comic page probe failed.', false);
  try {
    let response;
    try {
      response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'SakuraComics/1.0 (public-domain reader)' } });
    } catch { throw interrupted(); }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      // Only a missing page is proof. 403/429/5xx are the archive throttling
      // or struggling, and the reader may well get the page itself.
      throw new ProbeError(`Comic page is unavailable (HTTP ${response.status}).`, response.status === 404 || response.status === 410);
    }
    let size = 0;
    let signature = Buffer.alloc(0);
    try {
      for await (const chunk of response.body) {
        // A network chunk may contain just one byte. Validate the JPEG prefix
        // across chunk boundaries, not against the first read's arbitrary size.
        if (signature.length < 3) signature = Buffer.concat([signature, Buffer.from(chunk).subarray(0, 3 - signature.length)]);
        size += chunk.length;
        if (size > 8 * 1024 * 1024) throw new ProbeError('Comic page exceeds size limit.', true);
      }
    } catch (error) {
      if (error instanceof ProbeError) throw error;
      throw interrupted();
    }
    if (size < 8192 || signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) {
      throw new ProbeError('Comic source did not return a readable image.', true);
    }
  } finally { clearTimeout(timeout); }
}

function createHandler({ probeTimeoutMs = PROBE_TIMEOUT_MS } = {}) {
  return async function publicDomainComics(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    const route = typeof req.query.path === 'string' ? req.query.path : '';
    if (!['/popular', '/search', '/details', '/chapters', '/pages'].includes(route)) return res.status(400).json({ error: 'Invalid comics request.' });
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const chapterId = typeof req.query.chapterId === 'string' ? req.query.chapterId : '';
    const limit = Math.max(1, integer(req.query.limit, 24, 60));
    const offset = integer(req.query.offset, 0, 5000);
    try {
      const source = await sourcePromise;
      let result;
      let verified = true;
      if (route === '/popular') result = { items: await source.popular(limit) };
      else if (route === '/search') {
        const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
        result = { items: query ? await source.search(query, limit, offset) : await source.popular(limit) };
      } else {
        const comic = await source.details(id);
        if (!comic) return res.status(404).json({ error: 'Comic not found in this collection.' });
        if (route === '/details') result = { comic };
        else if (route === '/chapters') result = { issues: (await source.chapters(id)).slice(offset, offset + integer(req.query.limit, 500, 2000)) };
        else {
          const pages = await source.pages(id, chapterId);
          if (!pages.length) return res.status(404).json({ error: 'Comic chapter not found.' });
          // The probes used to be all-or-nothing: one slow archive.org page past
          // the 10s timeout turned the WHOLE chapter into a 503, for readers and
          // downloads alike, although the page list itself (from the manifest)
          // was fine. Now only proof of a broken page fails the chapter; a probe
          // that merely could not finish ships the list unverified, cached
          // briefly so the next request probes again.
          const probes = await Promise.allSettled([...new Set([pages[0], pages[Math.floor(pages.length / 2)]])]
            .map((url) => verifyPage(url, probeTimeoutMs)));
          const failures = probes.filter((probe) => probe.status === 'rejected').map((probe) => probe.reason);
          const broken = failures.find((error) => error?.definitive);
          if (broken) throw broken;
          if (failures.length) {
            console.warn('[public-domain-comics] page probe inconclusive; serving the page list unverified',
              JSON.stringify({ id, chapterId, reasons: failures.map((error) => String(error?.message || error)) }));
          }
          verified = !failures.length;
          result = { pages, verified, totalDiscovered: pages.length, droppedCount: 0, fallbackToRaw: false };
        }
      }
      res.setHeader('Cache-Control', verified
        ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
        : 'public, max-age=60, s-maxage=300');
      return res.status(200).json(result);
    } catch {
      return res.status(503).json({ error: 'This comic source is temporarily unavailable. Please try again.', code: 'COMICS_UNAVAILABLE' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
