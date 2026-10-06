// @ts-nocheck
'use strict';
/**
 * Zero-dependency client for the UI_alfa backend (Node 18+ built-in fetch).
 *
 *  - Session: one logged-in user with its OWN cookie jar and CSRF token (= one browser).
 *  - Admin:   /api/admin/** calls. Localhost-only on the backend, and only after an ADMIN login.
 *
 * Every call has a timeout, one retry on network errors, and errors that say method/url/status/body.
 */

const DEFAULT_BASE = process.env.BROKER_URL || 'http://127.0.0.1:8080';
const TIMEOUT_MS = 8000;

class HttpError extends Error {
  constructor(method, url, status, body) {
    super(`${method} ${url} -> ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function rawFetch(url, opts, retries = 1) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'manual' });
  } catch (e) {
    if (retries > 0) return rawFetch(url, opts, retries - 1);
    const err = new Error(`${opts.method || 'GET'} ${url} -> network error: ${e.cause?.code || e.message}`);
    err.network = true;
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function parse(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

class Session {
  constructor(label, email, password, base = DEFAULT_BASE) {
    this.label = label;
    this.email = email;
    this.password = password;
    this.base = base;
    this.cookies = new Map();
  }

  _storeCookies(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of list) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const sid = res.headers.get('X-Session-Id');
    if (sid) this.sessionId = sid;
  }

  _cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, path, body, { form = false, allowError = false } = {}) {
    const url = this.base + path;
    const headers = { Accept: 'application/json' };
    if (this.cookies.size) headers.Cookie = this._cookieHeader();
    if (this.sessionId) headers['X-Session-Id'] = this.sessionId;
    const xsrf = this.cookies.get('XSRF-TOKEN');
    if (method !== 'GET' && xsrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf);
    let payload;
    if (body !== undefined) {
      if (form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        payload = new URLSearchParams(body).toString();
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
    }
    const res = await rawFetch(url, { method, headers, body: payload });
    this._storeCookies(res);
    const data = await parse(res);
    if (!res.ok && !allowError) throw new HttpError(method, url, res.status, data);
    return { status: res.status, ok: res.ok, data };
  }

  /** Logs in; registers the user first if it does not exist yet. */
  async ensureLoggedIn(displayName) {
    await this.request('GET', '/api/auth/csrf', undefined, { allowError: true });
    let r = await this.request('POST', '/api/auth/login', { username: this.email, password: this.password }, { form: true, allowError: true });
    if (r.status === 401) {
      const reg = await this.request('POST', '/api/auth/register', { email: this.email, password: this.password, displayName: displayName || this.label }, { allowError: true });
      if (!reg.ok && reg.status !== 409) throw new HttpError('POST', '/api/auth/register', reg.status, reg.data);
      await this.request('GET', '/api/auth/csrf', undefined, { allowError: true });
      r = await this.request('POST', '/api/auth/login', { username: this.email, password: this.password }, { form: true, allowError: true });
    }
    if (!r.ok) throw new HttpError('POST', '/api/auth/login', r.status, r.data);
    await this.request('GET', '/api/auth/csrf', undefined, { allowError: true }); // fresh token for this session
    return true;
  }

  overview() { return this.request('GET', '/api/broker/overview').then((r) => r.data); }
  positions() { return this.request('GET', '/api/broker/positions').then((r) => r.data); }
  orders() { return this.request('GET', '/api/broker/orders').then((r) => r.data); }
  pending() { return this.request('GET', '/api/broker/orders/pending').then((r) => r.data); }

  /** Places an order; returns the raw response (ok may be false: e.g. credit_limit_exceeded). */
  placeOrder({ symbol, side, qty, type = 'MARKET', limit, strictLimit }) {
    const body = { symbolCode: symbol, side, quantity: Number(qty), orderType: type };
    if (limit !== undefined) body.limitPrice = Number(limit);
    if (strictLimit) body.strictLimit = true;
    return this.request('POST', '/api/broker/orders', body, { allowError: true });
  }

  cancel(orderId) { return this.request('POST', `/api/broker/orders/${orderId}/cancel`, {}, { allowError: true }); }
  closePosition(id) { return this.request('POST', `/api/broker/positions/${id}/close`, {}, { allowError: true }); }

  async cancelAllOpen() {
    const open = await this.pending();
    for (const o of open || []) await this.cancel(o.id);
    return (open || []).length;
  }

  async closeAll(symbol) {
    const pos = await this.positions();
    const results = [];
    for (const p of pos || []) {
      if (symbol && p.symbolCode !== symbol) continue;
      const r = await this.closePosition(p.id);
      results.push({ id: p.id, ok: r.ok, pnl: r.data && r.data.closePnl });
    }
    return results;
  }
}

class Admin {
  constructor(base = DEFAULT_BASE, email = 'admin@gmail.com', password = '1234') {
    this.session = new Session('admin', email, password, base);
    this.ready = null;
  }

  async call(method, path, body) {
    if (!this.ready) this.ready = this.session.ensureLoggedIn('Admin');
    await this.ready;
    const r = await this.session.request(method, path, body);
    return r.data;
  }

  health() { return this.call('GET', '/api/health'); }
  summary() { return this.call('GET', '/api/admin/netting/summary'); }
  invariants() { return this.call('GET', '/api/admin/netting/invariants'); }
  book(symbol) { return this.call('GET', `/api/admin/netting/book?symbol=${encodeURIComponent(symbol)}`); }
  events(since = 0) { return this.call('GET', `/api/admin/netting/events?since=${since}&limit=1000`); }
  matches(since = 0) { return this.call('GET', `/api/admin/netting/matches?since=${since}&limit=1000`); }
  simStatus() { return this.call('GET', '/api/admin/netting/sim/status'); }
  simEnabled(on) { return this.call('POST', '/api/admin/netting/sim/enabled', { on }); }
  simClear(symbol) { return this.call('POST', '/api/admin/netting/sim/clear', symbol ? { symbol } : {}); }
  inject({ symbol, side, qty, offsetBps = 0, account = 1, tag }) {
    return this.call('POST', '/api/admin/netting/sim/inject', { symbol, side, qty: String(qty), offsetBps, account, tag });
  }
  simMarket({ symbol, side, qty, account = 2, tag }) {
    return this.call('POST', '/api/admin/netting/sim/market', { symbol, side, qty: String(qty), account, tag });
  }
  testStatus() { return this.call('GET', '/api/admin/netting/test/status'); }
  freeze(symbol, mid) { return this.call('POST', '/api/admin/netting/test/freeze-quote', mid === undefined ? { symbol } : { symbol, mid }); }
  unfreeze(symbol) { return this.call('POST', '/api/admin/netting/test/unfreeze-quote', symbol ? { symbol } : {}); }
  crossed(symbol, on) { return this.call('POST', '/api/admin/netting/test/crossed-quote', { symbol, on }); }
  nnOffline(on) { return this.call('POST', '/api/admin/netting/test/nn-offline', { on }); }
  limitWaitMs(ms) { return this.call('POST', '/api/admin/netting/test/limit-wait-ms', { ms }); }
}

module.exports = { Session, Admin, HttpError, DEFAULT_BASE };
