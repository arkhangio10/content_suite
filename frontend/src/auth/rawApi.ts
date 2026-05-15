/**
 * Direct fetch() helpers for Supabase Auth + PostgREST.
 *
 * We bypass @supabase/supabase-js for the login + profile-load flow because
 * the client library has shown deterministic hangs in this project's setup
 * (promises never resolve on .signInWithPassword / .from().select() despite
 *  curl confirming the endpoints respond in <500ms).
 *
 * The session is persisted to localStorage under a key supabase-js can read
 * (sb-<project-ref>-auth-token), so any other supabase-js feature we use
 * later still sees the user as logged-in.
 */

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

// Extract project ref from URL, e.g. "izvvhcbksdnigmnsyxsv" from "https://izvvhcbksdnigmnsyxsv.supabase.co"
const projectRef = (() => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'unknown';
  }
})();

const STORAGE_KEY = `sb-${projectRef}-auth-token`;

// In-memory mirror so the session survives module re-imports (Vite HMR, etc.)
// and is readable even if localStorage temporarily fails.
let memorySession: RawSession | null = null;

export interface RawSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  user: {
    id: string;
    email: string;
  };
}

export interface RawProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'creator' | 'approver_a' | 'approver_b';
}

// ────────────────────────────────────────────────────────────
// Session storage (compatible with @supabase/supabase-js format)
// ────────────────────────────────────────────────────────────

export function loadStoredSession(): RawSession | null {
  // 1. Try in-memory first (always fresh after storeSession)
  if (memorySession) return memorySession;
  // 2. Fall back to localStorage (page reload case)
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sess = parsed.currentSession ?? parsed;
    if (!sess?.access_token) return null;
    memorySession = sess as RawSession; // warm the in-memory cache
    return memorySession;
  } catch {
    return null;
  }
}

function storeSession(session: RawSession): void {
  memorySession = session;
  // Matches the shape supabase-js v2 uses so it can pick it up later if needed
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentSession: session, expiresAt: session.expires_at }));
  } catch (err) {
    console.warn('[rawApi] localStorage.setItem failed, session lives in memory only', err);
  }
}

function clearSession(): void {
  memorySession = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ────────────────────────────────────────────────────────────
// HTTP with timeout
// ────────────────────────────────────────────────────────────

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ────────────────────────────────────────────────────────────
// Auth
// ────────────────────────────────────────────────────────────

export async function rawSignIn(email: string, password: string): Promise<RawSession> {
  console.info('[rawApi] POST /auth/v1/token (signIn)');
  const res = await fetchWithTimeout(
    `${url}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  );
  const body = await res.json();
  if (!res.ok) {
    const msg = body.msg || body.error_description || body.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const session: RawSession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    user: { id: body.user.id, email: body.user.email },
  };
  storeSession(session);
  console.info('[rawApi] signIn OK — session stored');
  return session;
}

export async function rawSignOut(): Promise<void> {
  const sess = loadStoredSession();
  clearSession();
  if (!sess) return;
  try {
    await fetchWithTimeout(
      `${url}/auth/v1/logout`,
      {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${sess.access_token}` },
      },
      4000,
    );
  } catch {
    // Ignore — we cleared the local session already
  }
}

// ────────────────────────────────────────────────────────────
// Profile (PostgREST)
// ────────────────────────────────────────────────────────────

export async function rawLoadProfile(session: RawSession): Promise<RawProfile | null> {
  console.info('[rawApi] GET /rest/v1/users?id=eq.', session.user.id);
  const res = await fetchWithTimeout(
    `${url}/rest/v1/users?select=id,email,full_name,role&id=eq.${encodeURIComponent(session.user.id)}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    console.error('[rawApi] loadProfile error', res.status, txt);
    return null;
  }
  const arr = (await res.json()) as RawProfile[];
  if (!arr.length) return null;
  console.info('[rawApi] loadProfile OK, role=', arr[0].role);
  return arr[0];
}

export function isSessionExpired(session: RawSession): boolean {
  return session.expires_at <= Math.floor(Date.now() / 1000) + 30;
}
