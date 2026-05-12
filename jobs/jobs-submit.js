/**
 * Careers form → Supabase `public.job_applications` (REST insert).
 */
(function () {
  'use strict';

  function getCfg() {
    return typeof window !== 'undefined' && window.SAKURA_JOBS_SB ? window.SAKURA_JOBS_SB : null;
  }

  function isConfigured() {
    const cfg = getCfg();
    const u = (cfg?.url || '').trim();
    const k = (cfg?.anonKey || '').trim();
    // Supabase anon keys are long JWT-style strings; relaxed floor avoids false negatives.
    return u.startsWith('https://') && k.length >= 80;
  }

  function showBanner(show, message) {
    const el = document.getElementById('jobs-config-banner');
    if (!el) return;
    el.hidden = !show;
    const slot = el.querySelector('[data-banner-text]');
    if (message && slot) slot.textContent = message;
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function normalizeEmpty(v) {
    const t = (v || '').trim();
    return t.length ? t : null;
  }

  function normalizeSlugFromQuery(raw) {
    if (!raw) return '';
    if (typeof window.SAKURA_JOBS_META?.normalizeSlugQuery === 'function') {
      return window.SAKURA_JOBS_META.normalizeSlugQuery(raw);
    }
    const t = String(raw).trim().toLowerCase().replace(/-/g, '_');
    return t;
  }

  function populateRoleSelect(selectEl) {
    if (!selectEl || !Array.isArray(window.SAKURA_JOBS_META)) return;
    if (selectEl.dataset.rolesPopulated === '1') return;
    window.SAKURA_JOBS_META.forEach((r) => {
      if (!r?.slug) return;
      const o = document.createElement('option');
      o.value = r.slug;
      o.textContent = r.title;
      selectEl.appendChild(o);
    });
    selectEl.dataset.rolesPopulated = '1';
  }

  function setRoleSlug(slug, pickers) {
    const hidden = qs('roleSlugInput');
    const select = qs('role_slug_select');
    if (hidden) hidden.value = slug || '';
    if (select && slug) select.value = slug;

    if (pickers && pickers.length) {
      pickers.forEach((c) => {
        const s = c.getAttribute('data-role-slug');
        c.classList.toggle('jobs-row--active', !!slug && s === slug);
      });
    }
  }

  function bindRoleUi() {
    const pickers = Array.from(document.querySelectorAll('[data-role-picker]'));
    const select = qs('role_slug_select');

    pickers.forEach((el) => {
      el.addEventListener('click', () => {
        const slug = el.getAttribute('data-role-slug');
        if (!slug) return;
        setRoleSlug(slug, pickers);
        const anchor = qs('apply');
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    if (select) {
      select.addEventListener('change', () => {
        const v = select.value.trim();
        setRoleSlug(v, pickers);
      });
    }

    const params = new URLSearchParams(window.location.search);
    const fromQuery = normalizeSlugFromQuery(params.get('role') || params.get('slug'));
    if (fromQuery) {
      setRoleSlug(fromQuery, pickers);
      if (window.location.hash !== '#apply') {
        window.requestAnimationFrame(() => {
          const apply = qs('apply');
          if (apply) apply.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  }

  function setupApplyBadge() {
    const el = document.querySelector('[data-apply-role-badge]');
    if (!el) return;
    const slug = normalizeSlugFromQuery(new URLSearchParams(window.location.search).get('role'));
    if (!slug || typeof window.SAKURA_JOBS_META?.bySlug !== 'function') {
      el.hidden = true;
      return;
    }
    const meta = window.SAKURA_JOBS_META.bySlug(slug);
    if (!meta) {
      el.hidden = true;
      return;
    }
    el.textContent = meta.title;
    el.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const select = qs('role_slug_select');
    populateRoleSelect(select);

    bindRoleUi();
    setupApplyBadge();

    const form = qs('jobs-application-form');
    const submitBtn = qs('jobs-submit-btn');
    const statusEl = qs('jobs-form-status');

    if (!form || !submitBtn) return;

    const cfg = getCfg();
    if (!cfg) {
      showBanner(true, 'Missing SAKURA_JOBS_SB — load jobs/supabase-config.js before jobs-submit.js.');
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-disabled', 'true');
      return;
    }

    if (!isConfigured()) {
      showBanner(
        true,
        'Supabase is not wired for this deploy. On Vercel Project → Settings → Environment Variables, add '
          + 'SAKURA_SUPABASE_URL plus SAKURA_SUPABASE_ANON_KEY '
          + '(or SUPABASE_URL / SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY '
          + 'if that is what your dashboard exports). '
          + 'Ensure `npm run build` runs on deploy (see package.json) so jobs/supabase-config.js is generated—then redeploy.',
      );
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-disabled', 'true');
      return;
    }

    showBanner(false);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusEl?.removeAttribute('data-tone');
      statusEl.textContent = '';

      const hp = qs('jobs-honeypot');
      if (hp?.value?.trim()) {
        form?.reset?.();
        return;
      }

      let slug = qs('roleSlugInput')?.value.trim();
      const fromSelect = qs('role_slug_select')?.value.trim();
      if (fromSelect) slug = fromSelect;

      if (!slug) {
        statusEl.setAttribute('data-tone', 'err');
        statusEl.textContent = 'Choose an open role first.';
        return;
      }

      const payload = {
        role_slug: slug,
        applicant_full_name: qs('applicant_full_name')?.value.trim(),
        applicant_email: qs('applicant_email')?.value.trim(),
        discord_handle: normalizeEmpty(qs('discord_handle')?.value),
        timezone_label: normalizeEmpty(qs('timezone_label')?.value),
        portfolio_url: normalizeEmpty(qs('portfolio_url')?.value),
        linkedin_url: normalizeEmpty(qs('linkedin_url')?.value),
        cover_letter: qs('cover_letter')?.value.trim(),
        experience_notes: normalizeEmpty(qs('experience_notes')?.value),
        agrees_privacy: !!qs('agrees_privacy')?.checked,
        source: 'sakura-web-jobs',
        status: 'new',
      };

      if (!payload.agrees_privacy) {
        statusEl.setAttribute('data-tone', 'err');
        statusEl.textContent = 'Please confirm you agree to the Privacy Policy.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');

      try {
        const sb = getCfg();
        const res = await fetch(`${sb.url.replace(/\/$/, '')}/rest/v1/job_applications`, {
          method: 'POST',
          headers: {
            apikey: sb.anonKey,
            Authorization: `Bearer ${sb.anonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let detail = '';
          try {
            const j = await res.json();
            detail = Array.isArray(j) ? JSON.stringify(j[0]) : (j.message || JSON.stringify(j));
          } catch {
            detail = await res.text();
          }
          statusEl.setAttribute('data-tone', 'err');
          statusEl.textContent = res.status >= 500
            ? 'We could not reach the careers database. Try again shortly.'
            : 'Could not submit. Check highlighted fields.';
          console.warn('[jobs] insert failed', res.status, detail);
          return;
        }

        const success = qs('jobs-success-panel');
        if (success) success.hidden = false;
        form.reset();
        const pickers = Array.from(document.querySelectorAll('[data-role-picker]'));
        setRoleSlug('', pickers);
        success?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (statusEl) {
          statusEl.textContent = '';
          statusEl.removeAttribute('data-tone');
        }
      } catch (err) {
        statusEl.setAttribute('data-tone', 'err');
        statusEl.textContent = 'Network error. Check your connection and try again.';
        console.warn('[jobs]', err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
      }
    });
  });
})();
