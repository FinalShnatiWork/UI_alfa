import { applyI18n, t } from '../lib/i18n.js';
import { showToast } from '../lib/toast.js';
import { showConfirmModal } from '../lib/confirmModal.js';
import { apiGet, apiPostJson } from '../lib/api.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const tbody = document.getElementById('positionsData');

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function fmtPrice(n) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return '—';
    if (v > 1000) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  function fmtQty(n) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 });
  }

  async function fetchCurrentPrice(symbolCode) {
    try {
      const data = await apiGet(`/api/market/price/${encodeURIComponent(symbolCode)}`);
      return data?.price != null ? Number(data.price) : null;
    } catch {
      return null;
    }
  }

  async function loadPositions() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-sm" style="text-align:center; padding: 2rem;">Loading positions...</td></tr>`;
    try {
      const rows = await apiGet('/api/broker/positions');
      const list = Array.isArray(rows) ? rows : [];
      tbody.innerHTML = '';

      const activePositions = list.filter(p => Number(p.quantity ?? 0) !== 0);

      if (!activePositions.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-sm" style="text-align:center; padding:2rem;">No open positions yet. Go to Trading to place an order!</td></tr>`;
        return;
      }

      for (const p of activePositions) {
        const symbol = p.symbolCode ?? '';
        const avgPrice = Number(p.avgPrice ?? 0);
        const qty = Number(p.quantity ?? 0);

        // Fetch live price for each position
        const currentPrice = await fetchCurrentPrice(symbol);

        let pnlHtml = '<span class="text-muted">—</span>';
        let currentPriceHtml = '<span class="text-muted">—</span>';

        if (currentPrice != null) {
          const cpStr = fmtPrice(currentPrice);
          const pnl = (currentPrice - avgPrice) * qty;
          const pnlClass = pnl >= 0 ? 'text-success' : 'text-danger';
          const pnlSign = pnl >= 0 ? '+' : '';
          currentPriceHtml = `<span class="font-bold ${pnl >= 0 ? 'text-success' : 'text-danger'}">${cpStr}</span>`;
          pnlHtml = `<span class="${pnlClass} font-bold">${pnlSign}$${fmtPrice(Math.abs(pnl))}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong class="font-bold">${escapeHtml(symbol)}</strong></td>
          <td class="center"><span class="badge badge-success">BUY</span></td>
          <td class="num">${fmtQty(qty)}</td>
          <td class="num">${fmtPrice(avgPrice)}</td>
          <td class="num">${currentPriceHtml}</td>
          <td>${pnlHtml}</td>
          <td class="center"><button type="button" class="btn btn-danger close-position"
              data-symbol="${escapeAttr(symbol)}"
              data-qty="${escapeAttr(String(qty))}"
              style="padding: 6px 12px; font-size: 0.8rem;">${t('common.close')}</button></td>
        `;
        tbody.appendChild(tr);
      }

      wireCloseButtons();
    } catch (err) {
      console.error('Positions load error:', err);
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-sm" style="text-align:center; padding:2rem;">
        ${t('alerts.authNeedLogin')}
      </td></tr>`;
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    }
  }

  function wireCloseButtons() {
    document.querySelectorAll('.close-position').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const symbol = e.currentTarget.getAttribute('data-symbol') || '';
        const qty = parseFloat(e.currentTarget.getAttribute('data-qty') || '0');
        const ok = await showConfirmModal({
          message: t('confirm.closePosition', { symbol }),
          confirmLabel: t('common.confirm'),
          cancelLabel: t('common.cancel'),
        });
        if (!ok) return;
        try {
          const res = await apiPostJson('/api/broker/orders', {
            side: 'SELL',
            symbolCode: symbol,
            quantity: qty,
            orderType: 'MARKET',
          });
          const data = await res.json();
          if (data.ok) {
            showToast(t('alerts.closeOk', { symbol }) + ` @ ${data.fillPrice}`, { variant: 'success', duration: 3000 });
            await loadPositions();
          } else {
            showToast(`Error: ${data.error}`, { variant: 'error' });
          }
        } catch {
          showToast('Failed to close position', { variant: 'error' });
        }
      });
    });
  }

  // Initial load + auto-refresh every 5 seconds
  loadPositions();
  setInterval(loadPositions, 5000);

  const filterBtns = document.querySelectorAll('.card.flex-between button');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      filterBtns.forEach((b) => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline-dark');
      });
      target.classList.remove('btn-outline-dark');
      target.classList.add('btn-primary');
    });
  });
});
