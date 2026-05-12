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
  ''
).trim();

const anonKey = (
  process.env.SAKURA_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

const outPath = path.join(__dirname, '..', 'jobs', 'supabase-config.js');

const body = `/** Generated at deploy — do not commit real values. */\nwindow.SAKURA_JOBS_SB = ${JSON.stringify({ url, anonKey })};\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body, 'utf8');

const ok = !!(url && anonKey);
console.log(ok
  ? '[careers-supabase-config] OK (url + anon key present)'
  : '[careers-supabase-config] Wrote placeholders — set SAKURA_SUPABASE_URL and SAKURA_SUPABASE_ANON_KEY on Vercel');
