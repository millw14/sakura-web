const { createThumbnail, parseWidth, CoverImageError } = require('../lib/cover-image.js');

function createHandler(thumbnail = createThumbnail) {
  return async function coverImage(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
    }
    try {
      const query = req.query || {};
      if (Object.keys(query).some((key) => key !== 'url' && key !== 'width')) {
        throw new CoverImageError(400, 'INVALID_COVER_REQUEST', 'Only url and width are supported.');
      }
      const bytes = await thumbnail(query.url, parseWidth(query.width));
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      return res.status(200).end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      const known = error instanceof CoverImageError;
      return res.status(known ? error.status : 502).json({
        code: known ? error.code : 'COVER_SOURCE_UNAVAILABLE',
        error: known ? error.message : 'The public cover source is unavailable.',
      });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
