import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Trim any trailing whitespace / \r / newlines that sneak in from Windows-style .env files
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Show a visible warning in the dev console so the dev knows what's wrong
  // eslint-disable-next-line no-console
  console.error(
    '[Content Suite] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
      'Create v1/frontend/.env.local with values from v1/.env (prefixed with VITE_).\n' +
      'Example:\n' +
      '  VITE_SUPABASE_URL=https://xxx.supabase.co\n' +
      '  VITE_SUPABASE_ANON_KEY=eyJ...\n' +
      '  VITE_API_BASE_URL=http://localhost:8000',
  );
}

// Supabase v2's createClient() throws if URL is empty (it calls `new URL()` internally).
// We supply a safe placeholder so the app still mounts; auth calls will fail loudly.
const safeUrl = url || 'https://placeholder-not-configured.supabase.co';
const safeKey = anonKey || 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
