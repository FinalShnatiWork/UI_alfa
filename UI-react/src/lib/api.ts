// Typed wrapper around fetch — preserves CSRF + cookie auth from the legacy api.js.

// Fired whenever the server returns 401. Components can listen and redirect.
export const onUnauthorized: Array<() => void> = [];

export function xsrfTokenFromCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export async function ensureCsrfCookie(): Promise<void> {
  const res = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CSRF init failed: ${res.status} ${text}`);
  }
  await res.json();
}

async function xsrfHeader(): Promise<Record<string, string>> {
  if (!xsrfTokenFromCookie()) {
    await ensureCsrfCookie();
  }
  const token = xsrfTokenFromCookie();
  return token ? { 'X-XSRF-TOKEN': token } : {};
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`API ${path} failed: ${status} ${body}`);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string): Promise<T | null> {
  const res = await fetch(path, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      onUnauthorized.forEach((fn) => fn());
    }
    throw new ApiError(res.status, text, path);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  return (await res.json()) as T;
}

async function postWithCsrfRetry(
  path: string,
  contentType: string,
  body: string,
): Promise<Response> {
  const doReq = async (): Promise<Response> => {
    const xsrf = await xsrfHeader();
    return fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': contentType,
        Accept: 'application/json',
        ...xsrf,
      },
      body,
    });
  };

  let res = await doReq();
  if (res.status === 403) {
    await ensureCsrfCookie().catch(() => undefined);
    res = await doReq();
  }
  return res;
}

export async function apiPostJson(path: string, body: unknown): Promise<Response> {
  const res = await postWithCsrfRetry(path, 'application/json', JSON.stringify(body));
  if (res.status === 401) {
    onUnauthorized.forEach((fn) => fn());
  }
  return res;
}

export async function apiPostFormUrlEncoded(
  path: string,
  body: string | URLSearchParams,
): Promise<Response> {
  const stringBody = typeof body === 'string' ? body : body.toString();
  return postWithCsrfRetry(
    path,
    'application/x-www-form-urlencoded;charset=UTF-8',
    stringBody,
  );
}

export async function apiPostLogout(): Promise<Response> {
  const xsrf = await xsrfHeader();
  return fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', ...xsrf },
  });
}
