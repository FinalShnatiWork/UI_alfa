import { applyI18n, t } from '../lib/i18n.js';
import { apiGet } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const totalTradesEl = document.getElementById('historyTotalTrades');
  const netPlEl       = document.getElementById('historyNetPl');
  const winRateEl     = document.getElementById('historyWinRate');
  const totalVolEl    = document.getElementById('historyTotalVol');
  const tbody         = document.getElementById('historyRows');

  // Filter controls
  const filterBtn     = document.querySelector('button[data-i18n="common.filter"]');
  const exportBtn     = document.querySelector('button[data-i18n="history.export"]');
  const dateFromInput = document.querySelector('input[type="date"]:first-of-type');
  const dateToInput   = document.querySelector('input[type="date"]:last-of-type');
  const symbolInput   = document.querySelector('input[data-i18n-placeholder="history.placeholderSymbol"]');

  let allTrades = [];
  let currency  = 'USD';

  // ── Formatters ─────────────────────────────────────────────────────────────
  const fmtMoney = (n, cur = 'USD') =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n ?? 0));

  const fmtPrice = (n) =>
    n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 8, minimumFractionDigits: 2 });

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Statistics ─────────────────────────────────────────────────────────────
  function updateStats(trades) {
    if (totalTradesEl) totalTradesEl.textContent = String(trades.length);

    const totalVol = trades.reduce((s, o) => s + Number(o.quantity ?? 0), 0);
    if (totalVolEl) totalVolEl.textContent = totalVol.toFixed(2);

    // P/L: only SELL orders have realizedPnl; BUY orders are opening trades
    const sellTrades = trades.filter((o) => String(o.side).toUpperCase() === 'SELL' && o.realizedPnl != null);
    const netPl      = sellTrades.reduce((s, o) => s + Number(o.realizedPnl ?? 0), 0);

    if (netPlEl) {
      netPlEl.textContent = (netPl >= 0 ? '+' : '') + fmtMoney(netPl, currency);
      netPlEl.className   = `value font-bold text-xl ${netPl >= 0 ? 'text-success' : 'text-danger'}`;
    }

    const wins    = sellTrades.filter((o) => Number(o.realizedPnl ?? 0) > 0).length;
    const winRate = sellTrades.length > 0 ? (wins / sellTrades.length) * 100 : 0;
    if (winRateEl) winRateEl.textContent = winRate.toFixed(1) + '%';
  }

  // ── Render table ───────────────────────────────────────────────────────────
  function renderTable(trades) {
    if (!tbody) return;
    tbody.replaceChildren();

    if (!trades.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="9" class="text-muted text-sm" style="padding:24px;text-align:center;">${t('alerts.comingSoon')}</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const o of trades.slice(0, 200)) {
      const side = String(o.side ?? '').toUpperCase();
      const hasPl = o.realizedPnl != null;
      const pl = Number(o.realizedPnl ?? 0);
      const plText = hasPl ? (pl >= 0 ? '+' : '') + fmtMoney(pl, currency) : '—';
      const plClass = hasPl ? (pl >= 0 ? 'text-success' : 'text-danger') : 'text-muted';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-sm dir-ltr">#${escapeHtml(String(o.id ?? ''))}</td>
        <td class="text-sm">${fmtTime(o.openedAt)}</td>
        <td class="text-sm">${fmtTime(o.closedAt)}</td>
        <td class="font-bold">${escapeHtml(o.symbolCode ?? '')}</td>
        <td><span class="badge ${side === 'BUY' ? 'badge-success' : 'badge-danger'}">${escapeHtml(side)}</span></td>
        <td>${Number(o.quantity ?? 0).toFixed(4)}</td>
        <td class="dir-ltr">${fmtPrice(o.entryPrice)}</td>
        <td class="dir-ltr text-muted">—</td>
        <td class="dir-ltr font-bold ${plClass}">${escapeHtml(plText)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function applyFilters() {
    let result = [...allTrades];

    const from = dateFromInput?.value;
    const to   = dateToInput?.value;
    const sym  = symbolInput?.value.trim().toUpperCase();

    if (from) {
      const fromMs = new Date(from).getTime();
      result = result.filter((o) => o.closedAt && new Date(o.closedAt).getTime() >= fromMs);
    }
    if (to) {
      const toMs = new Date(to + 'T23:59:59').getTime();
      result = result.filter((o) => o.closedAt && new Date(o.closedAt).getTime() <= toMs);
    }
    if (sym) {
      result = result.filter((o) => String(o.symbolCode ?? '').toUpperCase().includes(sym));
    }

    updateStats(result);
    renderTable(result);
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportCsv(trades) {
    const headers = ['ID', 'Open Time', 'Close Time', 'Symbol', 'Side', 'Quantity', 'Entry Price', 'P/L'];
    const rows = trades.map((o) => [
      o.id,
      o.openedAt ? new Date(o.openedAt).toISOString() : '',
      o.closedAt ? new Date(o.closedAt).toISOString() : '',
      o.symbolCode,
      o.side,
      o.quantity,
      o.entryPrice ?? '',
      o.realizedPnl ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Load data ──────────────────────────────────────────────────────────────
  async function load() {
    try {
      const [overview, history] = await Promise.all([
        apiGet('/api/broker/overview'),
        apiGet('/api/broker/history'),
      ]);
      currency  = overview?.currency || 'USD';
      allTrades = Array.isArray(history) ? history : [];

      applyFilters();
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('401')) {
        showToast(t('alerts.authNeedLogin'), { variant: 'warning' });
        setTimeout(() => { window.location.href = 'login.html'; }, 800);
      }
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  if (filterBtn) filterBtn.addEventListener('click', applyFilters);
  if (exportBtn) exportBtn.addEventListener('click', () => {
    let result = [...allTrades];
    const from = dateFromInput?.value;
    const to   = dateToInput?.value;
    const sym  = symbolInput?.value.trim().toUpperCase();
    if (from) result = result.filter((o) => o.closedAt && new Date(o.closedAt).getTime() >= new Date(from).getTime());
    if (to)   result = result.filter((o) => o.closedAt && new Date(o.closedAt).getTime() <= new Date(to + 'T23:59:59').getTime());
    if (sym)  result = result.filter((o) => String(o.symbolCode ?? '').toUpperCase().includes(sym));
    if (!result.length) { showToast(t('alerts.comingSoon'), { variant: 'info' }); return; }
    exportCsv(result);
  });

  load();
});
