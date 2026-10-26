// Typed wrapper around fetch — preserves CSRF + cookie auth from the legacy api.js.
import { ApiError } from '@/lib/apiError';
import { mockGet, mockPost } from '@/lib/mockBroker';

export { ApiError };
export { getContractSize } from '@/lib/contractSize';

// Toggle to control whether we run in offline Mock Mode (recommended for GitHub Pages portfolio)
export const IS_MOCK = localStorage.getItem('force_mock') === 'true' || 
                       (!window.location.hostname.includes('localhost') && 
                        !window.location.hostname.includes('127.0.0.1'));

// Fired whenever the server returns 401. Components can listen and redirect.
export const onUnauthorized: Array<() => void> = [];

const TAB_SESSION_KEY = 'broker_tab_session_id';

export function getTabSessionId(): string | null {
  try {
    return sessionStorage.getItem(TAB_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setTabSessionId(sessionId: string | null): void {
  try {
    if (sessionId) {
      sessionStorage.setItem(TAB_SESSION_KEY, sessionId);
    } else {
      sessionStorage.removeItem(TAB_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Extracts the XSRF token value from the cookies mapping.
 *
 * @returns token string or empty string if not found
 */
export function xsrfTokenFromCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Ensures a CSRF validation cookie has been initialized by calling the csrf endpoint.
 *
 * @throws Error if response is not ok
 */
export async function ensureCsrfCookie(): Promise<void> {
  if (IS_MOCK) return;
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

/**
 * Builds the X-XSRF-TOKEN header entry object.
 *
 * @returns headers record mapping object
 */
async function xsrfHeader(): Promise<Record<string, string>> {
  if (IS_MOCK) return {};
  if (!xsrfTokenFromCookie()) {
    await ensureCsrfCookie();
  }
  const token = xsrfTokenFromCookie();
  return token ? { 'X-XSRF-TOKEN': token } : {};
}

// -------------------------------------------------------------
// ORIGINAL FETCH WRAPPERS
// -------------------------------------------------------------

/**
 * Performs an HTTP GET request to the specified path.
 * Handles automatic fallback to mockGet if offline, and emits unauthorized events on 401s.
 *
 * @param path request path target URL
 * @returns parsed response body, or null if no content/not JSON
 * @throws ApiError if backend returns failure status codes
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  if (IS_MOCK) {
    return mockGet(path) as Promise<T | null>;
  }

  const tabSid = getTabSessionId();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (tabSid) {
    headers['X-Session-Id'] = tabSid;
  }

  const res = await fetch(path, {
    method: 'GET',
    credentials: 'include',
    headers,
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

/**
 * Executes a POST request with automatic retry if a 403 CSRF forbidden state occurs.
 *
 * @param path request path target URL
 * @param contentType headers content-type property
 * @param body stringified payload body
 * @returns HTTP response object
 */
async function postWithCsrfRetry(
  path: string,
  contentType: string,
  body: string,
): Promise<Response> {
  const isLogin = path.endsWith('/api/auth/login');
  const doReq = async (): Promise<Response> => {
    const xsrf = await xsrfHeader();
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      Accept: 'application/json',
      ...xsrf,
    };
    const tabSid = getTabSessionId();
    if (tabSid && !isLogin) {
      headers['X-Session-Id'] = tabSid;
    }

    // For login endpoint, omit credentials so browser's shared cookie does not steal or invalidate another tab's session
    return fetch(path, {
      method: 'POST',
      credentials: isLogin ? 'omit' : 'include',
      headers,
      body,
    });
  };

  let res = await doReq();
  if (res.status === 403) {
    await ensureCsrfCookie().catch(() => undefined);
    res = await doReq();
  }

  if (isLogin && res.ok) {
    const resSid = res.headers.get('X-Session-Id');
    if (resSid) {
      setTabSessionId(resSid);
    }
  }

  return res;
}

/**
 * Performs an HTTP POST request sending JSON payload.
 *
 * @param path request path target URL
 * @param body payload object
 * @returns HTTP response object
 */
export async function apiPostJson(path: string, body: unknown): Promise<Response> {
  if (IS_MOCK) {
    return mockPost(path, body);
  }

  const res = await postWithCsrfRetry(path, 'application/json', JSON.stringify(body));
  if (res.status === 401) {
    onUnauthorized.forEach((fn) => fn());
  }
  return res;
}

/**
 * Performs an HTTP POST request sending form-urlencoded payload.
 *
 * @param path request path target URL
 * @param body payload string or parameters mapping
 * @returns HTTP response object
 */
export async function apiPostFormUrlEncoded(
  path: string,
  body: string | URLSearchParams,
): Promise<Response> {
  if (IS_MOCK) {
    return mockPost(path, body);
  }

  const stringBody = typeof body === 'string' ? body : body.toString();
  return postWithCsrfRetry(
    path,
    'application/x-www-form-urlencoded;charset=UTF-8',
    stringBody,
  );
}

/**
 * Performs the logout POST request.
 *
 * @returns HTTP response object
 */
export async function apiPostLogout(): Promise<Response> {
  if (IS_MOCK) {
    return mockPost('/api/auth/logout', null);
  }

  const xsrf = await xsrfHeader();
  const headers: Record<string, string> = { Accept: 'application/json', ...xsrf };
  const tabSid = getTabSessionId();
  if (tabSid) {
    headers['X-Session-Id'] = tabSid;
  }

  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers,
  });
  setTabSessionId(null);
  return res;
}
