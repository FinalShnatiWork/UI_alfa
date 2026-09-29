'use strict';
/**
 * In-memory broker for `netting_visual_demo.js --offline` (presentations without the backend).
 * It mimics the backend's API surface (Session / Admin methods used by scenarios.js) and uses the
 * JS port of the engine (netting_engine.js) with the same remainder rules as NettingService:
 *   MARKET → remainder external now · marketable LIMIT → PENDING_NET wait, then external ·
 *   non-marketable LIMIT → rests · LIQUIDITY (computer) → rests.
 * Money follows FillBooking: reserve at placement, fill cost = margin + commission, the difference
 * is returned (or borrowed), cancel refunds what is still reserved.
 *
 * This is a SIMULATION for showing the concept. The real proof is the online run against Java.
 */

const path = require('path');
const engine = require('./netting_engine');

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const r2 = (x) => Math.round(x * 100) / 100;
const OPEN = ['NEW', 'PARTIALLY_FILLED', 'PENDING_NET'];

function contractSize(sym) {
  if (sym.includes('BTC') || sym.includes('ETH')) return 1;
  if (sym.includes('SOL') || sym.includes('XAU')) return 100;
  if (sym.includes('XRP')) return 1000;
  if (sym.includes('XAG')) return 5000;
  return 100000;
}
const DEFAULT_MID = { BTCUSD: 65000, EURUSD: 1.17, XAUUSD: 2350 };

class OfflineBroker {
  constructor({ symbol = 'BTCUSD' } = {}) {
    this.symbol = symbol;
    this.accounts = new Map();
    this.orders = new Map();
    this.positions = new Map();
    this.matches = [];
    this.events = [];
    this.seq = 0;
    this.ids = { acc: 0, ord: 1000, pos: 0, match: 0 };
    this.quotes = { [symbol]: { mid: DEFAULT_MID[symbol] || 100, crossed: false, frozen: false } };
    this.limitWait = 8000;
    this.nnOffline = false;
    this.simEnabled = false;
    this.sims = [this._account('sim-lp-1@broker.local', 'Computer LP 1', true, 1000000), this._account('sim-lp-2@broker.local', 'Computer LP 2', true, 1000000)];
    this.nn = null;
    try {
      const { NeuralNetwork } = require(path.join(__dirname, '..', '..', 'buysellmodel', 'nn_core.js'));
      this.nn = NeuralNetwork.fromJSON(require(path.join(__dirname, '..', '..', 'buysellmodel', 'training_results.json')).modelWeights);
    } catch { this.nn = null; }
    this.timer = setInterval(() => this._tick(), 250);
    this.simTimer = setInterval(() => this._simTick(), 1000);
  }

  stop() { clearInterval(this.timer); clearInterval(this.simTimer); }

  _account(email, name, simulated, balance) {
    const a = { id: ++this.ids.acc, email, name, simulated, balance, borrowed: 0, creditLimit: simulated ? 0 : 10000, commissionTotal: 0 };
    this.accounts.set(a.id, a);
    return a;
  }

  _quote(sym) {
    const q = this.quotes[sym] || (this.quotes[sym] = { mid: DEFAULT_MID[sym] || 100, crossed: false, frozen: false });
    const bid = Math.round(q.mid * (1 - 0.00015) * 1e5) / 1e5;
    const ask = Math.round(q.mid * (1 + 0.00015) * 1e5) / 1e5;
    return q.crossed ? { bid: ask, mid: q.mid, ask: bid } : { bid, mid: q.mid, ask };
  }

  _event(sym, orderId, restingOrderId, code, detail, matchId = null) {
    this.events.push({ seq: ++this.seq, ts: Date.now(), symbol: sym, orderId, restingOrderId, code, detail, matchId });
    if (this.events.length > 1000) this.events.shift();
  }

  _commission(sym, qty, price) {
    const fee = r2(price * qty * contractSize(sym) * 0.000025);
    return Math.min(50, Math.max(0.1, fee));
  }

  _margin(sym, qty, price) { return r4(price * qty * contractSize(sym) / 100); }

  _canCover(acc, extra) {
    if (extra <= 0) return true;
    if (acc.balance >= extra) return true;
    return acc.borrowed + (extra - acc.balance) <= acc.creditLimit;
  }

  _debit(acc, amount) {
    if (amount <= 0) return true;
    if (acc.balance >= amount) { acc.balance = r4(acc.balance - amount); return true; }
    const short = amount - acc.balance;
    if (acc.borrowed + short > acc.creditLimit) return false;
    acc.balance = 0; acc.borrowed = r4(acc.borrowed + short);
    return true;
  }

  _credit(acc, amount) {
    if (amount <= 0) return;
    const repay = Math.min(amount, acc.borrowed);
    acc.borrowed = r4(acc.borrowed - repay);
    acc.balance = r4(acc.balance + amount - repay);
  }

  _remaining(o) { return Math.max(0, Number((o.quantity - o.filledQty).toFixed(10))); }

  _portion(o, qty) {
    const rem = this._remaining(o);
    if (rem <= 0 || qty >= rem) return o.reserveRemaining;
    return r4(o.reserveRemaining * qty / rem);
  }

  _cost(o, qty, price) {
    return { margin: this._margin(o.symbolCode, qty, price), commission: this._commission(o.symbolCode, qty, price), portion: this._portion(o, qty) };
  }

  _book(o, qty, price, c, internal) {
    const acc = this.accounts.get(o.accountId);
    const settle = c.portion - (c.margin + c.commission);
    if (settle > 0) this._credit(acc, settle); else if (settle < 0) this._debit(acc, -settle);
    o.reserveRemaining = Math.max(0, r4(o.reserveRemaining - c.portion));
    o.commission = r2(o.commission + c.commission);
    acc.commissionTotal = r2(acc.commissionTotal + c.commission);
    const pos = { id: ++this.ids.pos, accountId: o.accountId, symbolCode: o.symbolCode, side: o.side === 'BUY' ? 'LONG' : 'SHORT', quantity: qty, avgPrice: price, unrealizedPnl: 0, openedAt: new Date().toISOString() };
    this.positions.set(pos.id, pos);
    const before = o.filledQty;
    o.entryPrice = before === 0 ? price : (o.entryPrice * before + price * qty) / (before + qty);
    o.filledQty = Number((before + qty).toFixed(10));
    if (internal) o.internalQty = Number((o.internalQty + qty).toFixed(10)); else o.externalQty = Number((o.externalQty + qty).toFixed(10));
    o.routing = o.internalQty > 0 && o.externalQty > 0 ? 'SPLIT' : o.internalQty > 0 ? 'INTERNAL' : 'EXTERNAL';
  }

  _settleStatus(o) {
    if (o.status === 'REJECTED' || o.status === 'CANCELLED') return;
    if (this._remaining(o) <= 0) { o.status = 'FILLED'; o.netDeadline = null; } else if (o.status === 'NEW' && o.filledQty > 0) o.status = 'PARTIALLY_FILLED';
  }

  _resting(sym, side, excludeId) {
    return [...this.orders.values()].filter((o) => o.symbolCode === sym && o.side === side && OPEN.includes(o.status)
      && (o.orderType === 'LIMIT' || o.orderType === 'LIQUIDITY') && o.limitPrice !== null && o.id !== excludeId);
  }

  _process(o) {
    if (!OPEN.includes(o.status) || this._remaining(o) <= 0) return;
    const sym = o.symbolCode;
    const q = this._quote(sym);
    const isBuy = o.side === 'BUY';
    const inAcc = this.accounts.get(o.accountId);
    const inLimit = o.orderType === 'LIMIT' || o.orderType === 'LIQUIDITY' ? o.limitPrice : null;
    const restingOrders = this._resting(sym, isBuy ? 'SELL' : 'BUY', o.id);
    const resting = restingOrders.map((r) => ({ orderId: r.id, accountId: r.accountId, simulated: this.accounts.get(r.accountId).simulated, side: r.side, qty: String(this._remaining(r)), limit: String(r.limitPrice), createdAtMs: r.createdAtMs }));
    const plan = engine.plan({ orderId: o.id, accountId: o.accountId, simulated: inAcc.simulated, side: o.side, qty: String(this._remaining(o)), limit: inLimit === null ? null : String(inLimit) }, resting, { bid: String(q.bid), mid: String(q.mid), ask: String(q.ask) });
    for (const d of plan.decisions) this._event(sym, o.id, d.restingOrderId, d.code, d.detail);
    const cs = contractSize(sym);
    for (const f of plan.fills) {
      const r = this.orders.get(f.restingOrderId);
      const qty = Math.min(Number(f.qty), this._remaining(o), this._remaining(r));
      if (qty <= 0) continue;
      const ci = this._cost(o, qty, q.mid);
      const cr = this._cost(r, qty, q.mid);
      if (!this._canCover(inAcc, ci.margin + ci.commission - ci.portion)) { this._event(sym, o.id, r.id, 'FUNDS_SKIP', 'incoming account cannot fund an internal fill'); break; }
      if (!this._canCover(this.accounts.get(r.accountId), cr.margin + cr.commission - cr.portion)) { this._event(sym, o.id, r.id, 'FUNDS_SKIP', 'resting account cannot fund this fill'); continue; }
      this._book(o, qty, q.mid, ci, true);
      this._book(r, qty, q.mid, cr, true);
      this._settleStatus(r);
      const buy = isBuy ? o : r;
      const sell = isBuy ? r : o;
      const m = {
        id: ++this.ids.match, symbolCode: sym, buyOrderId: buy.id, sellOrderId: sell.id, buyAccountId: buy.accountId, sellAccountId: sell.accountId,
        quantity: qty, bid: q.bid, mid: q.mid, ask: q.ask, buyerImprovement: (q.ask - q.mid) * qty * cs, sellerImprovement: (q.mid - q.bid) * qty * cs,
        externalFeeSaved: 3, buyerSimulated: this.accounts.get(buy.accountId).simulated, sellerSimulated: this.accounts.get(sell.accountId).simulated, createdAt: new Date().toISOString(),
      };
      this.matches.push(m);
      this._event(sym, o.id, r.id, 'MATCHED', `${qty} @ ${q.mid}`, m.id);
    }
    const left = this._remaining(o);
    if (left > 0) {
      if (o.orderType === 'LIQUIDITY') {
        o.status = o.filledQty > 0 ? 'PARTIALLY_FILLED' : 'NEW';
        this._event(sym, o.id, null, 'RESTING', `computer quote rests ${left}`);
      } else if (o.orderType === 'LIMIT') {
        const marketable = isBuy ? q.mid <= o.limitPrice : q.mid >= o.limitPrice;
        if (!marketable) {
          o.status = o.filledQty > 0 ? 'PARTIALLY_FILLED' : 'NEW'; o.netDeadline = null;
          this._event(sym, o.id, null, 'RESTING', `limit ${o.limitPrice} not marketable at mid ${q.mid}`);
        } else if (this.limitWait > 0 && !o.netDeadline) {
          o.netDeadline = Date.now() + this.limitWait; o.status = 'PENDING_NET';
          this._event(sym, o.id, null, 'WAITING_FOR_MATCH', `waiting up to ${this.limitWait} ms for an internal counterparty`);
        } else if (this.limitWait > 0 && Date.now() < o.netDeadline) {
          o.status = 'PENDING_NET';
        } else {
          this._external(o, left, q);
        }
      } else {
        this._external(o, left, q);
      }
    }
    this._settleStatus(o);
    this._shadow(o, plan, q);
  }

  _external(o, qty, q) {
    const price = o.side === 'BUY' ? Math.round(q.mid * 1.00015 * 1e5) / 1e5 : Math.round(q.mid * 0.99985 * 1e5) / 1e5;
    const c = this._cost(o, qty, price);
    const acc = this.accounts.get(o.accountId);
    if (!this._canCover(acc, c.margin + c.commission - c.portion)) {
      this._credit(acc, o.reserveRemaining); o.reserveRemaining = 0;
      o.status = o.filledQty > 0 ? 'CANCELLED' : 'REJECTED';
      this._event(o.symbolCode, o.id, null, 'ORDER_REJECTED', 'credit limit would be exceeded by the external fill');
      return;
    }
    this._book(o, qty, price, c, false);
    o.netDeadline = null;
    this._event(o.symbolCode, o.id, null, 'EXTERNAL_FILL', `${qty} @ ${price}`);
  }

  _shadow(o, plan, q) {
    if (o.orderType === 'LIQUIDITY' || this.accounts.get(o.accountId).simulated) return;
    if (this.nnOffline || !this.nn) { o.nnRouteRecommendation = 'OFFLINE'; return; }
    const x = engine.features({ ownQty: o.quantity, oppositeQty: plan.fills.reduce((s, f) => s + Number(f.qty), 0), bid: q.bid, ask: q.ask, ownDepth: 0, oppositeDepth: plan.fills.length, historicalMatchRate: 0.5 });
    o.nnRouteRecommendation = this.nn.predict(x)[2] > 0.5 ? 'INTERNAL' : 'EXTERNAL';
    o.nnShadowCorrect = (o.nnRouteRecommendation === 'INTERNAL') === (o.internalQty > 0);
  }

  _tick() {
    for (const o of [...this.orders.values()]) {
      if (!OPEN.includes(o.status) || o.orderType !== 'LIMIT') continue;
      const q = this._quote(o.symbolCode);
      const marketable = o.side === 'BUY' ? q.mid <= o.limitPrice : q.mid >= o.limitPrice;
      if (!marketable) {
        if (o.status === 'PENDING_NET') { o.status = o.filledQty > 0 ? 'PARTIALLY_FILLED' : 'NEW'; o.netDeadline = null; }
        continue;
      }
      this._process(o);
    }
  }

  _simTick() {
    if (!this.simEnabled) return;
    const sym = this.symbol;
    const q = this._quote(sym);
    const cs = contractSize(sym);
    const unit = cs === 1 ? 0.01 : 0.1;
    for (const o of [...this.orders.values()]) {
      if (o.orderType === 'LIQUIDITY' && OPEN.includes(o.status) && Date.now() - o.createdAtMs > 30000) this._cancel(o);
    }
    for (const side of ['BUY', 'SELL']) {
      const n = this._resting(sym, side, -1).filter((o) => o.orderType === 'LIQUIDITY').length;
      for (let i = n; i < 3; i++) {
        const bps = -2 + Math.random() * 4;
        this._placeLiquidity(this.sims[i % 2].id, sym, side, Number((unit * (1 + Math.random() * 10)).toFixed(3)), q.mid * (1 + bps / 1e4));
      }
    }
    if (Math.random() < 0.1) this._placeMarket(this.sims[1].id, sym, Math.random() < 0.5 ? 'BUY' : 'SELL', unit);
  }

  _newOrder(accountId, sym, side, type, qty, limit, reserve) {
    const o = {
      id: ++this.ids.ord, accountId, symbolCode: sym, side, orderType: type, status: 'NEW', quantity: Number(qty), filledQty: 0, internalQty: 0, externalQty: 0,
      limitPrice: limit === null || limit === undefined ? null : Number(limit), reserveRemaining: reserve, routing: null, entryPrice: null, commission: 0,
      createdAtMs: Date.now(), createdAt: new Date().toISOString(), netDeadline: null, nnRouteRecommendation: null, nnShadowCorrect: null,
    };
    this.orders.set(o.id, o);
    return o;
  }

  _placeMarket(accountId, sym, side, qty) {
    const acc = this.accounts.get(accountId);
    const q = this._quote(sym);
    const px = side === 'BUY' ? Math.round(q.mid * 1.00015 * 1e5) / 1e5 : Math.round(q.mid * 0.99985 * 1e5) / 1e5;
    const reserve = this._margin(sym, Number(qty), px) + this._commission(sym, Number(qty), px);
    if (!this._debit(acc, reserve)) return { ok: false, error: 'credit_limit_exceeded' };
    const o = this._newOrder(accountId, sym, side, 'MARKET', qty, null, reserve);
    this._process(o);
    return { ok: true, order: o };
  }

  _placeLiquidity(accountId, sym, side, qty, limit) {
    const acc = this.accounts.get(accountId);
    const reserve = this._margin(sym, Number(qty), Number(limit));
    if (!this._debit(acc, reserve)) return null;
    const o = this._newOrder(accountId, sym, side, 'LIQUIDITY', qty, limit, reserve);
    this._process(o);
    return o;
  }

  _cancel(o) {
    const acc = this.accounts.get(o.accountId);
    this._credit(acc, o.reserveRemaining);
    o.reserveRemaining = 0;
    if (o.orderType === 'LIQUIDITY' && o.filledQty === 0) this.orders.delete(o.id);
    else { o.status = 'CANCELLED'; o.netDeadline = null; }
  }

  _result(o) {
    const acc = this.accounts.get(o.accountId);
    return { ok: true, orderId: o.id, status: o.status, fillPrice: o.entryPrice, newBalance: acc.balance, routing: o.routing, filledQty: o.filledQty, internalQty: o.internalQty, externalQty: o.externalQty, matches: 0 };
  }

  _view(o) {
    return { id: o.id, symbolCode: o.symbolCode, side: o.side, orderType: o.orderType, status: o.status, quantity: o.quantity, filledQty: o.filledQty, internalQty: o.internalQty, externalQty: o.externalQty, limitPrice: o.limitPrice, routing: o.routing, entryPrice: o.entryPrice, commission: o.commission, nnRouteRecommendation: o.nnRouteRecommendation, createdAt: o.createdAt };
  }

  session(label, email) {
    const b = this;
    const acc = b._account(email, label, false, 100000);
    const res = (ok, data) => ({ ok, status: ok ? 200 : 400, data });
    return {
      label, email,
      async ensureLoggedIn() { return true; },
      async overview() { return { tradingAccountId: acc.id, balance: acc.balance, equity: acc.balance + b._unrealized(acc.id), borrowedBalance: acc.borrowed }; },
      async positions() { return [...b.positions.values()].filter((p) => p.accountId === acc.id).map((p) => ({ ...p, unrealizedPnl: b._pnl(p) })); },
      async orders() { return [...b.orders.values()].filter((o) => o.accountId === acc.id).map((o) => b._view(o)).reverse(); },
      async pending() { return [...b.orders.values()].filter((o) => o.accountId === acc.id && OPEN.includes(o.status)).map((o) => b._view(o)); },
      async placeOrder({ symbol, side, qty, type = 'MARKET', limit }) {
        if (type === 'MARKET') {
          const r = b._placeMarket(acc.id, symbol, side, Number(qty));
          return r.ok ? res(true, b._result(r.order)) : res(false, { ok: false, error: r.error });
        }
        const reserve = b._margin(symbol, Number(qty), Number(limit));
        if (!b._debit(acc, reserve)) return res(false, { ok: false, error: 'credit_limit_exceeded' });
        const o = b._newOrder(acc.id, symbol, side, 'LIMIT', Number(qty), Number(limit), reserve);
        b._process(o);
        return res(true, b._result(o));
      },
      async cancel(id) {
        const o = b.orders.get(id);
        if (!o || o.accountId !== acc.id || !OPEN.includes(o.status)) return res(false, { ok: false, error: 'order_not_cancellable' });
        b._cancel(o);
        return res(true, { ok: true, newBalance: acc.balance });
      },
      async closePosition(id) {
        const p = b.positions.get(id);
        if (!p || p.accountId !== acc.id) return res(false, { ok: false, error: 'position_not_found' });
        const q = b._quote(p.symbolCode);
        const closePx = p.side === 'LONG' ? q.bid : q.ask;
        const cs = contractSize(p.symbolCode);
        const gross = (p.side === 'LONG' ? closePx - p.avgPrice : p.avgPrice - closePx) * p.quantity * cs;
        const fee = b._commission(p.symbolCode, p.quantity, closePx);
        b._credit(acc, 0); // no-op; keep signature parity
        const settle = b._margin(p.symbolCode, p.quantity, p.avgPrice) + gross - fee;
        if (settle >= 0) b._credit(acc, settle); else b._debit(acc, -settle);
        b.positions.delete(id);
        return res(true, { ok: true, closePnl: r2(gross - fee), newBalance: acc.balance });
      },
      async cancelAllOpen() { const open = await this.pending(); for (const o of open) await this.cancel(o.id); return open.length; },
      async closeAll(symbol) {
        const out = [];
        for (const p of await this.positions()) { if (symbol && p.symbolCode !== symbol) continue; const r = await this.closePosition(p.id); out.push({ id: p.id, ok: r.ok }); }
        return out;
      },
    };
  }

  _pnl(p) {
    const mid = this._quote(p.symbolCode).mid;
    return r2((p.side === 'LONG' ? mid - p.avgPrice : p.avgPrice - mid) * p.quantity * contractSize(p.symbolCode));
  }

  _unrealized(accId) { return [...this.positions.values()].filter((p) => p.accountId === accId).reduce((s, p) => s + this._pnl(p), 0); }

  _exposure() {
    const out = {};
    for (const o of this.orders.values()) {
      if (o.internalQty <= 0) continue;
      out[o.symbolCode] = Number(((out[o.symbolCode] || 0) + (o.side === 'BUY' ? o.internalQty : -o.internalQty)).toFixed(10));
    }
    return out;
  }

  admin() {
    const b = this;
    const simIdx = (n) => b.sims[Math.max(0, Math.min(1, Number(n || 1) - 1))].id;
    return {
      async health() { return { ok: true }; },
      async testStatus() { return { testEndpointsEnabled: true, limitWaitMs: b.limitWait, nnOffline: b.nnOffline, simulatorEnabled: b.simEnabled }; },
      async simEnabled(on) { b.simEnabled = !!on; if (!on) for (const o of [...b.orders.values()]) if (o.orderType === 'LIQUIDITY' && OPEN.includes(o.status)) b._cancel(o); return { ok: true }; },
      async simClear() { let n = 0; for (const o of [...b.orders.values()]) if (o.orderType === 'LIQUIDITY' && OPEN.includes(o.status)) { b._cancel(o); n++; } return { ok: true, cancelled: n }; },
      async inject({ symbol, side, qty, offsetBps = 0, account = 1 }) {
        const limit = b._quote(symbol).mid * (1 + offsetBps / 1e4);
        const o = b._placeLiquidity(simIdx(account), symbol, side, Number(qty), limit);
        return { ok: true, orderId: o.id, status: o.status, routing: o.routing, limit };
      },
      async simMarket({ symbol, side, qty, account = 2 }) {
        const r = b._placeMarket(simIdx(account), symbol, side, Number(qty));
        return { ok: true, orderId: r.order.id, status: r.order.status, routing: r.order.routing, internalQty: r.order.internalQty, externalQty: r.order.externalQty };
      },
      async freeze(symbol, mid) { const q = b.quotes[symbol] || (b.quotes[symbol] = {}); if (mid !== undefined) q.mid = Number(mid); q.frozen = true; q.crossed = false; return { ok: true }; },
      async unfreeze(symbol) { for (const [k, q] of Object.entries(b.quotes)) if (!symbol || k === symbol) { q.frozen = false; q.crossed = false; } return { ok: true }; },
      async crossed(symbol, on) { b.quotes[symbol].crossed = !!on; return { ok: true }; },
      async nnOffline(on) { b.nnOffline = !!on; return { ok: true }; },
      async limitWaitMs(ms) { b.limitWait = Math.max(0, Number(ms)); return { ok: true }; },
      async book(symbol) {
        const q = b._quote(symbol);
        const qs = b.quotes[symbol];
        const row = (o) => { const a = b.accounts.get(o.accountId); return { orderId: o.id, accountId: a.id, owner: a.email, simulated: a.simulated, type: o.orderType, status: o.status, quantity: o.quantity, remaining: b._remaining(o), limit: o.limitPrice, bpsFromMid: o.limitPrice ? Math.round((o.limitPrice - q.mid) / q.mid * 1e6) / 100 : null, netDeadline: o.netDeadline, createdAt: o.createdAt }; };
        const open = [...b.orders.values()].filter((o) => o.symbolCode === symbol && OPEN.includes(o.status));
        return {
          symbol, bid: q.bid, mid: q.mid, ask: q.ask, frozen: !!qs.frozen, crossed: !!qs.crossed,
          buys: open.filter((o) => o.side === 'BUY').map(row).sort((x, y) => (y.limit ?? 0) - (x.limit ?? 0)),
          sells: open.filter((o) => o.side === 'SELL').map(row).sort((x, y) => (x.limit ?? 1e18) - (y.limit ?? 1e18)),
        };
      },
      async events(since = 0) { return { lastSeq: b.seq, events: b.events.filter((e) => e.seq > since) }; },
      async matches(since = 0) { return b.matches.filter((m) => m.id > since); },
      async simStatus() {
        return { enabled: b.simEnabled, symbols: [b.symbol], accounts: b.sims.map((a) => ({ accountId: a.id, email: a.email, displayName: a.name, balance: a.balance, equity: a.balance + b._unrealized(a.id), openPositions: [...b.positions.values()].filter((p) => p.accountId === a.id).length, unrealizedPnl: b._unrealized(a.id), openQuotes: [...b.orders.values()].filter((o) => o.accountId === a.id && OPEN.includes(o.status)).length })) };
      },
      async summary() {
        const real = [...b.orders.values()].filter((o) => o.routing && !b.accounts.get(o.accountId).simulated);
        const filled = real.reduce((s, o) => s + o.filledQty, 0);
        const internal = real.reduce((s, o) => s + o.internalQty, 0);
        const extLegs = real.filter((o) => o.externalQty > 0).length;
        const comm = real.reduce((s, o) => s + o.commission, 0);
        const saved = b.matches.length * 3;
        return {
          orders: real.length, filledQty: filled, internalQty: internal, externalQty: filled - internal, internalRateByQty: filled > 0 ? internal / filled : 0,
          matches: b.matches.length, matchesWithComputer: b.matches.filter((m) => m.buyerSimulated || m.sellerSimulated).length,
          clientPriceImprovement: b.matches.reduce((s, m) => s + (m.buyerSimulated ? 0 : m.buyerImprovement) + (m.sellerSimulated ? 0 : m.sellerImprovement), 0),
          externalFeesSaved: saved, externalFeesPaid: extLegs * 1.5, commissionRealClients: comm, brokerRevenue: comm + saved - extLegs * 1.5,
          houseNetExposure: b._exposure(), simulatorEnabled: b.simEnabled, limitWaitMs: b.limitWait, nnOffline: b.nnOffline,
        };
      },
      async invariants() {
        const inv = (v, meaning) => ({ pass: v === 0, violations: v, meaning });
        const i1 = b.matches.filter((m) => !(m.bid < m.mid && m.mid < m.ask)).length;
        const i2 = b.matches.filter((m) => { const bo = b.orders.get(m.buyOrderId); const so = b.orders.get(m.sellOrderId); return (bo && bo.limitPrice !== null && bo.limitPrice < m.mid) || (so && so.limitPrice !== null && so.limitPrice > m.mid); }).length;
        const exp = b._exposure();
        const i3 = Object.values(exp).filter((v) => Math.abs(v) > 1e-12).length;
        const i4 = b.matches.filter((m) => m.buyAccountId === m.sellAccountId || (m.buyerSimulated && m.sellerSimulated)).length;
        const i5 = [...b.orders.values()].filter((o) => Math.abs(o.internalQty + o.externalQty - o.filledQty) > 1e-9 || o.filledQty > o.quantity + 1e-12).length;
        const i6 = [...b.orders.values()].filter((o) => o.filledQty > 0 && o.commission <= 0).length;
        const mq = b.matches.reduce((s, m) => s + m.quantity, 0);
        const bq = [...b.orders.values()].filter((o) => o.side === 'BUY').reduce((s, o) => s + o.internalQty, 0);
        const sq = [...b.orders.values()].filter((o) => o.side === 'SELL').reduce((s, o) => s + o.internalQty, 0);
        const i7 = Math.abs(mq - bq) < 1e-9 && Math.abs(mq - sq) < 1e-9 ? 0 : 1;
        const out = {
          I1_price_sanity: inv(i1, 'internal matches with bid<mid<ask violated'),
          I2_nbbo_both_sides: inv(i2, 'matches where a limit side did not accept the mid'),
          I3_house_net_exposure_zero: inv(i3, `net exposure ${JSON.stringify(exp)}`),
          I4_no_self_or_sim_sim: inv(i4, 'self or computer-vs-computer matches'),
          I5_quantity_accounting: inv(i5, 'internal+external != filled'),
          I6_commission_charged: inv(i6, 'filled orders without commission'),
          I7_every_internal_unit_has_a_real_counterparty: inv(i7, `match ${mq} / buy ${bq} / sell ${sq}`),
        };
        out.allPass = Object.values(out).every((x) => x.pass);
        return out;
      },
    };
  }
}

module.exports = { OfflineBroker };
