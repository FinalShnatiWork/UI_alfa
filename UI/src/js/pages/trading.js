import { applyI18n, t } from '../lib/i18n.js';
import { apiGet, apiPostJson } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? '');
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? '');
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 });
}

function errorToI18nKey(code) {
  return (
    {
      insufficient_funds: 'trading.errInsufficientFunds',
      insufficient_position: 'trading.errInsufficientPosition',
      price_unavailable: 'trading.errPriceUnavailable',
      symbol_disabled: 'trading.errSymbolDisabled',
      unauthorized: 'alerts.authNeedLogin',
      banned: 'alerts.authBanned',
    }[code] ?? null
  );
}

async function loadSymbolsIntoSelect(assetSelect) {
  const raw = await apiGet('/api/broker/symbols');
  const list = Array.isArray(raw) ? raw : [];

  // Group by kind for optgroups
  const groups = new Map();
  for (const s of list) {
    const kind = String(s.kind || 'OTHER').toUpperCase();
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(s);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }

  const kindLabel = (k) =>
    k === 'FX' ? t('trading.optForex') : k === 'CRYPTO' ? t('trading.optCrypto') : k === 'STOCK' ? 'Stocks' : k;

  assetSelect.innerHTML = '';
  for (const [kind, arr] of groups.entries()) {
    const og = document.createElement('optgroup');
    og.label = kindLabel(kind);
    for (const s of arr) {
      const opt = document.createElement('option');
      opt.value = String(s.code || '');
      opt.textContent = String(s.code || '');
      og.appendChild(opt);
    }
    assetSelect.appendChild(og);
  }
}

async function refreshPortfolio(symbolCode) {
  const balEl = document.getElementById('tradingBalance');
  const qtyEl = document.getElementById('tradingPositionQty');
  const avgEl = document.getElementById('tradingPositionAvg');

  try {
    const ov = await apiGet('/api/broker/overview');
    if (balEl) balEl.textContent = fmtMoney(ov?.balance);
  } catch {
    if (balEl) balEl.textContent = '—';
  }

  try {
    const pos = await apiGet('/api/broker/positions');
    const list = Array.isArray(pos) ? pos : [];
    const p = list.find((x) => String(x?.symbolCode || '').toUpperCase() === String(symbolCode || '').toUpperCase());
    if (!p) {
      if (qtyEl) qtyEl.textContent = '0';
      if (avgEl) avgEl.textContent = '—';
      return;
    }
    if (qtyEl) qtyEl.textContent = fmtQty(p.quantity);
    if (avgEl) avgEl.textContent = p.avgPrice != null ? fmtMoney(p.avgPrice) : '—';
  } catch {
    if (qtyEl) qtyEl.textContent = '—';
    if (avgEl) avgEl.textContent = '—';
  }
}

let lastPrice = null;
let priceRefreshInterval = null;

async function fetchLivePrice(symbolCode) {
  const priceEl = document.getElementById('livePriceValue');
  const changeEl = document.getElementById('livePriceChange');
  if (!priceEl || !symbolCode) return;
  try {
    const data = await apiGet(`/api/market/price/${encodeURIComponent(symbolCode)}`);
    const price = Number(data?.price);
    if (!Number.isFinite(price)) return;

    if (lastPrice != null && lastPrice !== price) {
      const diff = price - lastPrice;
      const pct = (diff / lastPrice) * 100;
      const sign = diff >= 0 ? '+' : '';
      if (changeEl) {
        changeEl.textContent = `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(3)}%)`;
        changeEl.style.color = diff >= 0 ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)';
      }
      priceEl.style.color = diff >= 0 ? '#34d399' : '#f87171';
    } else {
      priceEl.style.color = '#60a5fa';
    }

    priceEl.textContent = price > 100
      ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });

    lastPrice = price;
  } catch {
    if (priceEl) priceEl.textContent = '—';
  }
}

function startPricePolling(symbolCode) {
  if (priceRefreshInterval) clearInterval(priceRefreshInterval);
  lastPrice = null;
  fetchLivePrice(symbolCode);
  priceRefreshInterval = setInterval(() => fetchLivePrice(symbolCode), 3000);
}

async function placeMarketOrder(side, symbolCode, quantity) {
  const res = await apiPostJson('/api/broker/orders', { side, symbolCode, quantity });
  if (res.ok) return await res.json();
  let err = null;
  try {
    err = await res.json();
  } catch {
    /* ignore */
  }
  const code = err?.error || 'unknown';
  const key = errorToI18nKey(code);
  if (key) {
    throw Object.assign(new Error(code), { code, i18nKey: key });
  }
  throw Object.assign(new Error(code), { code });
}

function getSelectedOrderType(orderTypeBtns) {
  const active = Array.from(orderTypeBtns || []).find((b) => b.classList.contains('btn-primary'));
  const tpe = active?.getAttribute('data-order-type') || 'market';
  return String(tpe).toLowerCase();
}

async function placeOrder({ side, symbolCode, quantity, orderType, entryPrice }) {
  const payload = { side, symbolCode, quantity, orderType: String(orderType || 'MARKET').toUpperCase() };
  if (payload.orderType === 'LIMIT') payload.limitPrice = entryPrice;
  if (payload.orderType === 'STOP') payload.stopPrice = entryPrice;
  const res = await apiPostJson('/api/broker/orders', payload);
  if (res.ok) return await res.json();
  let err = null;
  try {
    err = await res.json();
  } catch {
    /* ignore */
  }
  const code = err?.error || 'unknown';
  const key = errorToI18nKey(code);
  if (key) throw Object.assign(new Error(code), { code, i18nKey: key });
  throw Object.assign(new Error(code), { code });
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const buyBtn = document.getElementById('buyBtn');
  const sellBtn = document.getElementById('sellBtn');
  const volPlus = document.getElementById('volPlus');
  const volMinus = document.getElementById('volMinus');
  const volInput = document.getElementById('vol');
  const assetSelect = document.getElementById('assetSelect');
  const orderTypeBtns = document.querySelectorAll('.order-type-btn');
  const entryPriceGroup = document.getElementById('entryPriceGroup');
  const entryPriceLabel = document.getElementById('entryPriceLabel');
  const entryPriceInput = document.getElementById('entryPriceInput');

  if (assetSelect) {
    loadSymbolsIntoSelect(assetSelect).then(() => {
      startPricePolling(assetSelect.value);
    }).catch(() => {
      showToast(t('alerts.adminLoadFail'), { variant: 'error' });
    });
    assetSelect.addEventListener('change', () => {
      refreshPortfolio(assetSelect.value);
      startPricePolling(assetSelect.value);
    });
  }

  if (orderTypeBtns.length > 0) {
    orderTypeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const clicked = e.currentTarget;
        orderTypeBtns.forEach((b) => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-outline-dark');
        });
        clicked.classList.remove('btn-outline-dark');
        clicked.classList.add('btn-primary');

        const type = clicked.getAttribute('data-order-type');
        if (type === 'market') {
          entryPriceGroup.style.display = 'none';
          if (entryPriceLabel) entryPriceLabel.textContent = t('trading.entryPrice');
        } else if (type === 'limit') {
          entryPriceGroup.style.display = 'block';
          if (entryPriceLabel) entryPriceLabel.textContent = t('trading.limitPrice');
        } else if (type === 'stop') {
          entryPriceGroup.style.display = 'block';
          if (entryPriceLabel) entryPriceLabel.textContent = t('trading.stopPrice');
        }
      });
    });
  }

  if (buyBtn) {
    buyBtn.addEventListener('click', async () => {
      const symbolCode = assetSelect ? String(assetSelect.value || '') : '';
      const quantity = volInput ? Number(volInput.value) : 0;
      const type = getSelectedOrderType(orderTypeBtns);
      const entry = entryPriceInput ? Number(entryPriceInput.value) : NaN;
      if (!symbolCode || !Number.isFinite(quantity) || quantity <= 0) {
        showToast(t('trading.errBadOrder'), { variant: 'warning' });
        return;
      }
      if (type !== 'market' && (!Number.isFinite(entry) || entry <= 0)) {
        showToast(t('trading.errEntryPriceRequired'), { variant: 'warning' });
        return;
      }
      try {
        buyBtn.disabled = true;
        const out = await placeOrder({
          side: 'BUY',
          symbolCode,
          quantity,
          orderType: type === 'market' ? 'MARKET' : type === 'limit' ? 'LIMIT' : 'STOP',
          entryPrice: type === 'market' ? null : entry,
        });
        if (out.status === 'NEW') {
          showToast(t('trading.orderPlaced', { side: 'BUY', symbol: symbolCode }), { variant: 'success', duration: 2400 });
        } else {
          showToast(
            t('trading.orderFilled', {
              side: 'BUY',
              symbol: symbolCode,
              price: escapeHtml(out.fillPrice),
              balance: fmtMoney(out.newBalance),
            }),
            { variant: 'success', duration: 3200 }
          );
        }
        await refreshPortfolio(symbolCode);
      } catch (e) {
        showToast(e?.i18nKey ? t(e.i18nKey) : t('trading.errOrderFailed'), { variant: 'error', duration: 3800 });
      } finally {
        buyBtn.disabled = false;
      }
    });
  }

  if (sellBtn) {
    sellBtn.addEventListener('click', async () => {
      const symbolCode = assetSelect ? String(assetSelect.value || '') : '';
      const quantity = volInput ? Number(volInput.value) : 0;
      const type = getSelectedOrderType(orderTypeBtns);
      const entry = entryPriceInput ? Number(entryPriceInput.value) : NaN;
      if (!symbolCode || !Number.isFinite(quantity) || quantity <= 0) {
        showToast(t('trading.errBadOrder'), { variant: 'warning' });
        return;
      }
      if (type !== 'market' && (!Number.isFinite(entry) || entry <= 0)) {
        showToast(t('trading.errEntryPriceRequired'), { variant: 'warning' });
        return;
      }
      try {
        sellBtn.disabled = true;
        const out = await placeOrder({
          side: 'SELL',
          symbolCode,
          quantity,
          orderType: type === 'market' ? 'MARKET' : type === 'limit' ? 'LIMIT' : 'STOP',
          entryPrice: type === 'market' ? null : entry,
        });
        if (out.status === 'NEW') {
          showToast(t('trading.orderPlaced', { side: 'SELL', symbol: symbolCode }), { variant: 'success', duration: 2400 });
        } else {
          showToast(
            t('trading.orderFilled', {
              side: 'SELL',
              symbol: symbolCode,
              price: escapeHtml(out.fillPrice),
              balance: fmtMoney(out.newBalance),
            }),
            { variant: 'success', duration: 3200 }
          );
        }
        await refreshPortfolio(symbolCode);
      } catch (e) {
        showToast(e?.i18nKey ? t(e.i18nKey) : t('trading.errOrderFailed'), { variant: 'error', duration: 3800 });
      } finally {
        sellBtn.disabled = false;
      }
    });
  }

  if (volPlus && volInput) {
    volPlus.addEventListener('click', () => {
      const current = parseFloat(volInput.value);
      volInput.value = (current + 0.1).toFixed(2);
    });
  }

  if (volMinus && volInput) {
    volMinus.addEventListener('click', () => {
      const current = parseFloat(volInput.value);
      if (current > 0.1) {
        volInput.value = (current - 0.1).toFixed(2);
      }
    });
  }

  // Initial portfolio render
  if (assetSelect) {
    refreshPortfolio(assetSelect.value);
  } else {
    refreshPortfolio('');
  }

  // --- Inline Open Positions Panel ---
  const inlinePosBody = document.getElementById('inlinePosBody');
  const refreshPositionsBtn = document.getElementById('refreshPositionsBtn');

  function fmtP(n) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) > 1000) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  async function loadInlinePositions() {
    if (!inlinePosBody) return;
    try {
      const rows = await apiGet('/api/broker/positions');
      const list = Array.isArray(rows) ? rows : [];
      const active = list.filter(p => Number(p.quantity ?? 0) !== 0);

      if (!active.length) {
        inlinePosBody.innerHTML = `<tr><td colspan="6" style="padding: 1.2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">אין פוזיציות פתוחות. לחץ BUY כדי לפתוח!</td></tr>`;
        return;
      }

      const rows2 = await Promise.all(active.map(async (p) => {
        const sym = p.symbolCode ?? '';
        const avg = Number(p.avgPrice ?? 0);
        const qty = Number(p.quantity ?? 0);
        let curPrice = null;
        try {
          const pd = await apiGet(`/api/market/price/${encodeURIComponent(sym)}`);
          curPrice = pd?.price != null ? Number(pd.price) : null;
        } catch { /* ignore */ }

        const curHtml = curPrice != null ? fmtP(curPrice) : '—';
        let pnlHtml = '—';
        if (curPrice != null) {
          const pnl = (curPrice - avg) * qty;
          const cls = pnl >= 0 ? 'color:#10b981' : 'color:#ef4444';
          const sign = pnl >= 0 ? '+' : '';
          pnlHtml = `<span style="font-weight:600;${cls}">${sign}$${fmtP(Math.abs(pnl))}</span>`;
        }

        return `<tr style="border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));">
          <td style="padding: 10px 12px; font-weight: 600;">${sym}</td>
          <td style="padding: 10px 12px; text-align: right;">${fmtP(qty)}</td>
          <td style="padding: 10px 12px; text-align: right; color: var(--text-secondary);">${fmtP(avg)}</td>
          <td style="padding: 10px 12px; text-align: right;">${curHtml}</td>
          <td style="padding: 10px 12px; text-align: right;">${pnlHtml}</td>
          <td style="padding: 10px 12px; text-align: center;">
            <button class="btn btn-danger inline-close-pos"
              data-symbol="${sym}" data-qty="${qty}"
              style="padding: 5px 10px; font-size: 0.78rem;">✕ סגור</button>
          </td>
        </tr>`;
      }));

      inlinePosBody.innerHTML = rows2.join('');

      // Wire close buttons
      inlinePosBody.querySelectorAll('.inline-close-pos').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const sym = e.currentTarget.getAttribute('data-symbol');
          const qty = parseFloat(e.currentTarget.getAttribute('data-qty'));
          if (!confirm(`סגור פוזיציה על ${sym} (${fmtP(qty)} יחידות)?`)) return;

          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'סוגר...';
          try {
            const res = await apiPostJson('/api/broker/orders', {
              side: 'SELL',
              symbolCode: sym,
              quantity: qty,
              orderType: 'MARKET',
            });
            const data = await res.json();
            if (data.ok) {
              showToast(`✅ פוזיציה על ${sym} נסגרה @ ${data.fillPrice}`, { variant: 'success', duration: 3000 });
              setTimeout(() => { loadInlinePositions(); refreshPortfolio(assetSelect?.value ?? ''); }, 500);
            } else {
              showToast(`❌ שגיאה: ${data.error}`, { variant: 'error' });
              e.currentTarget.disabled = false;
              e.currentTarget.textContent = '✕ סגור';
            }
          } catch {
            showToast('שגיאה בסגירת הפוזיציה', { variant: 'error' });
            e.currentTarget.disabled = false;
            e.currentTarget.textContent = '✕ סגור';
          }
        });
      });

    } catch {
      if (inlinePosBody) inlinePosBody.innerHTML = `<tr><td colspan="6" style="padding:1rem; text-align:center; color:var(--text-secondary);">לא ניתן לטעון פוזיציות</td></tr>`;
    }
  }

  if (refreshPositionsBtn) refreshPositionsBtn.addEventListener('click', loadInlinePositions);
  loadInlinePositions();
  setInterval(loadInlinePositions, 8000);
});
