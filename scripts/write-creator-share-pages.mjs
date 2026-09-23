import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'app');
const baseHtml = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const imagePath = path.join(appDir, 'share', 'creator-preview.jpg');
if (!fs.existsSync(imagePath)) throw new Error(`Missing creator preview image: ${imagePath}`);

const imageUrl = 'https://sakuraonseeker.com/app/share/creator-preview.jpg';
const imageAlt = 'Sakura drawing in a sketchbook among cherry blossoms';

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function createSharePage({ route, title, description }) {
  const url = `https://sakuraonseeker.com/app/${route}/`;
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Sakura" />',
    `<meta property="og:title" content="${escapeAttribute(title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    '<meta property="og:image:type" content="image/jpeg" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeAttribute(imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttribute(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(imageAlt)}" />`,
  ].join('\n    ');

  if (!/<title>[^<]*<\/title>/.test(baseHtml) ||
      !/<meta name="description" content="[^"]*"\s*\/?>/.test(baseHtml) ||
      !baseHtml.includes('</head>')) {
    throw new Error('The Expo HTML template changed; update the share page generator.');
  }

  const html = baseHtml
    .replace(/^\s*<link rel="canonical"[^>]*\/>\r?\n/gm, '')
    .replace(/^\s*<meta (?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*\/>\r?\n/gm, '')
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeAttribute(description)}" />`)
    .replace('</head>', `    ${tags}\n  </head>`);

  const outputDir = path.join(appDir, route);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  console.log(`[creator-share] Wrote /app/${route}/`);
}

createSharePage({
  route: 'creator-upload',
  title: 'Create on Sakura | Let your story bloom',
  description: 'Publish novels, manga chapters, and anime on Sakura. Arrange your work, reach readers, and earn SAKURA directly from your fans.',
});

createSharePage({
  route: 'become-creator',
  title: 'Become a Sakura Creator | Share your story',
  description: 'Create your Sakura profile, publish novels, manga, and anime, and grow a community around the stories you love to make.',
});

// A short, public share URL gives messaging apps a fresh page to scrape and
// gives visitors a useful introduction before the authenticated upload flow.
const createUrl = 'https://sakuraonseeker.com/create/';
const createTitle = 'Create on Sakura | Let your story bloom';
const createDescription = 'Publish novels, manga chapters, and anime on Sakura. Build your library, meet readers, and share what you love to make.';
const createHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${createTitle}</title>
  <meta name="description" content="${createDescription}" />
  <link rel="canonical" href="${createUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Sakura" />
  <meta property="og:title" content="${createTitle}" />
  <meta property="og:description" content="${createDescription}" />
  <meta property="og:url" content="${createUrl}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${imageAlt}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${createTitle}" />
  <meta name="twitter:description" content="${createDescription}" />
  <meta name="twitter:image" content="${imageUrl}" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #fff7f9; color: #392b3a; font: 16px/1.5 system-ui, sans-serif; }
    header { max-width: 1120px; margin: auto; padding: 24px; color: #c33b6a; font-size: 1.4rem; font-weight: 800; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px 24px 64px; display: grid; gap: 40px; align-items: center; grid-template-columns: 1fr 1fr; }
    h1 { font-size: clamp(2.5rem, 5vw, 4.6rem); line-height: 1.08; letter-spacing: -.04em; margin: 0 0 20px; }
    p { max-width: 480px; font-size: 1.15rem; color: #6d5968; margin: 0 0 28px; }
    a.button { display: inline-block; padding: 14px 26px; border-radius: 999px; color: white; background: #d83e74; font-weight: 750; text-decoration: none; }
    a.button:hover { background: #b92d60; }
    img { display: block; width: 100%; border-radius: 28px; box-shadow: 0 24px 70px #9c44752e; }
    @media (max-width: 720px) { main { grid-template-columns: 1fr; gap: 28px; padding-top: 10px; } }
  </style>
</head>
<body>
  <header>Sakura ✿</header>
  <main>
    <section>
      <h1>Let your story bloom.</h1>
      <p>A home for the worlds you create. Publish a novel, arrange manga chapters, or share anime, then grow a library readers can return to.</p>
      <a class="button" href="/app/creator-upload/">Start creating on Sakura</a>
    </section>
    <img src="/app/share/creator-preview.jpg" alt="${imageAlt}" width="1200" height="630" />
  </main>
</body>
</html>`;
const createDir = path.join(root, 'create');
fs.mkdirSync(createDir, { recursive: true });
fs.writeFileSync(path.join(createDir, 'index.html'), createHtml);
console.log('[creator-share] Wrote /create/');
