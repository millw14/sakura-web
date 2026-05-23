'use strict';

const {
  getSupabaseAdminConfig,
  requireAdmin,
  sendJson,
} = require('../../lib/admin-auth');

const ALLOWED_STATUSES = new Set([
  'new',
  'review',
  'shortlisted',
  'rejected',
  'hired',
  'archived',
]);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  if (!url || !serviceRoleKey) {
    return sendJson(res, 503, {
      error: 'Supabase service role is not configured.',
    });
  }

  const reqUrl = new URL(req.url, 'http://localhost');
  const role = (reqUrl.searchParams.get('role') || '').trim();
  const status = (reqUrl.searchParams.get('status') || '').trim();
  const limitRaw = Number(reqUrl.searchParams.get('limit') || 200);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500);

  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc');
  params.set('limit', String(limit));
  if (role) params.set('role_slug', `eq.${role}`);
  if (status && ALLOWED_STATUSES.has(status)) {
    params.set('status', `eq.${status}`);
  }

  try {
    const upstream = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/job_applications?${params.toString()}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('[admin/applications] upstream', upstream.status, detail);
      return sendJson(res, 502, { error: 'Could not load applications' });
    }

    const rows = await upstream.json();
    return sendJson(res, 200, { applications: rows });
  } catch (err) {
    console.error('[admin/applications]', err);
    return sendJson(res, 502, { error: 'Could not reach careers database' });
  }
};
