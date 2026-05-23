(() => {
  'use strict';

  const TOKEN_KEY = 'sakura_admin_token';
  const API = {
    login: '/api/admin/login/',
    logout: '/api/admin/logout/',
    applications: '/api/admin/applications/',
  };

  const loginEl = document.getElementById('admin-login');
  const appEl = document.getElementById('admin-app');
  const loginForm = document.getElementById('admin-login-form');
  const loginBtn = document.getElementById('admin-login-btn');
  const loginError = document.getElementById('admin-login-error');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const refreshBtn = document.getElementById('admin-refresh-btn');
  const filterRole = document.getElementById('admin-filter-role');
  const filterStatus = document.getElementById('admin-filter-status');
  const tableBody = document.getElementById('admin-table-body');
  const countEl = document.getElementById('admin-count');
  const statusEl = document.getElementById('admin-status');

  let applications = [];
  let authToken = '';

  function readStoredToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function storeToken(token) {
    authToken = token || '';
    try {
      if (authToken) sessionStorage.setItem(TOKEN_KEY, authToken);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode / blocked storage */
    }
  }

  function setLoginBusy(busy) {
    if (!loginBtn) return;
    loginBtn.disabled = busy;
    loginBtn.textContent = busy ? 'Signing in…' : 'Sign in';
  }

  function showLoginError(message) {
    if (!loginError) return;
    loginError.hidden = !message;
    loginError.textContent = message || '';
  }

  function showLogin() {
    if (loginEl) loginEl.hidden = false;
    if (appEl) appEl.hidden = true;
  }

  function showApp() {
    if (loginEl) loginEl.hidden = true;
    if (appEl) appEl.hidden = false;
  }

  function setStatus(message) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  function roleTitle(slug) {
    if (window.SAKURA_JOBS_META?.bySlug) {
      return window.SAKURA_JOBS_META.bySlug(slug)?.title || slug;
    }
    return slug;
  }

  function populateRoleFilter() {
    if (!filterRole || !Array.isArray(window.SAKURA_JOBS_META)) return;
    window.SAKURA_JOBS_META.forEach((role) => {
      const opt = document.createElement('option');
      opt.value = role.slug;
      opt.textContent = role.title;
      filterRole.appendChild(opt);
    });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const res = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return { res, data };
  }

  function applicationsUrl() {
    const params = new URLSearchParams();
    if (filterRole?.value) params.set('role', filterRole.value);
    if (filterStatus?.value) params.set('status', filterStatus.value);
    const qs = params.toString();
    return qs ? `${API.applications}?${qs}` : API.applications;
  }

  function renderTable() {
    if (!tableBody || !countEl) return;

    if (!applications.length) {
      tableBody.innerHTML = '<tr><td colspan="6" class="admin-empty">No applications yet.</td></tr>';
      countEl.textContent = '0 results';
      return;
    }

    countEl.textContent = `${applications.length} result${applications.length === 1 ? '' : 's'}`;
    tableBody.innerHTML = applications.map((row, idx) => `
      <tr>
        <td>${escapeHtml(fmtDate(row.created_at))}</td>
        <td>${escapeHtml(roleTitle(row.role_slug))}</td>
        <td>${escapeHtml(row.applicant_full_name)}</td>
        <td><a href="mailto:${escapeHtml(row.applicant_email)}">${escapeHtml(row.applicant_email)}</a></td>
        <td><span class="admin-badge">${escapeHtml(row.status || 'new')}</span></td>
        <td><button type="button" class="admin-btn admin-btn--link" data-view-index="${idx}">View</button></td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('[data-view-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDetail(applications[Number(btn.getAttribute('data-view-index'))]);
      });
    });
  }

  function detailField(label, value, { href = null, pre = false } = {}) {
    if (value == null || value === '') return '';
    const safe = escapeHtml(value);
    let content;
    if (href) {
      content = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    } else if (pre) {
      content = `<pre>${safe}</pre>`;
    } else {
      content = `<p>${safe}</p>`;
    }
    return `<div class="admin-detail-row"><strong>${escapeHtml(label)}</strong>${content}</div>`;
  }

  function openDetail(row) {
    const detailDialog = document.getElementById('admin-detail-dialog');
    const detailTitle = document.getElementById('admin-detail-title');
    const detailBody = document.getElementById('admin-detail-body');
    if (!row || !detailDialog || !detailTitle || !detailBody) return;

    detailTitle.textContent = row.applicant_full_name || 'Application';
    detailBody.innerHTML = [
      detailField('Submitted', fmtDate(row.created_at)),
      detailField('Role', roleTitle(row.role_slug)),
      detailField('Email', row.applicant_email, { href: `mailto:${row.applicant_email}` }),
      detailField('Discord', row.discord_handle),
      detailField('Timezone', row.timezone_label),
      detailField('Portfolio', row.portfolio_url, { href: row.portfolio_url }),
      detailField('LinkedIn', row.linkedin_url, { href: row.linkedin_url }),
      detailField('Status', row.status || 'new'),
      detailField('Cover letter', row.cover_letter, { pre: true }),
      detailField('Experience notes', row.experience_notes, { pre: true }),
    ].filter(Boolean).join('');
    detailDialog.showModal();
  }

  async function loadApplications() {
    if (!authToken) {
      showLogin();
      return false;
    }

    setStatus('');
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      const { res, data } = await api(applicationsUrl());

      if (res.status === 401) {
        storeToken('');
        showLogin();
        showLoginError('Session expired. Sign in again.');
        return false;
      }

      if (res.status === 503) {
        const message = data?.error || 'Admin is not configured on this deploy.';
        showLogin();
        showLoginError(message);
        return false;
      }

      if (!res.ok) {
        setStatus(data?.error || `Could not load applications (${res.status}).`);
        showApp();
        return false;
      }

      showApp();
      applications = Array.isArray(data?.applications) ? data.applications : [];
      renderTable();
      return true;
    } catch (err) {
      console.warn('[adminsak]', err);
      showLoginError('Network error reaching admin API.');
      showLogin();
      return false;
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  async function handleLoginSubmit(event) {
    if (event) event.preventDefault();
    showLoginError('');
    setLoginBusy(true);

    const passwordInput = document.getElementById('admin-password');
    const password = passwordInput?.value?.trim() || '';
    if (!password) {
      showLoginError('Enter your password.');
      setLoginBusy(false);
      return;
    }

    try {
      const { res, data } = await api(API.login, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        showLoginError(data?.error || `Sign in failed (${res.status}).`);
        return;
      }

      const token = typeof data?.token === 'string' ? data.token.trim() : '';
      if (!token) {
        showLoginError('Login succeeded but no session token was returned. Redeploy the site.');
        return;
      }

      storeToken(token);
      if (loginForm) loginForm.reset();
      const ok = await loadApplications();
      if (!ok) {
        storeToken('');
      }
    } catch (err) {
      console.warn('[adminsak login]', err);
      showLoginError('Network error. Check your connection and try again.');
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    storeToken('');
    try {
      await api(API.logout, { method: 'POST' });
    } catch (err) {
      console.warn('[adminsak logout]', err);
    }
    applications = [];
    renderTable();
    showLogin();
  }

  function boot() {
    if (!loginForm || !loginBtn) {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<p style="color:#ff7a7a;text-align:center;padding:2rem;">Admin UI failed to load. Hard refresh the page.</p>',
      );
      return;
    }

    populateRoleFilter();
    authToken = readStoredToken();
    showLogin();

    loginForm.addEventListener('submit', handleLoginSubmit);

    logoutBtn?.addEventListener('click', handleLogout);
    refreshBtn?.addEventListener('click', loadApplications);
    filterRole?.addEventListener('change', loadApplications);
    filterStatus?.addEventListener('change', loadApplications);

    if (authToken) {
      loadApplications();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
