// Typed wrapper around fetch — preserves CSRF + cookie auth from the legacy api.js.

// Toggle to control whether we run in offline Mock Mode (recommended for GitHub Pages portfolio)
export const IS_MOCK = localStorage.getItem('force_mock') === 'true' || 
                       (!window.location.hostname.includes('localhost') && 
                        !window.location.hostname.includes('127.0.0.1'));

// Fired whenever the server returns 401. Components can listen and redirect.
export const onUnauthorized: Array<() => void> = [];

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

/**
 * Custom Error extension holding API response code details and context payload.
 */
export class ApiError extends Error {
  /**
   * Constructs the ApiError exception.
   *
   * @param status HTTP response code
   * @param body HTTP response payload text
   * @param path request path target URL
   */
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`API ${path} failed: ${status} ${body}`);
    this.name = 'ApiError';
  }
}

// -------------------------------------------------------------
// MOCK DATA LAYER (for Client-Side Portfolio execution)
// -------------------------------------------------------------

const MOCK_DELAY = 150; // simulated latency

const defaultOverview = {
  tradingAccountId: 1001,
  accountType: "DEMO",
  currency: "USD",
  leverage: 100,
  balance: 100000.00,
  equity: 100000.00,
  marginUsed: 0.00,
  freeMargin: 100000.00
};

const defaultNotifications = [
  {
    id: 1,
    notifType: "INFO",
    title: "ברוך הבא לתיק העבודות!",
    body: "זהו ממשק דמו אינטראקטיבי מלא הפועל ישירות בדפדפן (Client-Side).",
    readAt: null,
    createdAt: new Date().toISOString()
  }
];

const defaultPreferences = {
  lang: "he",
  theme: "dark"
};

function getStorage<T>(key: string, def: T): T {
  const val = localStorage.getItem(key);
  if (!val) {
    localStorage.setItem(key, JSON.stringify(def));
    return def;
  }
  try {
    return JSON.parse(val);
  } catch {
    return def;
  }
}

function setStorage<T>(key: string, val: T): void {
  localStorage.setItem(key, JSON.stringify(val));
}

function parseOverviewValue(val: any): number {
  if (typeof val === 'number') return val;
  return parseFloat(val || '0');
}

// Fetch live prices using Bybit directly for crypto (to match requested feed) and backend proxy as fallback/Forex.
async function getLivePrice(symbol: string): Promise<number> {
  const sym = symbol.replace('/', '').toUpperCase();
  
  if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('SOL') || sym.includes('XRP')) {
    try {
      const mapped = sym.endsWith('USD') ? sym + 'T' : sym;
      const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${mapped}`);
      if (res.ok) {
        const data = await res.json();
        const priceStr = data.result?.list?.[0]?.lastPrice;
        if (priceStr) return parseFloat(priceStr);
      }
    } catch (e) {
      console.error("Bybit direct fetch failed, falling back to backend", e);
    }
  }

  try {
    const res = await fetch(`/api/market/price/${sym}`);
    if (res.ok) {
      const data = await res.json();
      if (data.price) return Number(data.price);
    }
  } catch (e) {
    console.error("Backend price fetch failed", e);
  }

  // Fallbacks if both fail
  if (symbol.includes('BTC')) return 103430.50;
  if (symbol.includes('ETH')) return 2420.20;
  if (symbol.includes('SOL')) return 170.80;
  if (symbol.includes('XAU')) return 4660.00;
  if (symbol.includes('XAG')) return 83.00;
  return 1.17;
}

/**
 * Returns contract size multiplier for a given trading symbol.
 *
 * @param symbol asset symbol
 * @returns contract size multiplier
 */
export function getContractSize(symbol: string): number {
  const sym = symbol.toUpperCase();
  if (sym.includes('BTC')) return 1;
  if (sym.includes('ETH')) return 1;
  if (sym.includes('SOL')) return 100;
  if (sym.includes('XRP')) return 1000;
  if (sym.includes('XAU')) return 100;
  if (sym.includes('XAG')) return 5000;
  return 100000;
}

/**
 * Background-like matching scheduler for offline mock portfolio mode.
 * Evaluates pending LIMIT / STOP orders against live market quotes,
 * deducts/adjusts margins, handles separate positions (hedging),
 * and creates trade fills.
 */
async function processMockPendingOrders(): Promise<void> {
  const pending = getStorage<any[]>('mock_pending', []);
  if (pending.length === 0) return;

  const positions = getStorage<any[]>('mock_positions', []);
  const overview = getStorage<any>('mock_overview', defaultOverview);
  const history = getStorage<any[]>('mock_history', []);
  const notifications = getStorage<any[]>('mock_notifications', defaultNotifications);

  let balance = parseOverviewValue(overview.balance);
  let changed = false;
  const stillPending: any[] = [];

  for (const order of pending) {
    try {
      const price = await getLivePrice(order.symbolCode);
      const qty = parseFloat(order.quantity);
      const limitVal = order.limitPrice ? parseFloat(order.limitPrice) : null;
      const stopVal = order.stopPrice ? parseFloat(order.stopPrice) : null;
      
      let shouldFill = false;
      if (order.orderType === 'LIMIT') {
        if (order.side === 'BUY' && limitVal !== null) {
          shouldFill = price <= limitVal;
        } else if (order.side === 'SELL' && limitVal !== null) {
          shouldFill = price >= limitVal;
        }
      } else if (order.orderType === 'STOP') {
        if (order.side === 'BUY' && stopVal !== null) {
          shouldFill = price >= stopVal;
        } else if (order.side === 'SELL' && stopVal !== null) {
          shouldFill = price <= stopVal;
        }
      }

      if (shouldFill) {
        changed = true;
        const fillPrice = limitVal ?? stopVal ?? price;
        const leverage = 100;
        const contractSize = getContractSize(order.symbolCode);
        const cost = (qty * contractSize * fillPrice) / leverage;

        // Refund reserved funds, then deduct actual fill cost
        const reservedPrice = limitVal ?? stopVal ?? fillPrice;
        const reserved = (qty * contractSize * reservedPrice) / leverage;
        
        balance = balance + reserved - cost;

        // Hedging model: BUY opens a LONG position, SELL opens a SHORT position (no opposite merges).
        const sideTarget = order.side === 'BUY' ? 'LONG' : 'SHORT';
        const existingPosIdx = positions.findIndex(p => p.symbolCode === order.symbolCode && p.side === sideTarget);

        if (existingPosIdx !== -1) {
          const p = positions[existingPosIdx];
          const currentQty = parseFloat(p.quantity);
          const currentVal = currentQty * parseFloat(p.avgPrice);
          const newVal = qty * fillPrice;
          p.quantity = (currentQty + qty).toString();
          p.avgPrice = ((currentVal + newVal) / (currentQty + qty)).toFixed(2);
        } else {
          positions.push({
            id: Date.now() + Math.random(),
            symbolCode: order.symbolCode,
            side: sideTarget,
            quantity: qty.toString(),
            avgPrice: fillPrice.toString(),
            unrealizedPnl: '0.00',
            openedAt: new Date().toISOString()
          });
        }

        // Move to history as FILLED
        history.unshift({
          id: order.id,
          symbolCode: order.symbolCode,
          side: order.side,
          orderType: order.orderType,
          status: 'FILLED',
          quantity: order.quantity,
          limitPrice: order.limitPrice,
          stopPrice: order.stopPrice,
          entryPrice: fillPrice.toString(),
          createdAt: order.createdAt,
          filledAt: new Date().toISOString()
        });

        // Add trade notification
        notifications.unshift({
          id: Date.now() + Math.random(),
          notifType: 'TRADE',
          title: 'notification.tradeOpened.title',
          body: JSON.stringify({ side: order.side, qty: qty.toFixed(4), symbol: order.symbolCode, price: fillPrice.toFixed(5) }),
          readAt: null,
          createdAt: new Date().toISOString()
        });
      } else {
        stillPending.push(order);
      }
    } catch {
      stillPending.push(order);
    }
  }

  if (changed) {
    overview.balance = balance;
    setStorage('mock_overview', overview);
    setStorage('mock_positions', positions);
    setStorage('mock_history', history);
    setStorage('mock_pending', stillPending);
    setStorage('mock_notifications', notifications);
  }
}

async function mockGet(path: string): Promise<any> {
  await new Promise(r => setTimeout(r, MOCK_DELAY));

  if (path.includes('/api/auth/csrf')) {
    return {};
  }

  if (path.includes('/api/health')) {
    return { status: 'UP' };
  }

  if (path.includes('/api/auth/me')) {
    if (localStorage.getItem('mock_logged_in') !== 'true') {
      throw new ApiError(401, 'Unauthorized', path);
    }
    return {
      id: 1,
      email: localStorage.getItem('mock_user_email') || 'demo@tradeadge.com',
      displayName: localStorage.getItem('mock_user_name') || 'דוד פורטפוליו',
      role: 'USER',
      createdAt: new Date().toISOString()
    };
  }

  if (path.includes('/api/broker/overview')) {
    await processMockPendingOrders();
    const overview = getStorage('mock_overview', defaultOverview);
    const positions = getStorage<any[]>('mock_positions', []);
    
    let unrealizedPnlTotal = 0;
    for (const pos of positions) {
      unrealizedPnlTotal += parseFloat(pos.unrealizedPnl || '0');
    }
    
    const balance = parseOverviewValue(overview.balance);
    const equity = balance + unrealizedPnlTotal;
    
    const updated = {
      ...overview,
      balance: balance.toFixed(2),
      equity: equity.toFixed(2),
      freeMargin: (equity - parseOverviewValue(overview.marginUsed)).toFixed(2)
    };
    
    setStorage('mock_overview', updated);
    return updated;
  }

  if (path.includes('/api/broker/positions')) {
    await processMockPendingOrders();
    const positions = getStorage<any[]>('mock_positions', []);
    for (const pos of positions) {
      const livePrice = await getLivePrice(pos.symbolCode);
      const avgPrice = parseFloat(pos.avgPrice);
      const qty = parseFloat(pos.quantity);
      
       let pnl = 0;
      const contractSize = getContractSize(pos.symbolCode);
      if (pos.side === 'SHORT') {
        pnl = (avgPrice - livePrice) * qty * contractSize;
      } else {
        pnl = (livePrice - avgPrice) * qty * contractSize;
      }
      pos.unrealizedPnl = pnl.toFixed(2);
    }
    setStorage('mock_positions', positions);
    return positions;
  }

  if (path.includes('/api/broker/notifications')) {
    return getStorage('mock_notifications', defaultNotifications);
  }

  if (path.includes('/api/broker/transactions')) {
    return getStorage('mock_transactions', [
      {
        id: 1,
        txType: "DEPOSIT",
        amount: 100000.00,
        method: "MOCK",
        status: "COMPLETED",
        createdAt: new Date().toISOString(),
        note: "Initial demo funds"
      }
    ]);
  }

  if (path.includes('/api/broker/history')) {
    return getStorage('mock_history', []);
  }

  if (path.includes('/api/broker/orders/pending')) {
    await processMockPendingOrders();
    return getStorage('mock_pending', []);
  }

  if (path.includes('/api/broker/preferences')) {
    return getStorage('mock_preferences', defaultPreferences);
  }

  if (path.includes('/api/market/price/')) {
    const parts = path.split('/');
    const symbol = parts[parts.length - 1];
    const price = await getLivePrice(symbol);
    return { price };
  }

  if (path.includes('/candles')) {
    const urlObj = new URL(path, window.location.origin);
    const symbol = urlObj.searchParams.get('symbol') || 'BTCUSDT';
    const cleanSymbol = symbol.replace('/', '').toUpperCase();
    try {
      const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=1h&limit=200`;
      const res = await fetch(binanceUrl);
      if (res.ok) {
        const klines = await res.json();
        return klines.map((k: any) => [
          k[0], // Time
          k[1], // Open
          k[2], // High
          k[3], // Low
          k[4], // Close
          k[5]  // Volume
        ]);
      }
    } catch (e) {
      console.error("Failed to fetch klines from binance", e);
    }
    // Fallback candles
    const nowMs = Date.now();
    const mockCandles = [];
    let price = 50000;
    for (let i = 0; i < 200; i++) {
      const open = price + (Math.random() - 0.5) * 500;
      const close = open + (Math.random() - 0.5) * 500;
      const high = Math.max(open, close) + Math.random() * 200;
      const low = Math.min(open, close) - Math.random() * 200;
      mockCandles.push([
        nowMs - (200 - i) * 3600000,
        open.toString(),
        high.toString(),
        low.toString(),
        close.toString(),
        "100.0"
      ]);
      price = close;
    }
    return mockCandles;
  }

  return null;
}

async function mockPost(path: string, body: any): Promise<Response> {
  await new Promise(r => setTimeout(r, MOCK_DELAY));

  if (path.includes('/api/auth/login')) {
    let email = 'demo@tradeadge.com';
    if (body instanceof URLSearchParams || typeof body === 'string') {
      const params = new URLSearchParams(body);
      email = params.get('username') || email;
    } else if (body && typeof body === 'object') {
      email = body.email || body.username || email;
    }
    
    localStorage.setItem('mock_logged_in', 'true');
    localStorage.setItem('mock_user_email', email);
    localStorage.setItem('mock_user_name', email.split('@')[0]);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (path.includes('/api/auth/register')) {
    const email = body?.email || 'demo@tradeadge.com';
    const name = body?.displayName || email.split('@')[0];
    localStorage.setItem('mock_logged_in', 'true');
    localStorage.setItem('mock_user_email', email);
    localStorage.setItem('mock_user_name', name);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (path.includes('/api/auth/logout')) {
    localStorage.setItem('mock_logged_in', 'false');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (path.includes('/api/broker/orders') && !path.includes('/cancel')) {
    const orderReq = body;
    const symbolCode = orderReq.symbolCode;
    const side = orderReq.side;
    const orderType = orderReq.orderType;
    const quantity = parseFloat(orderReq.quantity || '0');
    
    const price = await getLivePrice(symbolCode);
    const leverage = 100;
    const contractSize = getContractSize(symbolCode);
    const cost = (quantity * contractSize * price) / leverage;
    
    const overview = getStorage('mock_overview', defaultOverview);
    const balance = parseOverviewValue(overview.balance);
    
    if (orderType === 'MARKET') {
      if (balance < cost) {
        return new Response(JSON.stringify({ ok: false, error: 'יתרה לא מספקת' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      
      let newBalance = balance - cost;
      
      overview.balance = newBalance;
      setStorage('mock_overview', overview);
      
      const positions = getStorage<any[]>('mock_positions', []);
      const posIdx = positions.findIndex(p => p.symbolCode === symbolCode);
      
      if (posIdx !== -1) {
        const p = positions[posIdx];
        const currentQty = parseFloat(p.quantity);
        let updatedQty = currentQty;
        if (side === 'BUY') {
          updatedQty += quantity;
        } else {
          updatedQty -= quantity;
        }
        
        if (Math.abs(updatedQty) < 0.000001) {
          positions.splice(posIdx, 1);
        } else {
          if ((currentQty > 0 && side === 'BUY') || (currentQty < 0 && side === 'SELL')) {
            const currentVal = currentQty * parseFloat(p.avgPrice);
            const newVal = (side === 'BUY' ? quantity : -quantity) * price;
            p.avgPrice = ((currentVal + newVal) / updatedQty).toFixed(2);
          }
          p.quantity = updatedQty.toString();
        }
      } else {
        positions.push({
          id: Date.now(),
          symbolCode,
          quantity: (side === 'BUY' ? quantity : -quantity).toString(),
          avgPrice: price.toString(),
          unrealizedPnl: '0.00',
          openedAt: new Date().toISOString()
        });
      }
      setStorage('mock_positions', positions);
      
      const history = getStorage<any[]>('mock_history', []);
      const newOrder = {
        id: Date.now(),
        symbolCode,
        side,
        orderType,
        status: 'FILLED',
        quantity: quantity.toString(),
        entryPrice: price.toString(),
        createdAt: new Date().toISOString(),
        filledAt: new Date().toISOString()
      };
      history.unshift(newOrder);
      setStorage('mock_history', history);
      
      const notifications = getStorage<any[]>('mock_notifications', defaultNotifications);
      notifications.unshift({
        id: Date.now(),
        notifType: 'TRADE',
        title: 'notification.tradeOpened.title',
        body: JSON.stringify({ side, qty: quantity.toFixed(4), symbol: symbolCode, price: price.toFixed(5) }),
        readAt: null,
        createdAt: new Date().toISOString()
      });
      setStorage('mock_notifications', notifications);
      
      return new Response(JSON.stringify({
        ok: true,
        orderId: newOrder.id,
        status: 'FILLED',
        fillPrice: price.toString(),
        newBalance: newBalance.toFixed(2)
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      
    } else {
      const limitPriceVal = orderReq.limitPrice ? parseFloat(orderReq.limitPrice.toString()) : 0;
      const stopPriceVal = orderReq.stopPrice ? parseFloat(orderReq.stopPrice.toString()) : 0;
      const reservePrice = limitPriceVal > 0 ? limitPriceVal : (stopPriceVal > 0 ? stopPriceVal : 0);
      if (reservePrice <= 0) {
        return new Response(JSON.stringify({ ok: false, error: 'מחיר יעד נדרש להוראה עתידית' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      
      const reserved = reservePrice * quantity;
      if (balance < reserved) {
        return new Response(JSON.stringify({ ok: false, error: 'יתרה לא מספקת להוראה עתידית' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      overview.balance = balance - reserved;
      setStorage('mock_overview', overview);

      // Classify into STOP or LIMIT dynamically based on relationship with current market price at creation:
      let mappedOrderType = 'LIMIT';
      let mappedLimitPrice = '';
      let mappedStopPrice = '';

      if (side === 'BUY') {
        if (reservePrice > price) {
          mappedOrderType = 'STOP';
          mappedStopPrice = reservePrice.toString();
        } else {
          mappedOrderType = 'LIMIT';
          mappedLimitPrice = reservePrice.toString();
        }
      } else { // SELL
        if (reservePrice < price) {
          mappedOrderType = 'STOP';
          mappedStopPrice = reservePrice.toString();
        } else {
          mappedOrderType = 'LIMIT';
          mappedLimitPrice = reservePrice.toString();
        }
      }

      const pending = getStorage<any[]>('mock_pending', []);
      const newOrder = {
        id: Date.now(),
        symbolCode,
        side,
        orderType: mappedOrderType,
        status: 'NEW',
        quantity: quantity.toString(),
        limitPrice: mappedLimitPrice || undefined,
        stopPrice: mappedStopPrice || undefined,
        createdAt: new Date().toISOString()
      };
      pending.unshift(newOrder);
      setStorage('mock_pending', pending);
      
      return new Response(JSON.stringify({
        ok: true,
        orderId: newOrder.id,
        status: 'NEW',
        newBalance: overview.balance.toFixed(2)
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (path.includes('/close')) {
    const parts = path.split('/');
    const posIdStr = parts[parts.length - 2];
    const posId = parseInt(posIdStr);

    const positions = getStorage<any[]>('mock_positions', []);
    const posIdx = positions.findIndex(p => p.id === posId);
    if (posIdx !== -1) {
      const pos = positions[posIdx];
      positions.splice(posIdx, 1);
      setStorage('mock_positions', positions);

      const qty = Math.abs(parseFloat(pos.quantity));
      const avgPrice = parseFloat(pos.avgPrice);
      const livePrice = await getLivePrice(pos.symbolCode);
      const leverage = 100;
      const contractSize = getContractSize(pos.symbolCode);
      const pnl = pos.side === 'SHORT' ? (avgPrice - livePrice) * qty * contractSize : (livePrice - avgPrice) * qty * contractSize;
      const marginReturned = (qty * contractSize * avgPrice) / leverage;

      const overview = getStorage('mock_overview', defaultOverview);
      const balance = parseOverviewValue(overview.balance);
      overview.balance = balance + marginReturned + pnl;
      setStorage('mock_overview', overview);

      const history = getStorage<any[]>('mock_history', []);
      history.unshift({
        id: Date.now(),
        symbolCode: pos.symbolCode,
        side: pos.side === 'SHORT' ? 'BUY' : 'SELL',
        orderType: 'MARKET',
        status: 'FILLED',
        quantity: Math.abs(qty).toString(),
        entryPrice: livePrice.toString(),
        realizedPnl: pnl.toFixed(2),
        createdAt: new Date().toISOString(),
        filledAt: new Date().toISOString()
      });
      setStorage('mock_history', history);

      const notifications = getStorage<any[]>('mock_notifications', defaultNotifications);
      notifications.unshift({
        id: Date.now(),
        notifType: 'TRADE',
        title: 'notification.tradeClosed.title',
        body: JSON.stringify({ side: pos.side === 'SHORT' ? 'SELL' : 'BUY', qty: Math.abs(qty).toFixed(4), symbol: pos.symbolCode, price: livePrice.toFixed(5), pnl: pnl.toFixed(2) }),
        readAt: null,
        createdAt: new Date().toISOString()
      });
      setStorage('mock_notifications', notifications);

      return new Response(JSON.stringify({ ok: true, closePnl: pnl.toFixed(2) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, error: 'פוזיציה לא נמצאה' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (path.includes('/cancel')) {
    const parts = path.split('/');
    const orderIdStr = parts[parts.length - 2];
    const orderId = parseInt(orderIdStr);
    
    const pending = getStorage<any[]>('mock_pending', []);
    const orderIdx = pending.findIndex(o => o.id === orderId);
    if (orderIdx !== -1) {
      const order = pending[orderIdx];
      pending.splice(orderIdx, 1);
      setStorage('mock_pending', pending);
      
      // Refund reserved funds!
      const limitVal = order.limitPrice ? parseFloat(order.limitPrice) : 0;
      const stopVal = order.stopPrice ? parseFloat(order.stopPrice) : 0;
      const reservePrice = limitVal > 0 ? limitVal : (stopVal > 0 ? stopVal : 0);
      const qty = parseFloat(order.quantity);
      const reserved = reservePrice * qty;

      const overview = getStorage('mock_overview', defaultOverview);
      overview.balance = parseOverviewValue(overview.balance) + reserved;
      setStorage('mock_overview', overview);

      const history = getStorage<any[]>('mock_history', []);
      order.status = 'CANCELLED';
      history.unshift(order);
      setStorage('mock_history', history);
      
      return new Response(JSON.stringify({ ok: true, newBalance: overview.balance.toFixed(2) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, error: 'הוראה לא נמצאה' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (path.includes('/api/broker/preferences')) {
    const current = getStorage('mock_preferences', defaultPreferences);
    const updated = { ...current, ...body };
    setStorage('mock_preferences', updated);
    return new Response(JSON.stringify(updated), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (path.includes('/api/broker/transactions')) {
    const txReq = body;
    const amount = parseFloat(txReq.amount || '0');
    const txType = txReq.txType || 'DEPOSIT';
    const method = txReq.method || 'MOCK';
    
    const overview = getStorage('mock_overview', defaultOverview);
    const balance = parseOverviewValue(overview.balance);
    
    if (txType === 'WITHDRAW' && balance < amount) {
      return new Response(JSON.stringify({ ok: false, error: 'יתרה לא מספקת' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    const newBalance = txType === 'DEPOSIT' ? (balance + amount) : (balance - amount);
    overview.balance = newBalance;
    setStorage('mock_overview', overview);
    
    const transactions = getStorage<any[]>('mock_transactions', []);
    const newTx = {
      id: Date.now(),
      txType,
      amount: amount.toString(),
      method,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      note: txReq.note || `Mock transaction ${txType.toLowerCase()}`
    };
    transactions.unshift(newTx);
    setStorage('mock_transactions', transactions);
    
    return new Response(JSON.stringify({ ok: true, newBalance: newBalance.toFixed(2) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  return fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', ...xsrf },
  });
}
