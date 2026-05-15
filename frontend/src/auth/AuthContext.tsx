import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  isSessionExpired,
  loadStoredSession,
  rawLoadProfile,
  rawSignIn,
  rawSignOut,
  type RawSession,
} from './rawApi';

export type UserRole = 'creator' | 'approver_a' | 'approver_b';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  initials: string;
  jwt: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function initials(fullName: string, fallbackEmail: string): string {
  const source = fullName?.trim() || fallbackEmail.split('@')[0] || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildAuthUser(session: RawSession, profile: { id: string; email: string; full_name: string; role: UserRole } | null): AuthUser {
  const role = (profile?.role ?? 'creator') as UserRole;
  const email = profile?.email ?? session.user.email;
  const fullName = profile?.full_name?.trim() || email.split('@')[0];
  return {
    id: session.user.id,
    email,
    full_name: fullName,
    role,
    initials: initials(fullName, email),
    jwt: session.access_token,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  // Keep a session ref so signOut + getAccessToken don't need to read storage every time
  const [session, setSession] = useState<RawSession | null>(null);

  // Bootstrap: try to restore session from localStorage and load profile
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = loadStoredSession();
      console.info('[AuthProvider] bootstrap — stored session:', stored ? 'YES (' + stored.user.email + ')' : 'NO');

      if (stored && !isSessionExpired(stored)) {
        try {
          const profile = await rawLoadProfile(stored);
          if (mounted) {
            setSession(stored);
            setUser(buildAuthUser(stored, profile as { id: string; email: string; full_name: string; role: UserRole } | null));
          }
        } catch (err) {
          console.error('[AuthProvider] loadProfile during bootstrap failed', err);
          if (mounted) {
            setSession(stored);
            setUser(buildAuthUser(stored, null));
          }
        }
      } else if (stored) {
        console.warn('[AuthProvider] stored session expired — clearing');
        // Expired — clear it but keep the user unauthenticated
        await rawSignOut();
      }

      if (mounted) setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    console.info('[AuthProvider] signIn() for', email);
    try {
      const newSession = await rawSignIn(email, password);
      setSession(newSession);
      // Load profile in background, but don't block the login flow on it
      try {
        const profile = await rawLoadProfile(newSession);
        setUser(buildAuthUser(newSession, profile as { id: string; email: string; full_name: string; role: UserRole } | null));
      } catch (err) {
        console.error('[AuthProvider] post-login loadProfile failed, using fallback', err);
        setUser(buildAuthUser(newSession, null));
      }
      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AuthProvider] signIn() failed', msg);
      return { error: msg };
    }
  }, []);

  const signOut = useCallback(async () => {
    await rawSignOut();
    setSession(null);
    setUser(null);
  }, []);

  const getAccessToken = useCallback(async () => {
    const current = session ?? loadStoredSession();
    if (!current) return null;
    if (isSessionExpired(current)) {
      // For the demo we don't auto-refresh — let the user re-login
      return null;
    }
    return current.access_token;
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, signIn, signOut, getAccessToken }),
    [user, ready, signIn, signOut, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
