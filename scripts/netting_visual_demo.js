#!/usr/bin/env node
'use strict';
/**
 * Two-Client Live Visualizer (plan section 9.5).
 *
 * Plays two real client sessions (Trader A, Trader B) plus the computer through V01–V16 against the
 * running backend, and shows every step on a live page (http://localhost:4010).
 *
 *   node scripts/netting_visual_demo.js                    live page + real backend (default)
 *   node scripts/netting_visual_demo.js --headless         no page; PASS/FAIL table in the terminal
 *   node scripts/netting_visual_demo.js --offline          no backend; in-memory broker (presentation only)
 *   node scripts/netting_visual_demo.js --scenario V02,V04 --speed 0.5 --symbol BTCUSD --soak-seconds 30
 *
 * Exit code: 0 = all PASS, 1 = a check failed, 2 = backend unreachable.
 * Zero npm dependencies (Node 18+).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Session, Admin } = require('./lib/api_client');
const { scenarios } = require('./lib/scenarios');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const OFFLINE = flag('offline');
const HEADLESS = flag('headless');
const SPEED = Math.max(0.05, Number(opt('speed', HEADLESS ? '20' : '1'))); // higher = faster
const SYMBOL_FORCED = opt('symbol', null);
let SYMBOL = String(SYMBOL_FORCED || 'BTCUSD').toUpperCase();
const SOAK = Number(opt('soak-seconds', HEADLESS ? '20' : '60'));
const PORT = Number(opt('port', '4010'));
const ONLY = opt('scenario', null);
const NO_OPEN = flag('no-open') || HEADLESS;
const REPORT_DIR = path.resolve(__dirname, '..', 'reports');

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`Node ${process.versions.node} is too old — Node 18 or newer is required (built-in fetch).`);
  process.exit(2);
}

// ── Page server (SSE) ────────────────────────────────────────────────────────
const clients = new Set();
const history = [];
let paused = false;
let stepMode = false;
let stepToken = 0;
let speed = SPEED;
let started = HEADLESS;
let startResolver = null;

function emit(type, data) {
  const msg = { type, ts: Date.now(), ...data };
  if (type !== 'state') history.push(msg);
  if (history.length > 3000) history.splice(0, history.length - 3000);
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(line);
}

function startServer() {
  const page = fs.readFileSync(path.join(__dirname, 'visual', 'index.html'), 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(page);
    } else if (req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'hello', offline: OFFLINE, symbol: SYMBOL, started, speed, scenarios: scenarios.map((s) => ({ id: s.id, title: s.title, actors: s.actors })) })}\n\n`);
      for (const m of history) res.write(`data: ${JSON.stringify(m)}\n\n`);
      if (lastState) res.write(`data: ${JSON.stringify(lastState)}\n\n`);
      clients.add(res);
      const hb = setInterval(() => res.write(': hb\n\n'), 15000);
      req.on('close', () => { clearInterval(hb); clients.delete(res); });
    } else if (req.url === '/control' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const c = JSON.parse(body || '{}');
          if (c.action === 'play') { paused = false; stepMode = false; if (!started) { started = true; startResolver && startResolver(); } }
          if (c.action === 'pause') paused = true;
          if (c.action === 'step') { stepMode = true; paused = false; stepToken++; if (!started) { started = true; startResolver && startResolver(); } }
          if (c.action === 'speed' && Number(c.value) > 0) speed = Number(c.value);
          emit('control', { paused, stepMode, speed });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, paused, stepMode, speed }));
        } catch (e) {
          res.writeHead(400); res.end(String(e.message));
        }
      });
    } else {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function openBrowser(url) {
  try {
    const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch { /* the .bat opens it anyway */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastState = null;

async function gate() {
  while (paused) await sleep(100);
  if (stepMode) {
    const t = stepToken;
    paused = true;
    emit('control', { paused, stepMode, speed });
    while (stepToken === t) await sleep(100);
    paused = false;
  }
}

function contractSize(sym) {
  if (sym.includes('BTC') || sym.includes('ETH')) return 1;
  if (sym.includes('SOL') || sym.includes('XAU')) return 100;
  if (sym.includes('XRP')) return 1000;
  if (sym.includes('XAG')) return 5000;
  return 100000;
}

function unitFor(sym) {
  const cs = contractSize(sym);
  if (cs === 1) return 0.01;
  return 0.1;
}

function roundMid(mid) {
  if (mid >= 1000) return Math.round(mid * 100) / 100;
  if (mid >= 10) return Math.round(mid * 1000) / 1000;
  return Math.round(mid * 100000) / 100000;
}

function fmt(n, d = 8) { return Number(n).toFixed(d).replace(/\.?0+$/, ''); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let A, B, admin, offlineBroker = null;
  if (OFFLINE) {
    const { OfflineBroker } = require('./lib/offline_broker');
    offlineBroker = new OfflineBroker({ symbol: SYMBOL });
    A = offlineBroker.session('Trader A', 'netting.a@broker.local');
    B = offlineBroker.session('Trader B', 'netting.b@broker.local');
    admin = offlineBroker.admin();
  } else {
    A = new Session('Trader A', process.env.NETTING_USER_A || 'netting.a@broker.local', process.env.NETTING_PASS || 'Netting123!');
    B = new Session('Trader B', process.env.NETTING_USER_B || 'netting.b@broker.local', process.env.NETTING_PASS || 'Netting123!');
    admin = new Admin();
    try {
      await admin.health();
    } catch (e) {
      console.error(`Backend not reachable at ${admin.base} — run start-project.bat first.\n  (${e.message})`);
      process.exit(2);
    }
  }

  let server = null;
  if (!HEADLESS) {
    server = await startServer();
    const url = `http://localhost:${PORT}`;
    console.log(`Netting visualizer running at ${url}  (Ctrl+C to stop)`);
    if (!NO_OPEN) openBrowser(url);
    if (!flag('autoplay')) {
      console.log('Press ▶ Play on the page to start.');
      await new Promise((r) => { startResolver = r; });
    } else {
      started = true;
    }
  }

  await A.ensureLoggedIn('Trader A (netting test)');
  await B.ensureLoggedIn('Trader B (netting test)');

  // Who owns which order (so the page can draw A / B / Computer on every event).
  const owners = new Map();
  const wrapSession = (sess, label) => {
    const place = sess.placeOrder.bind(sess);
    sess.placeOrder = async (o) => {
      const r = await place(o);
      if (r.data && r.data.orderId) owners.set(r.data.orderId, label);
      emit('order', { who: label, side: o.side, qty: o.qty, orderType: o.type || 'MARKET', limit: o.limit || null, ok: r.ok, result: r.data });
      return r;
    };
  };
  wrapSession(A, 'A');
  wrapSession(B, 'B');
  for (const fn of ['inject', 'simMarket']) {
    const orig = admin[fn].bind(admin);
    admin[fn] = async (o) => {
      const r = await orig(o);
      if (r && r.orderId) owners.set(r.orderId, 'C');
      emit('order', { who: 'C', side: o.side, qty: o.qty, orderType: fn === 'inject' ? 'LIQUIDITY' : 'MARKET', offsetBps: o.offsetBps, ok: true, result: r });
      return r;
    };
  }
  const ownerOf = (id, bookRows) => {
    if (id == null) return null;
    if (owners.has(id)) return owners.get(id);
    const row = bookRows.find((r) => r.orderId === id);
    if (row) return row.simulated ? 'C' : row.owner === A.email ? 'A' : row.owner === B.email ? 'B' : 'other';
    return 'C';
  };

  const original = await admin.testStatus();
  const cleanup = async () => {
    try {
      await admin.simClear();
      await A.cancelAllOpen();
      await B.cancelAllOpen();
    } catch (e) { console.error('cleanup:', e.message); }
  };
  const restore = async () => {
    try {
      await cleanup();
      // Leave the two test users flat so the demo database stays tidy.
      await A.closeAll();
      await B.closeAll();
      await admin.unfreeze(SYMBOL);
      await admin.nnOffline(false);
      await admin.limitWaitMs(original.limitWaitMs);
      await admin.simEnabled(!!original.simulatorEnabled);
    } catch (e) { console.error('restore:', e.message); }
  };
  process.on('SIGINT', async () => { await restore(); if (offlineBroker) offlineBroker.stop(); process.exit(1); });

  await admin.simEnabled(false);
  await admin.simClear();

  // Scenarios need a book with no OTHER real users' resting LIMIT orders on the symbol (their
  // orders are legitimate counterparties and would change the expected outcome). Pick a clean
  // symbol automatically unless --symbol was given.
  const foreignOn = async (sym) => {
    const bk = await admin.book(sym);
    return [...bk.buys, ...bk.sells].filter((r) => !r.simulated && r.owner !== A.email && r.owner !== B.email && r.type === 'LIMIT');
  };
  if (!SYMBOL_FORCED) {
    for (const cand of ['BTCUSD', 'ETHUSD', 'XAUUSD', 'EURUSD', 'GBPUSD']) {
      if ((await foreignOn(cand)).length === 0) { SYMBOL = cand; break; }
    }
  }
  const foreign = await foreignOn(SYMBOL);
  if (foreign.length) {
    const msg = `WARNING: ${foreign.length} resting LIMIT order(s) from other users on ${SYMBOL} (${foreign.map((r) => '#' + r.orderId + ' ' + r.owner).join(', ')}). They can cross with the test orders — results may differ.`;
    console.log(msg);
    emit('log', { level: 'warn', text: msg });
  }
  await admin.limitWaitMs(20000);
  await admin.nnOffline(false);
  await admin.unfreeze(SYMBOL);
  const book0 = await admin.book(SYMBOL);
  if (!book0.mid) {
    console.error(`No live price for ${SYMBOL}.`);
    await restore();
    process.exit(2);
  }
  let mid = roundMid(Number(book0.mid));
  await admin.freeze(SYMBOL, mid);

  const ctxBase = {
    A, B, admin, sym: SYMBOL, unit: unitFor(SYMBOL), contractSize: contractSize(SYMBOL), soakSeconds: SOAK,
    get mid() { return mid; },
  };

  let seenEvent = (await admin.events(1e15)).lastSeq || 0;
  let seenMatch = 0;
  { const ms = await admin.matches(0); seenMatch = ms.length ? ms[ms.length - 1].id : 0; }

  const refresh = async () => {
    try {
      const [aOv, aPos, aPend, bOv, bPos, bPend, book, sim, ev, ms, summary] = await Promise.all([
        A.overview(), A.positions(), A.pending(), B.overview(), B.positions(), B.pending(),
        admin.book(SYMBOL), admin.simStatus(), admin.events(seenEvent), admin.matches(seenMatch), admin.summary(),
      ]);
      const rows = [...book.buys, ...book.sells];
      for (const e of ev.events) {
        emit('engine', { event: e, owner: ownerOf(e.orderId, rows), restingOwner: ownerOf(e.restingOrderId, rows) });
        seenEvent = Math.max(seenEvent, e.seq);
      }
      const labelOfAccount = (id, sim) => (id === aOv.tradingAccountId ? 'A' : id === bOv.tradingAccountId ? 'B' : sim ? 'C' : 'other');
      for (const m of ms) {
        emit('match', { match: m, buyer: labelOfAccount(m.buyAccountId, m.buyerSimulated), seller: labelOfAccount(m.sellAccountId, m.sellerSimulated) });
        seenMatch = Math.max(seenMatch, m.id);
      }
      lastState = {
        type: 'state', ts: Date.now(), symbol: SYMBOL,
        quote: { bid: book.bid, mid: book.mid, ask: book.ask, frozen: book.frozen, crossed: book.crossed },
        book: { buys: book.buys, sells: book.sells },
        A: { label: 'Trader A', email: A.email, accountId: aOv.tradingAccountId, balance: aOv.balance, equity: aOv.equity, positions: aPos.filter((p) => p.symbolCode === SYMBOL), pending: aPend },
        B: { label: 'Trader B', email: B.email, accountId: bOv.tradingAccountId, balance: bOv.balance, equity: bOv.equity, positions: bPos.filter((p) => p.symbolCode === SYMBOL), pending: bPend },
        computer: sim,
        summary,
      };
      const line = `data: ${JSON.stringify(lastState)}\n\n`;
      for (const res of clients) res.write(line);
    } catch (e) {
      emit('log', { level: 'warn', text: `refresh: ${e.message}` });
    }
  };

  const selected = ONLY ? scenarios.filter((s) => ONLY.split(',').map((x) => x.trim().toUpperCase()).includes(s.id)) : scenarios;
  const results = [];
  emit('run', { total: selected.length, symbol: SYMBOL, offline: OFFLINE, mid });
  console.log(`\nNETTING SCENARIOS — ${SYMBOL} — mid ${mid} — ${OFFLINE ? 'OFFLINE (in-memory broker)' : 'LIVE BACKEND ' + admin.base}\n`);

  for (const sc of selected) {
    await cleanup();
    await admin.freeze(SYMBOL, mid);
    const checks = [];
    const ctx = {
      ...ctxBase,
      get mid() { return mid; },
      px: (bps, m = mid) => fmt(m * (1 + bps / 10000), 8),
      q: (n) => fmt(ctxBase.unit * n, 8),
      sleep,
      say: async (en, he) => {
        await gate();
        emit('say', { scenario: sc.id, en, he });
        if (HEADLESS) process.stdout.write('');
        await sleep(1400 / speed);
      },
      refresh,
      check: (name, pass, detail = '') => {
        const c = { name, pass: !!pass, detail: detail || '' };
        checks.push(c);
        emit('check', { scenario: sc.id, ...c });
      },
      waitFor: async (fn, ms, label) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          const v = await fn();
          if (v) return v;
          await sleep(250);
        }
        emit('log', { level: 'warn', text: `timeout waiting for: ${label}` });
        return null;
      },
      setMid: async (m, { quiet = false } = {}) => {
        mid = roundMid(m);
        await admin.freeze(SYMBOL, mid);
        if (!quiet) await refresh();
      },
      lastEventSeq: async () => (await admin.events(1e15)).lastSeq,
      eventsSince: async (seq) => (await admin.events(seq)).events,
      lastMatchId: async () => { const ms = await admin.matches(0); return ms.length ? ms[ms.length - 1].id : 0; },
      matchesSince: async (id) => admin.matches(id),
    };
    emit('scenario', { id: sc.id, title: sc.title, actors: sc.actors, phase: 'start' });
    await refresh();
    const t0 = Date.now();
    let error = null;
    try {
      await sc.run(ctx);
    } catch (e) {
      error = e;
      ctx.check('scenario ran without errors', false, e.message);
    }
    await refresh();
    const pass = checks.length > 0 && checks.every((c) => c.pass);
    const r = { id: sc.id, title: sc.title.en, pass, checks, ms: Date.now() - t0, error: error && error.message };
    results.push(r);
    emit('scenario', { id: sc.id, title: sc.title, phase: 'end', pass });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${sc.id}  ${sc.title.en.padEnd(70)} ${checks.filter((c) => c.pass).length}/${checks.length}`);
    for (const c of checks.filter((x) => !x.pass)) console.log(`        ✗ ${c.name}  ${c.detail}`);
  }

  await restore();
  await refresh();
  let invariants = null;
  try { invariants = await admin.invariants(); } catch (e) { invariants = { error: e.message }; }
  const passed = results.filter((r) => r.pass).length;
  const allPass = passed === results.length && invariants && invariants.allPass;
  console.log(`\nInvariants: ${invariants && invariants.allPass ? 'ALL PASS' : 'FAIL ' + JSON.stringify(invariants)}`);
  console.log(`RESULT: ${passed}/${results.length} scenarios PASS${allPass ? '' : ' — see failures above'}\n`);
  emit('done', { passed, total: results.length, allPass, invariants });

  // Reports
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
    const base = path.join(REPORT_DIR, `netting-visual-${stamp}${OFFLINE ? '-offline' : ''}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ symbol: SYMBOL, offline: OFFLINE, results, invariants, finalState: lastState, log: history }, null, 2));
    fs.writeFileSync(`${base}.html`, reportHtml(results, invariants));
    console.log(`Report: ${base}.html`);
  } catch (e) {
    console.error('report:', e.message);
  }

  if (offlineBroker) offlineBroker.stop();
  if (server && !flag('exit-when-done')) {
    console.log('Page stays open — press Ctrl+C to exit.');
    return;
  }
  if (server) server.close();
  process.exit(allPass ? 0 : 1);
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function reportHtml(results, inv) {
  const rows = results.map((r) => `<tr class="${r.pass ? 'ok' : 'bad'}"><td>${r.id}</td><td>${esc(r.title)}</td><td>${r.pass ? 'PASS' : 'FAIL'}</td><td>${r.checks.map((c) => `${c.pass ? '✔' : '✘'} ${esc(c.name)}${c.detail && !c.pass ? ' — ' + esc(c.detail) : ''}`).join('<br>')}</td></tr>`).join('');
  const invRows = inv && !inv.error ? Object.entries(inv).filter(([k]) => k.startsWith('I')).map(([k, v]) => `<tr class="${v.pass ? 'ok' : 'bad'}"><td>${k}</td><td>${v.pass ? 'PASS' : 'FAIL'}</td><td>${esc(v.meaning)}</td></tr>`).join('') : `<tr><td colspan=3>${esc(inv && inv.error)}</td></tr>`;
  return `<!doctype html><meta charset="utf-8"><title>Netting report ${SYMBOL}</title>
<style>body{font:14px system-ui;margin:24px;background:#0f1115;color:#e6e6e6}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #2a2f3a;padding:6px 8px;vertical-align:top}tr.ok td:nth-child(3),tr.ok td:nth-child(2){color:#4ade80}tr.bad td{color:#f87171}h1{font-size:18px}</style>
<h1>Netting scenarios — ${SYMBOL} — ${OFFLINE ? 'OFFLINE simulation' : 'live backend'} — ${new Date().toLocaleString()}</h1>
<table><tr><th>ID</th><th>Scenario</th><th>Result</th><th>Checks</th></tr>${rows}</table>
<h1>Invariants</h1><table><tr><th>Invariant</th><th>Result</th><th>Meaning</th></tr>${invRows}</table>`;
}

main().catch((e) => {
  console.error('FATAL:', e.stack || e.message);
  process.exit(1);
});
