import axios, { AxiosError, type AxiosInstance } from 'axios';
import { loadStoredSession } from '@/auth/rawApi';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${baseURL}/api/v1`,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request — read directly from localStorage (no supabase-js hang risk)
apiClient.interceptors.request.use((config) => {
  const session = loadStoredSession();
  if (!session?.access_token) {
    // eslint-disable-next-line no-console
    console.warn('[apiClient] no session in storage — request will be unauthenticated', config.url);
    return config;
  }
  const auth = `Bearer ${session.access_token}`;
  // axios v1 — config.headers is an AxiosHeaders instance with .set(); fall back to dict access otherwise
  if (config.headers && typeof (config.headers as { set?: unknown }).set === 'function') {
    (config.headers as { set: (k: string, v: string) => void }).set('Authorization', auth);
  } else {
    if (!config.headers) config.headers = {} as never;
    (config.headers as Record<string, string>)['Authorization'] = auth;
  }
  return config;
});

// Normalize FastAPI error responses
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string | { msg: string }[] }>) => {
    if (error.response) {
      const detail = error.response.data?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg).join('; ')
            : error.message;
      return Promise.reject(new ApiError(msg, error.response.status, error.response.data));
    }
    return Promise.reject(new ApiError(error.message ?? 'Network error', 0, null));
  },
);

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
