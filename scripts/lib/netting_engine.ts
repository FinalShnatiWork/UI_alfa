// @ts-nocheck
'use strict';
/**
 * JS port of backend/src/main/java/com/brokerui/broker/netting/NettingEngine.java.
 * Same rules, same order, same reason codes. Kept in parity by buysellmodel/tests/model_check.js,
 * which runs every scenario in buysellmodel/tests/netting_scenarios.json through this file
 * (the Java engine is checked against the same file by NettingEngineScenarioTest).
 *
 * Decimal-safe: quantities and prices are handled as scaled BigInt (12 decimals), never floats.
 */

const SCALE = 12n;
const ONE = 10n ** SCALE;

function toFixed(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  const frac = (f + '0'.repeat(Number(SCALE))).slice(0, Number(SCALE));
  const n = BigInt(i || '0') * ONE + BigInt(frac || '0');
  return neg ? -n : n;
}

function toStr(n) {
  if (n === null || n === undefined) return null;
  const neg = n < 0n;
  const a = neg ? -n : n;
  const i = a / ONE;
  let f = (a % ONE).toString().padStart(Number(SCALE), '0').replace(/0+$/, '');
  return (neg ? '-' : '') + i.toString() + (f ? '.' + f : '');
}

const C = {
  BUY: 'BUY', SELL: 'SELL',
  CROSSED_MARKET: 'CROSSED_MARKET',
  BUY_LIMIT_BELOW_MID: 'BUY_LIMIT_BELOW_MID',
  SELL_LIMIT_ABOVE_MID: 'SELL_LIMIT_ABOVE_MID',
  SELF_MATCH_SKIP: 'SELF_MATCH_SKIP',
  SIM_SIM_SKIP: 'SIM_SIM_SKIP',
  NBBO_OK: 'NBBO_OK',
  FILL: 'FILL',
  REMAINDER: 'REMAINDER',
};

function quoteValid(q) {
  return q && q.bid !== null && q.mid !== null && q.ask !== null && q.bid < q.mid && q.mid < q.ask;
}

/** @returns null when allowed, else reason code (same as NbboValidator.check). */
function nbbo(q, buyLimit, sellLimit) {
  if (!quoteValid(q)) return C.CROSSED_MARKET;
  if (buyLimit === null || buyLimit < q.mid) return C.BUY_LIMIT_BELOW_MID;
  if (sellLimit === null || sellLimit > q.mid) return C.SELL_LIMIT_ABOVE_MID;
  return null;
}

/**
 * @param {object} incoming {orderId, accountId, simulated, side, qty, limit|null} (qty/limit as strings or numbers)
 * @param {object[]} resting [{orderId, accountId, simulated, side, qty, limit, createdAtMs}]
 * @param {object} quote {bid, mid, ask}
 * @returns {{fills: {restingOrderId, restingAccountId, restingSimulated, qty, price}[], remainder: string, decisions: {code, restingOrderId, detail}[], rejectReason: string|null}}
 */
function plan(incoming, resting, quote) {
  const q = { bid: toFixed(quote.bid), mid: toFixed(quote.mid), ask: toFixed(quote.ask) };
  const fills = [];
  const decisions = [];
  let left = toFixed(incoming.qty) ?? 0n;
  const out = (reject) => ({ fills, remainder: toStr(left), decisions, rejectReason: reject });

  if (!quoteValid(q)) {
    decisions.push({ code: C.CROSSED_MARKET, restingOrderId: null, detail: 'bid must be < mid < ask' });
    return out(C.CROSSED_MARKET);
  }
  const isBuy = incoming.side === C.BUY;
  const inLimit = incoming.limit === null || incoming.limit === undefined ? (isBuy ? q.ask : q.bid) : toFixed(incoming.limit);
  if (isBuy && inLimit < q.mid) {
    decisions.push({ code: C.BUY_LIMIT_BELOW_MID, restingOrderId: null, detail: `incoming buy limit ${toStr(inLimit)} < mid ${toStr(q.mid)}` });
    return out(C.BUY_LIMIT_BELOW_MID);
  }
  if (!isBuy && inLimit > q.mid) {
    decisions.push({ code: C.SELL_LIMIT_ABOVE_MID, restingOrderId: null, detail: `incoming sell limit ${toStr(inLimit)} > mid ${toStr(q.mid)}` });
    return out(C.SELL_LIMIT_ABOVE_MID);
  }

  const opposite = isBuy ? C.SELL : C.BUY;
  const book = resting
    .filter((r) => r && r.side === opposite && r.orderId !== incoming.orderId && r.limit !== null && r.limit !== undefined && toFixed(r.qty) > 0n)
    .map((r) => ({ ...r, _qty: toFixed(r.qty), _limit: toFixed(r.limit) }));
  book.sort((a, b) => {
    if (a._limit !== b._limit) return isBuy ? (a._limit < b._limit ? -1 : 1) : (a._limit > b._limit ? -1 : 1);
    if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
    return a.orderId - b.orderId;
  });

  for (const r of book) {
    if (left <= 0n) break;
    if (r.accountId === incoming.accountId) {
      decisions.push({ code: C.SELF_MATCH_SKIP, restingOrderId: r.orderId, detail: `same account ${r.accountId}` });
      continue;
    }
    if (r.simulated && incoming.simulated) {
      decisions.push({ code: C.SIM_SIM_SKIP, restingOrderId: r.orderId, detail: 'computer never trades with computer' });
      continue;
    }
    const reason = isBuy ? nbbo(q, inLimit, r._limit) : nbbo(q, r._limit, inLimit);
    if (reason) {
      decisions.push({ code: reason, restingOrderId: r.orderId, detail: `resting limit ${toStr(r._limit)} vs mid ${toStr(q.mid)}` });
      continue;
    }
    const qty = left < r._qty ? left : r._qty;
    decisions.push({ code: C.NBBO_OK, restingOrderId: r.orderId, detail: `resting limit ${toStr(r._limit)} vs mid ${toStr(q.mid)}` });
    fills.push({ restingOrderId: r.orderId, restingAccountId: r.accountId, restingSimulated: !!r.simulated, qty: toStr(qty), price: toStr(q.mid) });
    decisions.push({ code: C.FILL, restingOrderId: r.orderId, detail: `${toStr(qty)} @ ${toStr(q.mid)}` });
    left -= qty;
  }
  if (left > 0n) decisions.push({ code: C.REMAINDER, restingOrderId: null, detail: toStr(left) });
  return out(null);
}

/** Same as FeatureBuilder.extract / nn_core.extractFeatures (side-aware naming). */
function features({ ownQty, oppositeQty, bid, ask, ownDepth, oppositeDepth, historicalMatchRate }) {
  const mid = (bid + ask) / 2;
  const spread = ask - bid;
  const sumQty = ownQty + oppositeQty;
  const imbalance = sumQty > 0 ? (ownQty - oppositeQty) / sumQty : 0;
  return [
    Math.min(ownQty / 100, 1),
    Math.min(oppositeQty / 100, 1),
    Math.min(spread / 1, 1),
    (imbalance + 1) / 2,
    Math.min(mid / 200, 1),
    Math.min(ownDepth / 10, 1),
    Math.min(oppositeDepth / 10, 1),
    Math.min(Math.max(historicalMatchRate, 0), 1),
  ];
}

/** Numeric equality of two decimal strings (e.g. "4" vs "4.00000000"). */
function decEq(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return a == b;
  return toFixed(a) === toFixed(b);
}

module.exports = { plan, features, nbbo, decEq, toFixed, toStr, CODES: C };
