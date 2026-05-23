'use strict';

const { buildClearSessionCookie, sendJson } = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  res.setHeader('Set-Cookie', buildClearSessionCookie());
  return sendJson(res, 200, { ok: true });
};
