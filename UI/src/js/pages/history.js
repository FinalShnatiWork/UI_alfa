import { applyI18n, t } from '../lib/i18n.js';
import { apiGet } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const totalTradesEl = document.getElementById('historyTotalTrades');
  const netPlEl = document.getElementById('historyNetPl');
  const winRateEl = document.getElementById('historyWinRate');
  const totalVolEl = document.getElementById('historyTotalVol');
  const tbody = document.getElementById('historyRows');

  const fmtMoney = (n, currency = 'USD') => {
    const v = Number(n ?? 0);
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  };

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  async function load() {
    try {
      const overview = await apiGet('/api/broker/overview');
      const cur = overview.currency || 'USD';
      const orders = await apiGet('/api/broker/orders');
      const list = Array.isArray(orders) ? orders : [];
      const closed = list.filter((o) => String(o.status || '').toUpperCase() === 'FILLED');

      if (totalTradesEl) totalTradesEl.textContent = String(closed.length);
      if (totalVolEl) {
        const vol = closed.reduce((s, o) => s + Number(o.quantity ?? 0), 0);
        totalVolEl.textContent = vol.toFixed(2);
      }

      // P/L in demo: not computed from fills yet, so show 0 and avoid misleading values.
      if (netPlEl) netPlEl.textContent = `+${fmtMoney(0, cur)}`;
      if (winRateEl) winRateEl.textContent = '0.0%';

      if (tbody) {
        tbody.replaceChildren();
        if (!closed.length) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td colspan="9" class="text-muted text-sm">${t('alerts.comingSoon')}</td>`;
          tbody.appendChild(tr);
          return;
        }
        for (const o of closed.slice(0, 50)) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="text-sm dir-ltr">#${escapeHtml(o.id ?? '')}</td>
            <td>${fmtTime(o.createdAt)}</td>
            <td>${fmtTime(o.filledAt)}</td>
            <td class="font-bold">${escapeHtml(o.symbolCode ?? '')}</td>
            <td><span class="badge ${String(o.side).toUpperCase() === 'BUY' ? 'badge-success' : 'badge-danger'}">${escapeHtml(String(o.side ?? '—'))}</span></td>
            <td>${Number(o.quantity ?? 0).toFixed(2)}</td>
            <td>${o.limitPrice ?? o.stopPrice ?? '—'}</td>
            <td>${o.limitPrice ?? '—'}</td>
            <td class="text-muted font-bold">—</td>
          `;
          tbody.appendChild(tr);
        }
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('401')) {
        showToast(t('alerts.authNeedLogin'), { variant: 'warning' });
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 800);
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  load();
});
