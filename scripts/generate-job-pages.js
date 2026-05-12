'use strict';

/**
 * Generates static /jobs/<slug>/index.html role detail pages (Pony-style split layout, Sakura palette).
 * Run: npm run gen:jobs
 */

const fs = require('fs');
const path = require('path');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ul(items) {
  return `<ul class="jobs-split__list">\n${items.map((t) => `          <li>${esc(t)}</li>`).join('\n')}\n        </ul>`;
}

const JOBS = [
  {
    slug: 'discord_moderator',
    pathSegment: 'discord-moderator',
    title: 'Discord moderator',
    meta: 'Global',
    jobType: 'Contract',
    intro: [
      'Sakura readers move between mobile, web, and wallet surfaces—your job is to keep lounges legible, kind, and safe when hype spikes around drops and milestones.',
      'You will own queue triage for reports, spoiler policy, raid playbooks, and calm escalation—we pair mods with tooling and written standards so judgment calls stay consistent.',
    ],
    pillars: [
      'Comfort moderating at volume with clear internal notes and handoffs across time zones.',
      'Familiarity with Discord automod, slowmode, role hygiene, and audit-friendly decision logs.',
      'Patience onboarding newcomers who may be brand new to wallets or on-chain milestones.',
    ],
    outcomes: [
      'Ship weekly moderation summaries and incident retros that product can act on.',
      'Coordinate with community producers on AMA timing, spoiler windows, and release comms.',
      'Keep escalation paths cool-headed—legal and trust & safety are part of the loop.',
    ],
  },
  {
    slug: 'manga_artist',
    pathSegment: 'manga-artist',
    title: 'Manga & key art collaborator',
    meta: 'Remote-first',
    jobType: 'Contract',
    intro: [
      'We need confident hands for thumbnails, cover variants, teaser frames, and typography passes that stay on-voice with Sakura pink, Solana gradients, and tasteful restraint.',
      'This is a collaboration role: you work with creative direction, not as a black box—expect feedback loops and reference packs instead of mystery briefs.',
    ],
    pillars: [
      'Portfolio that shows character silhouette, composition, and brand-adjacent campaign work.',
      'Comfort exporting production-ready assets (layers, naming, bleed) for web and mobile.',
      'Comfort discussing rights, references, and credit before anything ships publicly.',
    ],
    outcomes: [
      'Deliver cover explorations tied to ingestion milestones without blowing scope.',
      'Partner with motion on loops and landing moments that reuse your frames.',
      'Maintain a lightweight component kit for teasers reused across seasonal beats.',
    ],
  },
  {
    slug: 'voice_actor',
    pathSegment: 'voice-actor',
    title: 'Voice & announcer',
    meta: 'Remote-first',
    jobType: 'Project',
    intro: [
      'Promo VO, cold opens, and scripted reads that sell clarity without yelling—often paired with tool-assisted pipelines, always disclosed honestly.',
      'We care about tonal range, clean booth hygiene, and files that Engineers can ingest without archaeology.',
    ],
    pillars: [
      'Demonstrated VO reel with promos, explainers, or character contrasts.',
      'Disclosure-ready workflow (union/non-union, AI-assisted reads, pickups).',
      'Ability to iterate fast on alt takes when localization tightens wording.',
    ],
    outcomes: [
      'Produce broadcast-safe masters with sane loudness targets for social cutdowns.',
      'Coordinate glossary pronunciations with localization editors.',
      'Support motion timelines with timings that editors can chop confidently.',
    ],
  },
  {
    slug: 'community_manager',
    pathSegment: 'community-manager',
    title: 'Community producer',
    meta: 'Global',
    jobType: 'Part-time OK',
    intro: [
      'You turn roadmaps into human rhythms: AMAs, recaps, bounty briefs beside creators—then connect those beats to Discord and on-chain checkpoints we can verify.',
      'We want instrumented optimism: narratives backed by timelines, receipts, and honest caveats.',
    ],
    pillars: [
      'History running programs with KPIs borrowed from modern community ops.',
      'Comfort writing crisp copy for Discord announcements and mirrored social posts.',
      'Ability to liaise calmly between readers, mods, and product when expectations diverge.',
    ],
    outcomes: [
      'Own calendar hygiene for recurring rituals (office hours, ship notes, spoiler embargoes).',
      'Produce recap threads aligned with ingestion milestones.',
      'Help define healthy incentives without tanking trust.',
    ],
  },
  {
    slug: 'localization_editor',
    pathSegment: 'localization-editor',
    title: 'Localization editor',
    meta: 'JP ↔ EN',
    jobType: 'Contract',
    intro: [
      'You shepherd glossary fidelity across UI strings, subtitles, marketing, and spoiler-sensitive plot language.',
      'Sakura’s readers expect obsessive consistency—footnotes, honorific posture, and brand voice locked with legal review.',
    ],
    pillars: [
      'Proven bilingual editing—not machine-posted-only—with style guide ownership.',
      'Toolkit literacy (CSV/Sheets/Git diffs welcome) because strings move fast.',
      'Comfort escalating ambiguous rights language without stalling pipelines.',
    ],
    outcomes: [
      'Maintain living glossaries synced with ingestion and storefront metadata.',
      'Partner with VO and motion on pronunciation and typography lockups.',
      'Flag spoiler-adjacent phrasing early for moderation playbooks.',
    ],
  },
  {
    slug: 'content_qa',
    pathSegment: 'content-qa',
    title: 'Content QA navigator',
    meta: 'Remote-first',
    jobType: 'Contract',
    intro: [
      'Series metadata, spoiler taxonomy, ingestion bugs—you keep catalog truth aligned with licensors and moderation policy.',
      'You coordinate calmly when pipelines hiccup, knowing readers see every rough edge instantly.',
    ],
    pillars: [
      'Attention to episodic fidelity, versioning, regional differences, and takedown sensitivity.',
      'Comfort reproducing structured bug reports Engineers can chase.',
      'Operational empathy with support and mods when outages spike chatter.',
    ],
    outcomes: [
      'Maintain QA checklists synced with ingestion milestones.',
      'Own weekly diff reviews for catastrophic metadata regressions.',
      'Feed legal escalations concise packets without drama.',
    ],
  },
  {
    slug: 'marketing_creator',
    pathSegment: 'marketing-creator',
    title: 'Short-form storyteller',
    meta: 'Global',
    jobType: 'Contract',
    intro: [
      'You craft clips, memes-with-taste, Threads/X beats that travel without torching licensors or community trust.',
      'Speed matters, but so does tonal judgment during sensitive releases.',
    ],
    pillars: [
      'Portfolio of social motion or static bursts with restraint and typography literacy.',
      'Comfort coordinating embargo windows with mods and localization.',
      'Native feel for wallets-as-context without turning posts into scams.',
    ],
    outcomes: [
      'Deliver modular asset packs reused across locales with safe crops.',
      'Instrument experiments (UTM-lite, Discord funnels) that respect privacy disclosures.',
      'Partner with storytellers and producers on seasonal arcs.',
    ],
  },
  {
    slug: 'video_motion',
    pathSegment: 'video-motion',
    title: 'Video & motion designer',
    meta: 'Remote-first',
    jobType: 'Contract',
    intro: [
      'Landing loops, teaser bumpers, kinetic type—anything that stitches readers from scroll to storefront without muddying Sakura polish.',
      'We expect ruthless export hygiene and collaboration with VO, art, and engineers shipping lean assets.',
    ],
    pillars: [
      'Expert After Effects (or comparable) timelines with repeatable render presets.',
      'Understanding of adaptive layouts for vertical + 16×9 canvases simultaneously.',
      'Curiosity toward AI-assisted tooling when disclosed and QC’d like any other layer.',
    ],
    outcomes: [
      'Maintain versioned masters + lightweight proxies for stakeholder review.',
      'Ship motion specs that localization can subtitle without rework.',
      'Coordinate with creators on pacing through wallet unlock beats.',
    ],
  },
];

function page(job) {
  const applyUrl = `/jobs/apply/?role=${encodeURIComponent(job.slug)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(job.title)} — Careers · Sakura</title>
  <meta name="description" content="${esc(job.intro[0])}" />
  <link rel="icon" type="image/png" href="/sakuraicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700;900&family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/jobs/jobs.css" />
</head>
<body class="jobs-body jobs-rebrand jobs-detail-page">
  <nav class="nav scrolled" id="mainNav">
    <a href="/" class="nav-brand">
      <img src="/sakuraicon.png" alt="Sakura" class="nav-logo" />
      <div class="nav-brand-text">
        <span class="nav-jp">桜</span>
        <span class="nav-en">SAKURA</span>
      </div>
    </a>
    <div class="nav-links" id="navLinks">
      <a href="/" class="nav-link">Home</a>
      <a href="/#about" class="nav-link">About</a>
      <a href="/#download" class="nav-link">Download</a>
      <a href="/jobs/" class="nav-link" aria-current="page">Careers</a>
    </div>
    <div class="nav-actions">
      <a href="/#download" class="nav-get-app">GET APP</a>
      <a href="https://x.com/millw11488" target="_blank" rel="noopener noreferrer" class="nav-social" aria-label="Twitter">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <button class="nav-hamburger" id="navHamburger" aria-label="Menu"><span></span><span></span><span></span></button>
    </div>
  </nav>

  <main class="jobs-split-layout">
    <header class="jobs-split-layout__ribbon" aria-hidden="true"></header>

    <div class="jobs-split-layout__hero">
      <aside class="jobs-split-accent">
        <a class="jobs-split-accent__brand" href="/jobs/">← all roles</a>
        <div class="jobs-split-accent__orbit" aria-hidden="true"></div>
        <div class="jobs-split-accent__base">
          <p class="jobs-split-accent__meta">${esc(job.meta)} / ${esc(job.jobType)}</p>
          <h1 class="jobs-split-accent__title">${esc(job.title)}</h1>
        </div>
      </aside>

      <article class="jobs-split-copy">
        <header class="jobs-split-copy__head">
          <p class="jobs-split-crumb"><a href="/jobs/">Careers</a><span aria-hidden="true"> / </span>${esc(job.title)}</p>
          <div class="jobs-split-copy__actions-top">
            <a class="jobs-split-textlink" href="/jobs/">Index</a>
            <a class="jobs-split-textlink" href="${applyUrl}">Apply</a>
          </div>
        </header>

        <h2 class="jobs-split-copy__heading">overview</h2>
        ${job.intro.map((p) => `<p class="jobs-split-copy__para">${esc(p)}</p>`).join('\n        ')}

        <h3 class="jobs-split-copy__subhead">signals we look for</h3>
        ${ul(job.pillars)}

        <h3 class="jobs-split-copy__subhead">outcomes you will drive</h3>
        ${ul(job.outcomes)}

        <p class="jobs-split-copy__foot">
          Applying affirms disclosure-first collaboration with Sakura creatives and licensors.
          Compensation starts as milestones—explicit before you sink real volume.
          <a class="jobs-split-textlink jobs-split-textlink--inline" href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
        </p>
      </article>
    </div>

    <a class="jobs-split-fab" href="${applyUrl}">apply here</a>
  </main>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img src="/sakuraicon.png" alt="Sakura" class="footer-logo" />
        <div>
          <span class="footer-jp">桜 Sakura</span>
          <span class="footer-copy">&copy; 2026 Sakura. All rights reserved.</span>
        </div>
      </div>
      <div class="footer-links">
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
        <a href="/#download">Download</a>
        <a href="https://github.com/Sakura-11488/Sakura" target="_blank" rel="noopener noreferrer">Android</a>
        <a href="/jobs/">Careers</a>
      </div>
    </div>
  </footer>

  <script src="/jobs/roles-meta.js"></script>
  <script>
    (function () {
      var hb = document.getElementById('navHamburger');
      var nl = document.getElementById('navLinks');
      if (hb && nl) hb.addEventListener('click', function () { nl.classList.toggle('open'); });
    })();
  </script>
</body>
</html>`;
}

const jobsRoot = path.join(__dirname, '..', 'jobs');
for (const job of JOBS) {
  const dir = path.join(jobsRoot, job.pathSegment);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(job), 'utf8');
}

console.log(`[gen-jobs] Wrote ${JOBS.length} role pages under jobs/`);
