import { getTabSessionId, onUnauthorized } from './api';

export async function adminGet<T>(path: string): Promise<T | null> {
  try {
    const tabSid = getTabSessionId();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (tabSid) {
      headers['X-Session-Id'] = tabSid;
    }
    const res = await fetch(`/api/admin${path}`, { credentials: 'include', headers });
    if (!res.ok) {
      if (res.status === 401) {
        onUnauthorized.forEach((fn) => fn());
      }
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** POST with the tab's session header; returns the raw response so callers can read error bodies. */
export async function adminPostResponse(path: string, body: unknown = {}): Promise<Response> {
  const tabSid = getTabSessionId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (tabSid) {
    headers['X-Session-Id'] = tabSid;
  }
  const res = await fetch(`/api/admin${path}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    onUnauthorized.forEach((fn) => fn());
  }
  return res;
}

export async function adminPost<T = { ok?: boolean }>(path: string, body: unknown = {}): Promise<T | null> {
  try {
    const res = await adminPostResponse(path, body);
    if (!res.ok) {
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { ok: true } as T;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function healthOk(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    return res.ok;
  } catch {
    return false;
  }
}
