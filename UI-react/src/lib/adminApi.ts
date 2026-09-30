export async function adminGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/admin${path}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function adminPost<T = { ok?: boolean }>(path: string, body: unknown = {}): Promise<T | null> {
  try {
    const res = await fetch(`/api/admin${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
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
