/**
 * Local fallback for `jobs/supabase-config.js` (gitignored). Copy values here while developing with `python -m http.server`,
 * **or** let CI write the file during deploy from secrets.
 *
 * **Vercel:** add Project → Environment Variables, then redeploy so `npm run build` runs and generates `jobs/supabase-config.js`:
 * - `SAKURA_SUPABASE_URL` + `SAKURA_SUPABASE_ANON_KEY` (recommended), or
 * - `SUPABASE_URL` + `SUPABASE_ANON_KEY`, or
 * - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` if that is how your Dashboard exports labels.
 *
 * Confirm in the deploy log line `[careers-supabase-config] OK (url + anon key present)` (see scripts/write-jobs-supabase-config.js).
 */
window.SAKURA_JOBS_SB = {
  url: '',
  anonKey: '',
};
