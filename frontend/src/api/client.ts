/**
 * Thin fetch wrapper.
 * - Same-origin only; cookies are sent automatically (HttpOnly session cookie).
 * - Unsafe methods send the CSRF token read from the (non-HttpOnly) CSRF cookie.
 * - Errors are normalised from the API envelope {"error": {code, message, details}}.
 */
const BASE = '/api/v1';
const CSRF_COOKIE = 'xcore_csrftoken';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.pathname + url.search;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = readCookie(CSRF_COOKIE);
    if (token) headers['X-CSRFToken'] = token;
  }
  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const err = (isJson && data?.error) || {};
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  url: buildUrl,
};

/** Describe an API error for the UI, including field validation messages. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.details as Record<string, unknown> | undefined;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const parts = Object.entries(d).map(
        ([k, v]) => `${k === 'non_field_errors' ? '' : `${k}: `}${Array.isArray(v) ? v.join(' ') : String(v)}`,
      );
      if (parts.length) return `${e.message} ${parts.join(' · ')}`;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}
