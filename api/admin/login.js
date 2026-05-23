'use strict';

const {
  adminConfigured,
  buildSessionCookie,
  createSessionToken,
  readJsonBody,
  sendJson,
  verifyAdminPassword,
} = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!adminConfigured()) {
    return sendJson(res, 503, {
      error: 'Admin login is not configured on this deploy.',
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid request body' });
  }

  const password = typeof body.password === 'string' ? body.password.trim() : '';

  if (!verifyAdminPassword(password)) {
    await new Promise((r) => setTimeout(r, 400));
    return sendJson(res, 401, { error: 'Invalid password' });
  }

  try {
    const token = createSessionToken();
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('[admin/login]', err);
    return sendJson(res, 503, { error: 'Session could not be created' });
  }
};
