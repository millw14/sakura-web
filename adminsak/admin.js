(() => {
  'use strict';

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
  const detailDialog = document.getElementById('admin-detail-dialog');
  const detailTitle = document.getElementById('admin-detail-title');
  const detailBody = document.getElementById('admin-detail-body');

  // Vercel trailingSlash: true — API calls must include trailing slash or POST body can be lost on 308 redirect.
  const API = {
    login: '/api/admin/login/',
    logout: '/api/admin/logout/',
    applications: '/api/admin/applications/',
  };

  let applications = [];
  let loadSeq = 0;
  let signedIn = false;

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

  function showLogin() {
    loginEl.hidden = false;
    appEl.hidden = true;
  }

  function showApp() {
    loginEl.hidden = true;
    appEl.hidden = false;
  }

  function setStatus(message) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return { res, data };
  }

  function renderTable() {
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
        const index = Number(btn.getAttribute('data-view-index'));
        openDetail(applications[index]);
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
    if (!row) return;
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

  async function loadApplications(options = {}) {
    const { allowLoginRedirect = true } = options;
    const seq = ++loadSeq;

    setStatus('');
    if (refreshBtn) refreshBtn.disabled = true;

    let res;
    let data;
    try {
      const params = new URLSearchParams();
      if (filterRole?.value) params.set('role', filterRole.value);
      if (filterStatus?.value) params.set('status', filterStatus.value);

      ({ res, data } = await api(`${API.applications}?${params.toString()}`));
    } catch (err) {
      if (seq !== loadSeq) return;
      if (refreshBtn) refreshBtn.disabled = false;
      if (signedIn) {
        setStatus('Network error. Check your connection and try again.');
      } else if (allowLoginRedirect) {
        showLoginError('Could not reach admin API. Is this deploy on Vercel?');
      }
      console.warn('[adminsak]', err);
      return;
    }

    if (seq !== loadSeq) return;
    if (refreshBtn) refreshBtn.disabled = false;

    if (res.status === 401) {
      signedIn = false;
      if (allowLoginRedirect) showLogin();
      return;
    }

    if (res.status === 503) {
      const message = data?.error || 'Admin is not configured on this deploy.';
      if (!signedIn && allowLoginRedirect) {
        showLoginError(message);
        showLogin();
      } else {
        setStatus(message);
      }
      return;
    }

    if (!res.ok) {
      setStatus(data?.error || 'Could not load applications.');
      return;
    }

    signedIn = true;
    showApp();
    applications = Array.isArray(data?.applications) ? data.applications : [];
    renderTable();
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoginError('');
    setLoginBusy(true);

    const password = document.getElementById('admin-password')?.value?.trim() || '';
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

      signedIn = true;
      loginForm.reset();
      showApp();
      await loadApplications({ allowLoginRedirect: false });

      if (!signedIn) {
        showLogin();
        showLoginError('Signed in but session did not stick. Try again or use a private window.');
      }
    } catch (err) {
      showLoginError('Network error. Check your connection and try again.');
      console.warn('[adminsak login]', err);
    } finally {
      setLoginBusy(false);
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    signedIn = false;
    loadSeq += 1;
    try {
      await api(API.logout, { method: 'POST' });
    } catch (err) {
      console.warn('[adminsak logout]', err);
    }
    showLogin();
    applications = [];
    renderTable();
  });

  refreshBtn?.addEventListener('click', () => loadApplications({ allowLoginRedirect: false }));
  filterRole?.addEventListener('change', () => loadApplications({ allowLoginRedirect: false }));
  filterStatus?.addEventListener('change', () => loadApplications({ allowLoginRedirect: false }));

  populateRoleFilter();
  showLogin();
  loadApplications();
})();
