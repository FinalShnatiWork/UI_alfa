// @ts-nocheck
'use strict';
/**
 * V01–V16: every situation the netting model can hit, played by two real client sessions
 * (Trader A, Trader B) plus the computer (simulated liquidity). Shared by netting_visual_demo.js
 * (page) and netting_e2e.js (terminal). Assertions read what the BACKEND did — nothing is
 * re-computed here.
 *
 * ctx (built by the runner):
 *   A, B          Session-like objects (real users)
 *   admin         Admin-like object (/api/admin/netting/*)
 *   sym           symbol, e.g. BTCUSD
 *   mid           current frozen mid (Number)
 *   unit          base quantity for the symbol (e.g. 0.01 BTC)
 *   px(bps)       price at mid × (1 + bps/10000), as a string
 *   q(n)          n × unit, as a string
 *   say(en, he)   narrate a step (and pause for the viewer)
 *   refresh()     push book / accounts / events to the page
 *   check(name, pass, detail)
 *   waitFor(fn, ms, label)
 *   setMid(mid)   re-freeze the price
 *   matchesSince(startId), orderById(session, id), soakSeconds
 */

const near = (a, b, eps = 1e-9) => Math.abs(Number(a) - Number(b)) <= eps;

async function orderById(session, id) {
  const all = await session.orders();
  return (all || []).find((o) => o.id === id) || null;
}

function routingOf(r) {
  return r && r.data ? r.data.routing : undefined;
}

const scenarios = [
  {
    id: 'V01',
    title: { en: 'Empty book: A buys, nothing to net against', he: 'ספר ריק: A קונה, אין מול מי להתקזז' },
    actors: 'A',
    async run(ctx) {
      await ctx.say('Book is empty. Trader A sends a MARKET BUY.', 'הספר ריק. סוחר A שולח קנייה בשוק.');
      const r = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('order accepted', r.ok, JSON.stringify(r.data));
      ctx.check('routed EXTERNAL', routingOf(r) === 'EXTERNAL', `routing=${routingOf(r)}`);
      ctx.check('no internal quantity', near(r.data.internalQty, 0), `internalQty=${r.data.internalQty}`);
    },
  },
  {
    id: 'V02',
    title: { en: 'B sells below mid, A buys at market: client vs client', he: 'B מוכר מתחת לאמצע, A קונה בשוק: לקוח מול לקוח' },
    actors: 'A,B',
    async run(ctx) {
      await ctx.say('Trader B places a LIMIT SELL 1bp below mid — willing to accept the mid.', 'סוחר B שם מכירה במחיר 1bp מתחת לאמצע — מוכן לקבל את מחיר האמצע.');
      const b = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), type: 'LIMIT', limit: ctx.px(-1), strictLimit: true });
      await ctx.refresh();
      ctx.check('B waits for a counterparty (PENDING_NET)', b.ok && b.data.status === 'PENDING_NET', `status=${b.data && b.data.status}`);
      const m0 = await ctx.lastMatchId();
      await ctx.say('Trader A sends a MARKET BUY for the same size.', 'סוחר A שולח קנייה בשוק באותה כמות.');
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('A routed INTERNAL', routingOf(a) === 'INTERNAL', `routing=${routingOf(a)}`);
      ctx.check('A filled at the mid', near(a.data.fillPrice, ctx.mid, 1e-6), `fillPrice=${a.data.fillPrice} mid=${ctx.mid}`);
      const bo = await orderById(ctx.B, b.data.orderId);
      ctx.check("B's order FILLED internally", bo && bo.status === 'FILLED' && bo.routing === 'INTERNAL', bo && `${bo.status}/${bo.routing}`);
      const ms = await ctx.matchesSince(m0);
      ctx.check('exactly one internal match A↔B at mid', ms.length === 1 && near(ms[0].mid, ctx.mid, 1e-6) && !ms[0].buyerSimulated && !ms[0].sellerSimulated, JSON.stringify(ms.map((m) => [m.quantity, m.mid])));
    },
  },
  {
    id: 'V03',
    title: { en: 'B asks above mid: NBBO reject, A goes external', he: 'B דורש מעל האמצע: דחיית NBBO, A יוצא לשוק' },
    actors: 'A,B',
    async run(ctx) {
      await ctx.say('Trader B places a LIMIT SELL 1bp ABOVE mid (not marketable — it rests).', 'סוחר B שם מכירה 1bp מעל האמצע (לא ניתנת לביצוע — ממתינה בספר).');
      const b = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), type: 'LIMIT', limit: ctx.px(1), strictLimit: true });
      await ctx.refresh();
      ctx.check('B rests as NEW', b.ok && b.data.status === 'NEW', `status=${b.data && b.data.status}`);
      const e0 = await ctx.lastEventSeq();
      await ctx.say('Trader A buys at market. Crossing at mid would pay B less than B asked → rejected.', 'סוחר A קונה בשוק. הצלבה באמצע תשלם ל-B פחות ממה שביקש → נדחה.');
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('A routed EXTERNAL', routingOf(a) === 'EXTERNAL', `routing=${routingOf(a)}`);
      const ev = await ctx.eventsSince(e0);
      ctx.check('engine logged SELL_LIMIT_ABOVE_MID for B', ev.some((e) => e.code === 'SELL_LIMIT_ABOVE_MID' && e.restingOrderId === b.data.orderId), ev.map((e) => e.code).join(','));
      const bo = await orderById(ctx.B, b.data.orderId);
      ctx.check("B's order keeps resting", bo && bo.status === 'NEW', bo && bo.status);
    },
  },
  {
    id: 'V04',
    title: { en: 'Partial: 4 internal, 6 external (and a computer quote rejected)', he: 'חלקי: 4 בפנים, 6 בחוץ (וציטוט מחשב שנדחה)' },
    actors: 'A,B,C',
    async run(ctx) {
      await ctx.say('B sells 0.4 units 1bp below mid; the computer quotes 0.2 units 2bp ABOVE mid.', 'B מוכר 0.4 יחידה 1bp מתחת לאמצע; המחשב מצטט 0.2 יחידה 2bp מעל האמצע.');
      const b = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(0.4), type: 'LIMIT', limit: ctx.px(-1), strictLimit: true });
      const c = await ctx.admin.inject({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(0.2), offsetBps: 2, account: 1 });
      await ctx.refresh();
      const e0 = await ctx.lastEventSeq();
      await ctx.say('A buys 1 unit at market.', 'A קונה יחידה אחת בשוק.');
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('A routed SPLIT', routingOf(a) === 'SPLIT', `routing=${routingOf(a)}`);
      ctx.check('0.4 internal', near(a.data.internalQty, ctx.q(0.4)), `internal=${a.data.internalQty}`);
      ctx.check('0.6 external', near(a.data.externalQty, ctx.q(0.6)), `external=${a.data.externalQty}`);
      const ev = await ctx.eventsSince(e0);
      ctx.check('computer quote rejected by NBBO', ev.some((e) => e.code === 'SELL_LIMIT_ABOVE_MID' && e.restingOrderId === c.orderId), ev.map((e) => e.code).join(','));
      ctx.check('B filled', (await orderById(ctx.B, b.data.orderId)).status === 'FILLED');
    },
  },
  {
    id: 'V05',
    title: { en: 'Sell side: A bids above mid, B sells at market', he: 'צד המכירה: A מציע מעל האמצע, B מוכר בשוק' },
    actors: 'A,B',
    async run(ctx) {
      await ctx.say('A places a LIMIT BUY 1bp above mid (willing to pay the mid).', 'A שם קנייה 1bp מעל האמצע (מוכן לשלם את האמצע).');
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1), type: 'LIMIT', limit: ctx.px(1), strictLimit: true });
      await ctx.refresh();
      ctx.check('A waits (PENDING_NET)', a.ok && a.data.status === 'PENDING_NET', `status=${a.data && a.data.status}`);
      await ctx.say('B SELLS at market.', 'B מוכר בשוק.');
      const b = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('B routed INTERNAL', routingOf(b) === 'INTERNAL', `routing=${routingOf(b)}`);
      ctx.check('B received the mid (better than the bid)', near(b.data.fillPrice, ctx.mid, 1e-6), `fillPrice=${b.data.fillPrice}`);
      ctx.check('A filled', (await orderById(ctx.A, a.data.orderId)).status === 'FILLED');
    },
  },
  {
    id: 'V06',
    title: { en: 'Self-match prevention', he: 'מניעת מסחר מול עצמך' },
    actors: 'A',
    async run(ctx) {
      await ctx.say('A rests a SELL 1bp below mid, then A itself BUYS at market.', 'A שם מכירה 1bp מתחת לאמצע, ואז A עצמו קונה בשוק.');
      const s = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), type: 'LIMIT', limit: ctx.px(-1), strictLimit: true });
      await ctx.refresh();
      const e0 = await ctx.lastEventSeq();
      const b = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('buy routed EXTERNAL', routingOf(b) === 'EXTERNAL', `routing=${routingOf(b)}`);
      const ev = await ctx.eventsSince(e0);
      ctx.check('engine logged SELF_MATCH_SKIP', ev.some((e) => e.code === 'SELF_MATCH_SKIP' && e.restingOrderId === s.data.orderId), ev.map((e) => e.code).join(','));
      await ctx.A.cancel(s.data.orderId);
      await ctx.refresh();
    },
  },
  {
    id: 'V07',
    title: { en: 'Price-time priority', he: 'עדיפות לפי מחיר ואז זמן' },
    actors: 'A,B,C',
    async run(ctx) {
      await ctx.say('Book: B SELL 0.3 @−2bp (oldest), computer SELL 0.3 @−2bp (newer), B SELL 0.3 @−1bp.', 'ספר: B מוכר 0.3 ב-2bp- (הוותיק), המחשב 0.3 ב-2bp- (חדש יותר), B מוכר 0.3 ב-1bp-.');
      const b1 = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(0.3), type: 'LIMIT', limit: ctx.px(-2), strictLimit: true });
      await ctx.sleep(30);
      const c = await ctx.admin.inject({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(0.3), offsetBps: -2, account: 1 });
      const b2 = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(0.3), type: 'LIMIT', limit: ctx.px(-1), strictLimit: true });
      await ctx.refresh();
      const m0 = await ctx.lastMatchId();
      await ctx.say('A buys 0.5 at market: best price first, then the oldest.', 'A קונה 0.5 בשוק: המחיר הטוב ביותר קודם, ואז הוותיק.');
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(0.5) });
      await ctx.refresh();
      const ms = await ctx.matchesSince(m0);
      ctx.check('A fully INTERNAL', routingOf(a) === 'INTERNAL', `routing=${routingOf(a)}`);
      ctx.check('1st fill = B oldest @−2bp, 0.3', ms[0] && ms[0].sellOrderId === b1.data.orderId && near(ms[0].quantity, ctx.q(0.3)), JSON.stringify(ms.map((m) => [m.sellOrderId, m.quantity])));
      ctx.check('2nd fill = computer @−2bp, 0.2', ms[1] && ms[1].sellOrderId === c.orderId && near(ms[1].quantity, ctx.q(0.2)), '');
      ctx.check('B @−1bp untouched', ms.every((m) => m.sellOrderId !== b2.data.orderId));
    },
  },
  {
    id: 'V08',
    title: { en: 'A and B hit the same quote at the same moment', he: 'A ו-B פוגעים באותו ציטוט באותו רגע' },
    actors: 'A,B,C',
    async run(ctx) {
      await ctx.say('The computer offers 1 unit 1bp below mid. A and B both BUY 1 unit at the same instant.', 'המחשב מציע יחידה אחת 1bp מתחת לאמצע. A ו-B קונים יחידה אחת באותו רגע בדיוק.');
      const c = await ctx.admin.inject({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), offsetBps: -1, account: 1 });
      await ctx.refresh();
      const [a, b] = await Promise.all([
        ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) }),
        ctx.B.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) }),
      ]);
      await ctx.refresh();
      const internalTotal = Number(a.data.internalQty) + Number(b.data.internalQty);
      ctx.check('both orders completed', a.ok && b.ok && a.data.status === 'FILLED' && b.data.status === 'FILLED', `${a.data.status}/${b.data.status}`);
      ctx.check('the quote was sold exactly once (1 unit internal in total)', near(internalTotal, ctx.q(1)), `A internal=${a.data.internalQty}, B internal=${b.data.internalQty}`);
      const book = await ctx.admin.book(ctx.sym);
      ctx.check('computer quote no longer in the book', ![...book.sells, ...book.buys].some((r) => r.orderId === c.orderId));
    },
  },
  {
    id: 'V09',
    title: { en: 'Resting limit fills after the price moves', he: 'הוראה ממתינה מתבצעת אחרי שהמחיר זז' },
    actors: 'A,B',
    async run(ctx) {
      const base = ctx.mid;
      await ctx.say('A rests a LIMIT BUY 5bp below mid (not marketable).', 'A שם קנייה 5bp מתחת לאמצע (לא ניתנת לביצוע).');
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1), type: 'LIMIT', limit: ctx.px(-5), strictLimit: true });
      await ctx.refresh();
      ctx.check('A rests as NEW', a.ok && a.data.status === 'NEW', `status=${a.data && a.data.status}`);
      await ctx.say('B sells at market now → A does not accept the mid yet → B goes external.', 'B מוכר בשוק עכשיו → A עוד לא מקבל את האמצע → B יוצא לשוק.');
      const b1 = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('first B sell EXTERNAL', routingOf(b1) === 'EXTERNAL', `routing=${routingOf(b1)}`);
      await ctx.say('The price drops 10bp. A\'s limit is now above the mid, so the scheduler makes it wait for a counterparty.', 'המחיר יורד ב-10bp. המחיר של A עכשיו מעל האמצע, והמתזמן מעביר אותה להמתנה לצד נגדי.');
      await ctx.setMid(base * (1 - 0.001));
      const waiting = await ctx.waitFor(async () => {
        const o = await orderById(ctx.A, a.data.orderId);
        return o && o.status === 'PENDING_NET' ? o : null;
      }, 12000, "A's order becomes PENDING_NET");
      await ctx.refresh();
      ctx.check('A became PENDING_NET after the move', !!waiting);
      await ctx.say('B sells at market again.', 'B מוכר בשוק שוב.');
      const b2 = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1) });
      await ctx.refresh();
      ctx.check('second B sell INTERNAL', routingOf(b2) === 'INTERNAL', `routing=${routingOf(b2)}`);
      ctx.check('A filled', (await orderById(ctx.A, a.data.orderId)).status === 'FILLED');
      await ctx.setMid(base);
    },
  },
  {
    id: 'V10',
    title: { en: 'Partial fill, then cancel: refund only the unfilled part', he: 'מילוי חלקי ואז ביטול: החזר רק על החלק שלא בוצע' },
    actors: 'A,B',
    async run(ctx) {
      const before = Number((await ctx.A.overview()).balance);
      await ctx.say('A bids 1 unit 1bp above mid; B sells only 0.4 at market.', 'A מציע יחידה אחת 1bp מעל האמצע; B מוכר רק 0.4 בשוק.');
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1), type: 'LIMIT', limit: ctx.px(1), strictLimit: true });
      const b = await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(0.4) });
      await ctx.refresh();
      ctx.check('B INTERNAL', routingOf(b) === 'INTERNAL', `routing=${routingOf(b)}`);
      const partial = await orderById(ctx.A, a.data.orderId);
      ctx.check('A partially filled (0.4 of 1)', partial && near(partial.filledQty, ctx.q(0.4)), partial && `${partial.status} filled=${partial.filledQty}`);
      await ctx.say('A cancels the rest.', 'A מבטל את השאר.');
      const c = await ctx.A.cancel(a.data.orderId);
      await ctx.refresh();
      const after = Number((await ctx.A.overview()).balance);
      const cs = ctx.contractSize;
      const margin = Math.round(ctx.mid * Number(ctx.q(0.4)) * cs / 100 * 1e4) / 1e4;
      const commission = Math.round(ctx.mid * Number(ctx.q(0.4)) * cs * 0.002 * 100) / 100;
      const expected = before - margin - commission;
      ctx.check('cancel accepted', c.ok, JSON.stringify(c.data));
      ctx.check('balance = before − (margin + commission of the 0.4 filled)', Math.abs(after - expected) < 0.001, `before=${before} after=${after} expected=${expected.toFixed(4)}`);
    },
  },
  {
    id: 'V11',
    title: { en: 'Client vs computer', he: 'לקוח מול מחשב' },
    actors: 'A,C',
    async run(ctx) {
      await ctx.say('Only the computer is in the book: SELL 1 unit 1bp below mid.', 'רק המחשב בספר: מוכר יחידה אחת 1bp מתחת לאמצע.');
      await ctx.admin.inject({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), offsetBps: -1, account: 1 });
      await ctx.refresh();
      const m0 = await ctx.lastMatchId();
      const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
      await ctx.refresh();
      const ms = await ctx.matchesSince(m0);
      ctx.check('A INTERNAL', routingOf(a) === 'INTERNAL', `routing=${routingOf(a)}`);
      ctx.check('counterparty is the computer', ms.length === 1 && ms[0].sellerSimulated && !ms[0].buyerSimulated);
    },
  },
  {
    id: 'V12',
    title: { en: 'Computer never trades with computer', he: 'מחשב לא סוחר מול מחשב' },
    actors: 'C',
    async run(ctx) {
      await ctx.say('Computer #1 offers 1bp below mid; computer #2 buys at market.', 'מחשב 1 מציע 1bp מתחת לאמצע; מחשב 2 קונה בשוק.');
      const c1 = await ctx.admin.inject({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), offsetBps: -1, account: 1 });
      const e0 = await ctx.lastEventSeq();
      const c2 = await ctx.admin.simMarket({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1), account: 2 });
      await ctx.refresh();
      const ev = await ctx.eventsSince(e0);
      ctx.check('computer buy went EXTERNAL', c2.routing === 'EXTERNAL', `routing=${c2.routing}`);
      ctx.check('engine logged SIM_SIM_SKIP', ev.some((e) => e.code === 'SIM_SIM_SKIP' && e.restingOrderId === c1.orderId), ev.map((e) => e.code).join(','));
      const book = await ctx.admin.book(ctx.sym);
      ctx.check('computer #1 quote still resting', book.sells.some((r) => r.orderId === c1.orderId));
    },
  },
  {
    id: 'V13',
    title: { en: 'NN server offline: netting still works', he: 'שרת הרשת למטה: הנטינג ממשיך לעבוד' },
    actors: 'A,B',
    async run(ctx) {
      await ctx.admin.nnOffline(true);
      try {
        await ctx.say('The neural-network advisor is switched off. B sells 1bp below mid, A buys.', 'יועץ הרשת הנוירונית כבוי. B מוכר 1bp מתחת לאמצע, A קונה.');
        await ctx.B.placeOrder({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), type: 'LIMIT', limit: ctx.px(-1), strictLimit: true });
        const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
        await ctx.refresh();
        ctx.check('A still INTERNAL (decision never depends on the NN)', routingOf(a) === 'INTERNAL', `routing=${routingOf(a)}`);
        const shadow = await ctx.waitFor(async () => {
          const o = await orderById(ctx.A, a.data.orderId);
          return o && o.nnRouteRecommendation ? o : null;
        }, 5000, 'NN shadow field written');
        ctx.check('NN shadow recorded as OFFLINE', shadow && shadow.nnRouteRecommendation === 'OFFLINE', shadow && shadow.nnRouteRecommendation);
      } finally {
        await ctx.admin.nnOffline(false);
      }
    },
  },
  {
    id: 'V14',
    title: { en: 'Crossed market: no internal cross', he: 'שוק שבור: אין הצלבה פנימית' },
    actors: 'A,C',
    async run(ctx) {
      await ctx.admin.crossed(ctx.sym, true);
      try {
        await ctx.say('The quote is broken (bid above ask). The computer offers, A buys at market.', 'הציטוט שבור (Bid מעל Ask). המחשב מציע, A קונה בשוק.');
        await ctx.admin.inject({ symbol: ctx.sym, side: 'SELL', qty: ctx.q(1), offsetBps: -1, account: 1 });
        const e0 = await ctx.lastEventSeq();
        const a = await ctx.A.placeOrder({ symbol: ctx.sym, side: 'BUY', qty: ctx.q(1) });
        await ctx.refresh();
        const ev = await ctx.eventsSince(e0);
        ctx.check('A EXTERNAL', routingOf(a) === 'EXTERNAL', `routing=${routingOf(a)}`);
        ctx.check('engine logged CROSSED_MARKET', ev.some((e) => e.code === 'CROSSED_MARKET' && e.orderId === a.data.orderId), ev.map((e) => e.code).join(','));
      } finally {
        await ctx.admin.crossed(ctx.sym, false);
      }
    },
  },
  {
    id: 'V15',
    title: { en: 'Close everything: house exposure back to zero', he: 'סגירת הכול: החשיפה של הבית חוזרת לאפס' },
    actors: 'A,B',
    async run(ctx) {
      await ctx.say('A and B close all their positions on this symbol.', 'A ו-B סוגרים את כל הפוזיציות שלהם בנכס.');
      const ra = await ctx.A.closeAll(ctx.sym);
      const rb = await ctx.B.closeAll(ctx.sym);
      await ctx.refresh();
      ctx.check('all closes succeeded', [...ra, ...rb].every((r) => r.ok), JSON.stringify([...ra, ...rb].filter((r) => !r.ok)));
      const open = async () => ({
        a: (await ctx.A.positions()).filter((p) => p.symbolCode === ctx.sym).length,
        b: (await ctx.B.positions()).filter((p) => p.symbolCode === ctx.sym).length,
      });
      // A close rests in the book for up to limitWaitMs before it goes to the venue.
      const flat = await ctx.waitFor(async () => {
        const n = await open();
        return n.a === 0 && n.b === 0 ? n : null;
      }, 25000, 'A and B positions closed');
      await ctx.refresh();
      const left = flat || (await open());
      ctx.check('A and B are flat', !!flat, `A=${left.a} B=${left.b}`);
      const inv = await ctx.admin.invariants();
      ctx.check('house net exposure is 0 on every symbol (I3)', inv.I3_house_net_exposure_zero.pass, inv.I3_house_net_exposure_zero.meaning);
    },
  },
  {
    id: 'V16',
    title: { en: 'Soak: both clients trade freely against each other and the computer', he: 'הרצה חופשית: שני הלקוחות סוחרים זה מול זה ומול המחשב' },
    actors: 'A,B,C',
    async run(ctx) {
      const seconds = ctx.soakSeconds;
      await ctx.say(`${seconds}s of free trading. The computer quotes, the price wanders, A and B send random orders.`, `${seconds} שניות של מסחר חופשי. המחשב מצטט, המחיר נע, A ו-B שולחים הוראות אקראיות.`);
      const base = ctx.mid;
      await ctx.admin.simEnabled(true);
      const end = Date.now() + seconds * 1000;
      let mid = base;
      let n = 0;
      let rnd = 7;
      const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
      const errors = [];
      while (Date.now() < end) {
        mid = mid * (1 + (rand() - 0.5) * 0.0001); // ±0.5bp random walk
        await ctx.setMid(mid, { quiet: true });
        for (const who of [ctx.A, ctx.B]) {
          const side = rand() < 0.5 ? 'BUY' : 'SELL';
          const qty = ctx.q([0.2, 0.5, 1, 1.5][Math.floor(rand() * 4)]);
          const useLimit = rand() < 0.3;
          const r = useLimit
            ? await who.placeOrder({ symbol: ctx.sym, side, qty, type: 'LIMIT', limit: ctx.px(side === 'BUY' ? 1 : -1, mid), strictLimit: true })
            : await who.placeOrder({ symbol: ctx.sym, side, qty });
          n++;
          if (!r.ok) errors.push(`${who.label} ${side} ${qty}: ${JSON.stringify(r.data)}`);
        }
        await ctx.refresh();
        await ctx.sleep(900);
      }
      await ctx.admin.simEnabled(false);
      await ctx.A.cancelAllOpen();
      await ctx.B.cancelAllOpen();
      await ctx.setMid(base);
      const s = await ctx.admin.summary();
      ctx.check(`${n} random orders accepted`, errors.length === 0, errors.slice(0, 3).join(' | '));
      ctx.check('some quantity netted internally', Number(s.internalQty) > 0, `internal rate by qty ${(Number(s.internalRateByQty) * 100).toFixed(1)}%`);
      await ctx.A.closeAll(ctx.sym);
      await ctx.B.closeAll(ctx.sym);
      await ctx.refresh();
      const inv = await ctx.admin.invariants();
      const names = Object.keys(inv).filter((k) => k.startsWith('I'));
      for (const k of names) ctx.check(`invariant ${k}`, inv[k].pass, inv[k].meaning);
    },
  },
];

module.exports = { scenarios, near, orderById };
