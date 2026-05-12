/**
 * Careers role metadata — safe to commit (no secrets).
 * Paths use trailing slashes for `/jobs/` hosting.
 */
(function () {
  'use strict';
  /** @typedef {{ slug: string; pathSegment: string; title: string; meta: string; jobType: string }} JobRoleMeta */
  window.SAKURA_JOBS_META = /** @type {JobRoleMeta[]} */ ([
    {
      slug: 'discord_moderator',
      pathSegment: 'discord-moderator',
      title: 'Discord moderator',
      meta: 'Global',
      jobType: 'Contract',
    },
    {
      slug: 'manga_artist',
      pathSegment: 'manga-artist',
      title: 'Manga & key art',
      meta: 'Remote-first',
      jobType: 'Contract',
    },
    {
      slug: 'voice_actor',
      pathSegment: 'voice-actor',
      title: 'Voice & announcer',
      meta: 'Remote-first',
      jobType: 'Project',
    },
    {
      slug: 'community_manager',
      pathSegment: 'community-manager',
      title: 'Community producer',
      meta: 'Global',
      jobType: 'Part-time OK',
    },
    {
      slug: 'localization_editor',
      pathSegment: 'localization-editor',
      title: 'Localization editor',
      meta: 'JP ↔ EN',
      jobType: 'Contract',
    },
    {
      slug: 'content_qa',
      pathSegment: 'content-qa',
      title: 'Content QA',
      meta: 'Remote-first',
      jobType: 'Contract',
    },
    {
      slug: 'marketing_creator',
      pathSegment: 'marketing-creator',
      title: 'Short-form storyteller',
      meta: 'Global',
      jobType: 'Contract',
    },
    {
      slug: 'video_motion',
      pathSegment: 'video-motion',
      title: 'Video & motion',
      meta: 'Remote-first',
      jobType: 'Contract',
    },
  ]);

  window.SAKURA_JOBS_META.bySlug = function (slugNorm) {
    const s = String(slugNorm || '').trim();
    return window.SAKURA_JOBS_META.find((r) => r.slug === s) || null;
  };

  /** Accepts hyphen or underscore form → canonical slug key */
  window.SAKURA_JOBS_META.normalizeSlugQuery = function (raw) {
    const t = String(raw || '').trim().toLowerCase().replace(/-/g, '_');
    return window.SAKURA_JOBS_META.some((r) => r.slug === t) ? t : '';
  };
})();
