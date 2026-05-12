/**
 * Careers form → Supabase `public.job_applications` (REST insert).
 */
(function () {
  'use strict';

  const cfg = typeof window !== 'undefined' ? window.SAKURA_JOBS_SB : null;

  function isConfigured() {
    const u = (cfg?.url || '').trim();
    const k = (cfg?.anonKey || '').trim();
    return u.startsWith('https://') && k.length > 35;
  }

  function showBanner(show, message) {
    const el = document.getElementById('jobs-config-banner');
    if (!el) return;
    el.hidden = !show;
    if (message) el.querySelector('[data-banner-text]').textContent = message;
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function normalizeEmpty(v) {
    const t = (v || '').trim();
    return t.length ? t : null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!cfg) return;

    const form = qs('jobs-application-form');
    const submitBtn = qs('jobs-submit-btn');
    const statusEl = qs('jobs-form-status');

    if (!isConfigured()) {
      showBanner(true,
        'This form requires Supabase credentials. Edit jobs/supabase-config.js with your Project URL and publishable anon key after running supabase/migrations/20260208193000_job_applications.sql.');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-disabled', 'true');
      }
      return;
    }
    showBanner(false);

    const cards = Array.from(document.querySelectorAll('[data-role-card]'));

    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const slug = card.getAttribute('data-role-slug');
        if (!slug) return;
        cards.forEach((c) => c.classList.toggle('jobs-role-card--active', c === card));
        const hidden = qs('roleSlugInput');
        if (hidden) hidden.value = slug;
        const anchor = qs('apply');
        if (anchor && window.matchMedia('(max-width: 640px)').matches) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusEl?.removeAttribute('data-tone');
      statusEl.textContent = '';

      const hp = qs('jobs-honeypot');
      if (hp?.value?.trim()) {
        form?.reset?.();
        return;
      }

      const slug = qs('roleSlugInput')?.value.trim();
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
        const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/job_applications`, {
          method: 'POST',
          headers: {
            apikey: cfg.anonKey,
            Authorization: `Bearer ${cfg.anonKey}`,
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

        qs('jobs-success-panel').hidden = false;
        form.reset();
        cards.forEach((c) => c.classList.remove('jobs-role-card--active'));
        if (qs('roleSlugInput')) qs('roleSlugInput').value = '';
        qs('jobs-success-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
