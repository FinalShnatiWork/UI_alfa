const API = 'http://localhost:8080/api';
let allHistory = [];

function fmt(num, d = 2) {
  if (num == null) return '—';
  return parseFloat(num).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadHistory() {
  const token = localStorage.getItem('authToken');
  const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  try {
    const res = await fetch(API + '/broker/history', { credentials: 'include', headers });
    if (!res.ok) throw new Error('status ' + res.status);
    allHistory = await res.json();
    renderHistory(allHistory);
  } catch (e) {
    document.getElementById('loadingMsg').textContent = 'Could not load history. Backend may be offline.';
    console.error(e);
  }
}

function renderHistory(trades) {
  const loading = document.getElementById('loadingMsg');
  const empty = document.getElementById('emptyMsg');
  const table = document.getElementById('historyTable');
  const tbody = document.getElementById('historyData');

  loading.style.display = 'none';

  // Stats
  document.getElementById('statTotal').textContent = trades.length;
  let totalVol = 0, buyCount = 0, sellCount = 0;
  trades.forEach(t => {
    totalVol += parseFloat(t.quantity || 0);
    if ((t.side || '').toUpperCase() === 'BUY') buyCount++;
    else sellCount++;
  });
  document.getElementById('statVolume').textContent = fmt(totalVol, 4);
  document.getElementById('statBuy').textContent = buyCount;
  document.getElementById('statSell').textContent = sellCount;

  if (trades.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  table.style.display = 'table';

  tbody.innerHTML = trades.map(t => {
    const side = (t.side || '').toUpperCase();
    const badgeCls = side === 'BUY' ? 'badge-success' : 'badge-danger';
    const tag = t.clientTag === 'CLOSE_POSITION' ? '<span class="badge" style="background:var(--purple); font-size:0.7rem; margin-left: 5px;">CLOSE</span>' : '';
    return `<tr>
      <td class="text-sm dir-ltr">#${t.id}</td>
      <td>${fmtDate(t.createdAt)}</td>
      <td>${fmtDate(t.filledAt)}</td>
      <td class="font-bold">${t.symbolCode}</td>
      <td><span class="badge ${badgeCls}">${side}</span>${tag}</td>
      <td>${fmt(t.quantity, 4)}</td>
      <td>${t.fillPrice != null ? fmt(t.fillPrice, 4) : '—'}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${t.orderType || 'MARKET'}</td>
    </tr>`;
  }).join('');
}

function applyFilters() {
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const symbol = document.getElementById('filterSymbol').value.trim().toUpperCase();

  let filtered = [...allHistory];
  if (from) filtered = filtered.filter(t => t.filledAt && new Date(t.filledAt) >= new Date(from));
  if (to) filtered = filtered.filter(t => t.filledAt && new Date(t.filledAt) <= new Date(to + 'T23:59:59'));
  if (symbol) filtered = filtered.filter(t => t.symbolCode && t.symbolCode.toUpperCase().includes(symbol));
  renderHistory(filtered);
}

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();

  document.getElementById('filterBtn').addEventListener('click', applyFilters);
  document.getElementById('clearFilterBtn').addEventListener('click', () => {
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    document.getElementById('filterSymbol').value = '';
    renderHistory(allHistory);
  });
});
