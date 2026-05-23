'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'sakura_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function env(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function getAdminPassword() {
  return env('SAKURA_ADMIN_PASSWORD', 'ADMIN_PASSWORD');
}

function getSessionSecret() {
  const explicit = env('SAKURA_ADMIN_SESSION_SECRET', 'ADMIN_SESSION_SECRET');
  if (explicit) return explicit;

  const password = getAdminPassword();
  const serviceKey = env(
    'SAKURA_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  if (password && serviceKey) {
    return crypto
      .createHash('sha256')
      .update(`${password}:${serviceKey}:sakura-admin-v1`)
      .digest('hex');
  }
  return '';
}

function timingSafeEqualStr(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function verifyAdminPassword(input) {
  const expected = getAdminPassword();
  if (!expected || !input) return false;
  return timingSafeEqualStr(input, expected);
}

function createSessionToken() {
  const secret = getSessionSecret();
  if (!secret) throw new Error('Admin session secret unavailable');

  const payload = {
    v: 1,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token) {
  const secret = getSessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');

  if (!timingSafeEqualStr(sig, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : '';
}

function getSessionFromRequest(req) {
  const bearer = getBearerToken(req);
  if (bearer) {
    const session = verifySessionToken(bearer);
    if (session) return session;
  }

  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function cookieSecureFlag() {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

function buildSessionCookie(token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (cookieSecureFlag()) parts.push('Secure');
  return parts.join('; ');
}

function buildClearSessionCookie() {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (cookieSecureFlag()) parts.push('Secure');
  return parts.join('; ');
}

function adminConfigured() {
  return !!(getAdminPassword() && getSessionSecret());
}

function getSupabaseAdminConfig() {
  return {
    url: env(
      'SAKURA_SUPABASE_URL',
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
    ),
    serviceRoleKey: env(
      'SAKURA_SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
  };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16_384) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req, res) {
  if (!adminConfigured()) {
    sendJson(res, 503, {
      error: 'Admin API is not configured. Set SAKURA_ADMIN_PASSWORD and SAKURA_SUPABASE_SERVICE_ROLE_KEY on the host.',
    });
    return null;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return session;
}

module.exports = {
  COOKIE_NAME,
  adminConfigured,
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  getSupabaseAdminConfig,
  readJsonBody,
  requireAdmin,
  sendJson,
  verifyAdminPassword,
};
