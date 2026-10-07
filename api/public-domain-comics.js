// Public-domain reading API. The dependency-free adapter is also used by the
// Sakura comics service; keep lib/public-domain-comics.mjs in sync with its
// scripts/droplet/comics-scraper/internet-archive.js source.
const sourcePromise = import('../lib/public-domain-comics.mjs').then(({ createInternetArchive, fetchArchiveJson }) =>
  createInternetArchive({ fetchJson: fetchArchiveJson }));

function integer(value, fallback, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

async function verifyPage(url) {
  // These URLs are parsed from a curated manifest by a strict hostname/path
  // allowlist; the caller never supplies an image URL to this endpoint.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'SakuraComics/1.0 (public-domain reader)' } });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Comic page is unavailable.'); }
    let size = 0;
    let first;
    for await (const chunk of response.body) {
      first ||= chunk;
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw new Error('Comic page exceeds size limit.');
    }
    if (size < 8192 || first?.[0] !== 0xff || first?.[1] !== 0xd8 || first?.[2] !== 0xff) {
      throw new Error('Comic source did not return a readable image.');
    }
  } finally { clearTimeout(timeout); }
}

module.exports = async function publicDomainComics(req, res) {
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
        await Promise.all([...new Set([pages[0], pages[Math.floor(pages.length / 2)]])].map(verifyPage));
        result = { pages, verified: true, totalDiscovered: pages.length, droppedCount: 0, fallbackToRaw: false };
      }
    }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(result);
  } catch {
    return res.status(503).json({ error: 'This comic source is temporarily unavailable. Please try again.', code: 'COMICS_UNAVAILABLE' });
  }
};
