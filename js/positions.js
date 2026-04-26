const API = 'http://localhost:8080/api';

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.borderColor = type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--border-light)';
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => { toast.style.display = 'none'; }, 300); }, 3500);
}

function fmt(num, decimals = 2) {
  if (num == null || num === '') return '—';
  return parseFloat(num).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pnlHtml(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '<span>—</span>';
  const cls = n >= 0 ? 'text-success' : 'text-danger';
  const sign = n >= 0 ? '+' : '';
  return `<span class="${cls} font-bold">${sign}$${fmt(Math.abs(n))}</span>`;
}

let allPositions = [];
let pendingCloseId = null;

async function loadPositions() {
  const token = localStorage.getItem('authToken');
  const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  try {
    const res = await fetch(API + '/broker/positions', { credentials: 'include', headers });
    if (!res.ok) throw new Error('status ' + res.status);
    allPositions = await res.json();
    renderPositions(allPositions);
    updateSummary(allPositions);
    document.getElementById('lastRefresh').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('loadingMsg').textContent = 'Could not load positions. Backend may be offline.';
  }
}

function updateSummary(positions) {
  document.getElementById('posCount').textContent = positions.length;
  let totalPnl = 0;
  positions.forEach(p => { totalPnl += parseFloat(p.unrealizedPnl || 0); });
  const pnlEl = document.getElementById('totalUnrealizedPnl');
  pnlEl.innerHTML = pnlHtml(totalPnl);
}

function renderPositions(positions) {
  const loading = document.getElementById('loadingMsg');
  const empty = document.getElementById('emptyMsg');
  const table = document.getElementById('positionsTable');
  const tbody = document.getElementById('positionsData');

  loading.style.display = 'none';
  if (positions.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  tbody.innerHTML = positions.map(p => {
    const side = parseFloat(p.quantity) >= 0 ? 'BUY' : 'SELL';
    const badgeCls = side === 'BUY' ? 'badge-success' : 'badge-danger';
    const currentPriceDisplay = p.currentPrice != null ? fmt(p.currentPrice, 4) : '<span style="color:var(--text-muted)">—</span>';
    return `<tr>
      <td><strong class="font-bold">${p.symbolCode}</strong></td>
      <td>${fmt(Math.abs(p.quantity), 4)}</td>
      <td>${p.avgPrice != null ? fmt(p.avgPrice, 4) : '—'}</td>
      <td>${currentPriceDisplay}</td>
      <td>${pnlHtml(p.unrealizedPnl)}</td>
      <td>${pnlHtml(p.realizedPnl)}</td>
      <td>
        <button class="btn btn-danger close-pos-btn" data-id="${p.id}" data-symbol="${p.symbolCode}" 
          style="padding: 5px 12px; font-size: 0.8rem;">
          ✕ Close
        </button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.close-pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingCloseId = btn.dataset.id;
      document.getElementById('modalText').textContent =
        `Close position for ${btn.dataset.symbol}? This will execute at the current market price.`;
      document.getElementById('closeModal').style.display = 'flex';
    });
  });
}

async function closePosition(posId) {
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetch(API + '/broker/positions/' + posId + '/close', {
      method: 'POST', credentials: 'include', headers
    });
    const data = await res.json();
    if (data.ok) {
      const pnl = parseFloat(data.closePnl || 0);
      const sign = pnl >= 0 ? '+' : '';
      showToast(`Position closed! PnL: ${sign}$${fmt(Math.abs(pnl))}`, pnl >= 0 ? 'success' : 'error');
      await loadPositions();
    } else {
      showToast('Error: ' + (data.error || 'unknown'), 'error');
    }
  } catch (e) {
    showToast('Connection error. Try again.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPositions();

  // Auto-refresh every 15 seconds
  setInterval(loadPositions, 15000);

  document.getElementById('refreshBtn').addEventListener('click', loadPositions);

  document.getElementById('searchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = allPositions.filter(p => p.symbolCode.toLowerCase().includes(q));
    renderPositions(filtered);
  });

  document.getElementById('confirmClose').addEventListener('click', async () => {
    document.getElementById('closeModal').style.display = 'none';
    if (pendingCloseId) {
      await closePosition(pendingCloseId);
      pendingCloseId = null;
    }
  });

  document.getElementById('cancelClose').addEventListener('click', () => {
    document.getElementById('closeModal').style.display = 'none';
    pendingCloseId = null;
  });

  // MT5 Status
  fetch(API + '/admin/mt5/status', { credentials: 'include' })
    .then(r => r.json())
    .then(d => {
      const el = document.getElementById('mt5Status');
      if (d && d.connected) {
        el.innerHTML = '<span class="text-success">● Connected</span>';
      } else {
        el.innerHTML = '<span class="text-danger">● Disconnected</span>';
      }
    })
    .catch(() => {
      document.getElementById('mt5Status').innerHTML = '<span class="text-muted">● Unknown</span>';
    });
});
