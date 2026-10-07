'use strict';

/**
 * Copies a fresh Expo web export into ./app for hosting at /app/.
 * Run from sakura-mobile sibling repo first: cd ../Sakura/web && npm run build
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = process.env.SAKURA_WEB_EXPORT
  ? path.resolve(process.env.SAKURA_WEB_EXPORT)
  : path.resolve(root, '..', 'Sakura', 'web', 'dist');
const target = path.join(root, 'app');

if (!fs.existsSync(source)) {
  console.error('[sync-sakura-webapp] Missing export at', source);
  console.error('Build it first: cd ../Sakura/web && npm run build');
  process.exit(1);
}

// Retain content-hashed assets for visitors whose cached index still references
// the preceding release, and keep website-owned share artwork. Expo's current
// index, version and service worker replace the corresponding entry points.
fs.cpSync(source, target, { recursive: true });
console.log('[sync-sakura-webapp] Copied', source, '→', target);
