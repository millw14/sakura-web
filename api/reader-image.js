const { fetchReaderImage, ReaderImageError } = require('../lib/reader-image.js');

function createHandler(loadImage = fetchReaderImage) {
  return async function readerImage(req, res) {
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
      if (Object.keys(query).some((key) => key !== 'url')) {
        throw new ReaderImageError(400, 'INVALID_READER_REQUEST', 'Only url is supported.');
      }
      const { bytes, contentType } = await loadImage(query.url);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      return res.status(200).end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      const known = error instanceof ReaderImageError;
      res.status(known ? error.status : 502);
      if (req.method === 'HEAD') return res.end();
      return res.json({
        code: known ? error.code : 'READER_SOURCE_UNAVAILABLE',
        error: known ? error.message : 'The public chapter image source is unavailable.',
      });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
