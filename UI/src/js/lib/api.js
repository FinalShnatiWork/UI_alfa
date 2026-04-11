export function xsrfTokenFromCookie() {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export async function ensureCsrfCookie() {
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

async function xsrfHeader() {
  if (!xsrfTokenFromCookie()) {
    await ensureCsrfCookie();
  }
  const token = xsrfTokenFromCookie();
  return token ? { 'X-XSRF-TOKEN': token } : {};
}

export async function apiGet(path) {
  const res = await fetch(path, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) {
    return null;
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return null;
  }
  return res.json();
}

export async function apiPostJson(path, body) {
  const doReq = async () => {
    const xsrf = await xsrfHeader();
    return await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...xsrf,
      },
      body: JSON.stringify(body),
    });
  };

  let res = await doReq();
  // CSRF token can become stale after auth/session changes; refresh and retry once.
  if (res.status === 403) {
    await ensureCsrfCookie().catch(() => {});
    res = await doReq();
  }
  return res;
}

export async function apiPostFormUrlEncoded(path, body) {
  const doReq = async () => {
    const xsrf = await xsrfHeader();
    return await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
        ...xsrf,
      },
      body,
    });
  };

  let res = await doReq();
  if (res.status === 403) {
    await ensureCsrfCookie().catch(() => {});
    res = await doReq();
  }
  return res;
}

export async function apiPostLogout() {
  const xsrf = await xsrfHeader();
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...xsrf,
    },
  });
  return res;
}
