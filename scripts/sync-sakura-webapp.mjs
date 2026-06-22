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
const source = path.resolve(root, '..', 'Sakura', 'web', 'dist');
const target = path.join(root, 'app');

if (!fs.existsSync(source)) {
  console.error('[sync-sakura-webapp] Missing export at', source);
  console.error('Build it first: cd ../Sakura/web && npm run build');
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log('[sync-sakura-webapp] Copied', source, '→', target);
