'use strict';

/**
 * Generates jobs/supabase-config.js at deploy time from environment variables.
 * Vercel: set SAKURA_SUPABASE_URL + SAKURA_SUPABASE_ANON_KEY (or SUPABASE_* fallbacks below).
 */

const fs = require('fs');
const path = require('path');

const url = (
  process.env.SAKURA_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
).trim();

const anonKey = (
  process.env.SAKURA_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

const outPath = path.join(__dirname, '..', 'jobs', 'supabase-config.js');

const body = `/** Generated at deploy — do not commit real values. */\nwindow.SAKURA_JOBS_SB = ${JSON.stringify({ url, anonKey })};\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body, 'utf8');

const ok = !!(url && anonKey);

if (process.env.VERCEL === '1') {
  console.log(
    '[careers-supabase-config] VERCEL env: url=%s anonKeyLen=%s (expected https URL + long publishable key)',
    url ? 'set' : 'MISSING',
    String(anonKey.length),
  );
}

console.log(ok
  ? '[careers-supabase-config] OK (url + anon key present)'
  : '[careers-supabase-config] Wrote placeholders — set Project env vars on the SAME branch target you deploy '
    + '(Production vs Preview), then Redeploy. Names: SAKURA_SUPABASE_URL + SAKURA_SUPABASE_ANON_KEY, '
    + 'or SUPABASE_URL + SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY. '
    + 'In Vercel → Project → Settings → General: ensure Build Command is not overriding package.json '
    + '("npm run build") or clear the override.');
