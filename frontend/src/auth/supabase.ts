/**
 * Supabase configuration sentinel.
 *
 * We intentionally do NOT create a @supabase/supabase-js client here.
 * Earlier versions did — but the client's `persistSession: true` +
 * `autoRefreshToken: true` defaults clobber the localStorage entry we
 * write from `rawApi.ts` (it tries to refresh tokens it didn't issue,
 * fails, and clears the session) which logged the user out on every
 * page reload. Auth lives entirely in `rawApi.ts`.
 */

// Trim any trailing whitespace / \r / newlines that sneak in from Windows-style .env files
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    '[Content Suite] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
      'In dev: create v1/frontend/.env.local with values from v1/.env (prefixed with VITE_).\n' +
      'In Vercel: set them under Project Settings → Environment Variables and redeploy.\n' +
      'Example:\n' +
      '  VITE_SUPABASE_URL=https://xxx.supabase.co\n' +
      '  VITE_SUPABASE_ANON_KEY=eyJ...\n' +
      '  VITE_API_BASE_URL=https://your-backend.onrender.com',
  );
}
