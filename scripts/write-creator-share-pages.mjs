import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'app');
const baseHtml = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const imagePath = path.join(appDir, 'share', 'creator-preview.png');
if (!fs.existsSync(imagePath)) throw new Error(`Missing creator preview image: ${imagePath}`);

const imageUrl = 'https://sakuraonseeker.com/app/share/creator-preview.png';
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
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1734" />',
    '<meta property="og:image:height" content="907" />',
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
