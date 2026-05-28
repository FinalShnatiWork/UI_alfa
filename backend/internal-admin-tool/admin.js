import { applyI18n, t } from '../lib/i18n.js';
import { apiGet, apiPostJson, apiPostLogout } from '../lib/api.js';
import { showToast } from '../lib/toast.js';
import { showReasonModal } from '../lib/reasonModal.js';

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
function escapeHtml(s) {
  if (s == null) return '–';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(v) {
  if (!v) return '–';
  return String(v).replace('T', ' ').replace(/\.\d+Z?$/, '');
}

function fmtNum(v) {
  if (v == null) return '–';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function badge(text, cls) {
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

function emptyRow(cols, msg = 'No data') {
  return `<tr class="empty-row"><td colspan="${cols}">${msg}</td></tr>`;
}

/* ──────────────────────────────────────────────
   Server health check
────────────────────────────────────────────── */
async function checkServerHealth() {
  const badge$ = document.getElementById('serverStatusBadge');
  const text$  = document.getElementById('serverStatusText');
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok) {
      badge$.className = 'server-status online';
      text$.textContent = 'Online';
    } else {
      throw new Error('non-ok');
    }
  } catch {
    badge$.className = 'server-status offline';
    text$.textContent = 'Offline';
  }
}

/* ──────────────────────────────────────────────
   Restart server
────────────────────────────────────────────── */
async function restartServer() {
  const btn = document.getElementById('restartServerBtn');
  btn.disabled = true;
  btn.textContent = '↻ Restarting…';
  try {
    // Signal backend to restart (graceful shutdown, process manager restarts it)
    const r = await fetch('/api/admin/server/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (r.ok || r.status === 503) {
      showToast('Server restart initiated. Reconnecting in 20 seconds…', { variant: 'warning' });
      // Poll until backend is back
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const p = await fetch('/api/health', { cache: 'no-store' });
          if (p.ok) {
            clearInterval(poll);
            showToast('✅ Server is back online!', { variant: 'success' });
            await checkServerHealth();
            await loadAllData();
            btn.disabled = false;
            btn.textContent = '↻ Restart Server';
          }
        } catch { /* still down */ }
        if (attempts > 30) {
          clearInterval(poll);
          showToast('⚠️ Server did not come back after 60 s. Check logs.', { variant: 'error' });
          btn.disabled = false;
          btn.textContent = '↻ Restart Server';
        }
      }, 2000);
    } else {
      throw new Error(`HTTP ${r.status}`);
    }
  } catch (e) {
    // If fetch itself fails, the server may already have started shutting down
    showToast('Restart signal sent (or backend already down). Waiting for it to come back…', { variant: 'warning' });
    btn.textContent = '↻ Waiting…';
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const p = await fetch('/api/health', { cache: 'no-store' });
        if (p.ok) {
          clearInterval(poll);
          showToast('✅ Server is back online!', { variant: 'success' });
          await checkServerHealth();
          await loadAllData();
          btn.disabled = false;
          btn.textContent = '↻ Restart Server';
        }
      } catch { /* still down */ }
      if (attempts > 30) {
        clearInterval(poll);
        showToast('⚠️ Server did not come back after 60 s.', { variant: 'error' });
        btn.disabled = false;
        btn.textContent = '↻ Restart Server';
      }
    }, 2000);
  }
}

/* ──────────────────────────────────────────────
   MT5 Status
────────────────────────────────────────────── */
async function loadMt5Status() {
  try {
    const data = await apiGet('/api/admin/mt5/status');
    const badge$ = document.getElementById('mt5StatusBadge');
    const text$  = document.getElementById('mt5StatusText');
    if (data.connected) {
      badge$.className = 'server-status online';
      text$.textContent = 'Connected';
    } else {
      badge$.className = 'server-status offline';
      text$.textContent = 'Disconnected';
    }
  } catch { /* ignore */ }
}

/* ──────────────────────────────────────────────
   USERS
────────────────────────────────────────────── */
async function banUser(id) {
  const resModal = await showReasonModal({
    title: t('admin.banPromptTitle'),
    placeholder: t('admin.banPromptPlaceholder'),
    okLabel: t('admin.ban'),
    cancelLabel: t('common.cancel'),
    defaultValue: '',
  });
  if (!resModal.ok) return false;
  const res = await apiPostJson(`/api/admin/users/${encodeURIComponent(id)}/ban`, {
    reason: resModal.value || null,
  });
  if (res.ok) return true;
  const text = await res.text().catch(() => '');
  throw new Error(`ban failed: ${res.status} ${text}`);
}

async function unbanUser(id) {
  const res = await apiPostJson(`/api/admin/users/${encodeURIComponent(id)}/unban`, {});
  if (res.ok) return true;
  const text = await res.text().catch(() => '');
  throw new Error(`unban failed: ${res.status} ${text}`);
}

async function loadUsers() {
  const tbody = document.getElementById('adminUserRows');
  if (!tbody) return 0;
  tbody.innerHTML = emptyRow(7, 'Loading…');
  try {
    const users = await apiGet('/api/admin/users');
    const list = Array.isArray(users) ? users : users?.value ?? [];
    document.getElementById('statUsers').textContent = list.length;
    if (!list.length) { tbody.innerHTML = emptyRow(7); return 0; }
    tbody.innerHTML = '';
    for (const u of list) {
      const tr = document.createElement('tr');
      const created = fmtDate(u.createdAt);
      const banned = !!u.banned;
      const status = banned
        ? badge('Banned', 'badge-danger')
        : badge('Active', 'badge-success');
      const canAct = (u.role ?? '') !== 'ADMIN';
      tr.innerHTML = `
        <td>${escapeHtml(u.id)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.displayName)}</td>
        <td>${badge(u.role ?? 'USER', u.role === 'ADMIN' ? 'badge-warning' : 'badge-neutral')}</td>
        <td>${escapeHtml(created)}</td>
        <td>${status}</td>
        <td></td>`;
      const actionsTd = tr.children[6];
      if (!canAct) {
        actionsTd.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';
      } else if (banned) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline-dark';
        btn.style.cssText = 'padding:6px 14px;font-size:0.82rem;';
        btn.textContent = t('admin.unban') || 'Unban';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try { await unbanUser(u.id); showToast('User unbanned', { variant: 'success' }); await loadUsers(); }
          catch { showToast('Unban failed', { variant: 'error' }); btn.disabled = false; }
        });
        actionsTd.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-danger';
        btn.style.cssText = 'padding:6px 14px;font-size:0.82rem;';
        btn.textContent = t('admin.ban') || 'Ban';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const ok = await banUser(u.id);
            if (ok) { showToast('User banned', { variant: 'success' }); await loadUsers(); }
            else btn.disabled = false;
          } catch { showToast('Ban failed', { variant: 'error' }); btn.disabled = false; }
        });
        actionsTd.appendChild(btn);
      }
      tbody.appendChild(tr);
    }
    return list.length;
  } catch {
    tbody.innerHTML = emptyRow(7, 'Failed to load users');
    return 0;
  }
}

/* ──────────────────────────────────────────────
   ORDERS & POSITIONS
────────────────────────────────────────────── */
async function loadTrades() {
  const tbody = document.getElementById('adminTradeRows');
  if (!tbody) return 0;
  tbody.innerHTML = emptyRow(8, 'Loading…');
  try {
    const list = await apiGet('/api/admin/trades');
    const arr = Array.isArray(list) ? list : [];
    // Split for stats
    const orders = arr.filter(x => x.type !== 'POSITION');
    const positions = arr.filter(x => x.type === 'POSITION');
    document.getElementById('statOrders').textContent = orders.length;
    document.getElementById('statPositions').textContent = positions.length;
    if (!arr.length) { tbody.innerHTML = emptyRow(8); return 0; }
    tbody.innerHTML = arr.map(t => {
      const typeClass = t.type === 'POSITION' ? 'badge-blue' : 'badge-neutral';
      const sideClass = (t.side === 'BUY' || t.side === 'OPEN') ? 'badge-success' : 'badge-danger';
      const statClass = t.status === 'FILLED' || t.status === 'ACTIVE' ? 'badge-success'
                      : t.status === 'PENDING' ? 'badge-warning' : 'badge-neutral';
      return `<tr>
        <td>${escapeHtml(t.id)}</td>
        <td>${escapeHtml(t.accountId)}</td>
        <td>${badge(t.type, typeClass)}</td>
        <td><strong>${escapeHtml(t.symbol)}</strong></td>
        <td>${badge(t.side, sideClass)}</td>
        <td>${fmtNum(t.quantity)}</td>
        <td>${badge(t.status, statClass)}</td>
        <td>${fmtDate(t.date)}</td>
      </tr>`;
    }).join('');
    return arr.length;
  } catch {
    tbody.innerHTML = emptyRow(8, 'Failed to load trades');
    return 0;
  }
}

/* ──────────────────────────────────────────────
   ACCOUNTS
────────────────────────────────────────────── */
async function loadAccounts() {
  const tbody = document.getElementById('adminAccountRows');
  if (!tbody) return 0;
  tbody.innerHTML = emptyRow(10, 'Loading…');
  try {
    const list = await apiGet('/api/admin/accounts');
    const arr = Array.isArray(list) ? list : [];
    document.getElementById('statAccounts').textContent = arr.length;
    if (!arr.length) { tbody.innerHTML = emptyRow(10); return 0; }
    tbody.innerHTML = arr.map(a => {
      const statClass = a.status === 'ACTIVE' ? 'badge-success' : 'badge-danger';
      return `<tr>
        <td>${escapeHtml(a.id)}</td>
        <td>${escapeHtml(a.userId)}</td>
        <td>${badge(a.accountType, 'badge-blue')}</td>
        <td>${escapeHtml(a.currency)}</td>
        <td>1:${escapeHtml(a.leverage)}</td>
        <td>${badge(a.status, statClass)}</td>
        <td class="text-success">${fmtNum(a.balance)}</td>
        <td>${fmtNum(a.equity)}</td>
        <td>${fmtNum(a.marginUsed)}</td>
        <td>${fmtNum(a.freeMargin)}</td>
      </tr>`;
    }).join('');
    return arr.length;
  } catch {
    tbody.innerHTML = emptyRow(10, 'Failed to load accounts');
    return 0;
  }
}

/* ──────────────────────────────────────────────
   TRANSACTIONS
────────────────────────────────────────────── */
async function loadTransactions() {
  const tbody = document.getElementById('adminTxnRows');
  if (!tbody) return 0;
  tbody.innerHTML = emptyRow(8, 'Loading…');
  try {
    const list = await apiGet('/api/admin/transactions');
    const arr = Array.isArray(list) ? list : [];
    document.getElementById('statTxns').textContent = arr.length;
    if (!arr.length) { tbody.innerHTML = emptyRow(8); return 0; }
    tbody.innerHTML = arr.map(tx => {
      const statClass = tx.status === 'COMPLETED' ? 'badge-success'
                      : tx.status === 'PENDING' ? 'badge-warning' : 'badge-danger';
      const typeClass = tx.txType === 'DEPOSIT' ? 'badge-success' : 'badge-danger';
      return `<tr>
        <td>${escapeHtml(tx.id)}</td>
        <td>${escapeHtml(tx.accountId)}</td>
        <td>${badge(tx.txType, typeClass)}</td>
        <td>${badge(tx.status, statClass)}</td>
        <td><strong>${fmtNum(tx.amount)}</strong></td>
        <td>${escapeHtml(tx.currency)}</td>
        <td>${escapeHtml(tx.method)}</td>
        <td>${fmtDate(tx.createdAt)}</td>
      </tr>`;
    }).join('');
    return arr.length;
  } catch {
    tbody.innerHTML = emptyRow(8, 'Failed to load transactions');
    return 0;
  }
}

/* ──────────────────────────────────────────────
   KYC
────────────────────────────────────────────── */
async function loadKyc() {
  const tbody = document.getElementById('adminKycRows');
  if (!tbody) return 0;
  tbody.innerHTML = emptyRow(6, 'Loading…');
  try {
    const list = await apiGet('/api/admin/kyc');
    const arr = Array.isArray(list) ? list : [];
    document.getElementById('statKyc').textContent = arr.length;
    if (!arr.length) { tbody.innerHTML = emptyRow(6); return 0; }
    tbody.innerHTML = arr.map(k => {
      const statClass = k.status === 'APPROVED' ? 'badge-success'
                      : k.status === 'PENDING' ? 'badge-warning' : 'badge-danger';
      return `<tr>
        <td>${escapeHtml(k.id)}</td>
        <td>${escapeHtml(k.userId)}</td>
        <td>${badge(k.status, statClass)}</td>
        <td>${fmtDate(k.submittedAt)}</td>
        <td>${fmtDate(k.reviewedAt)}</td>
        <td>${escapeHtml(k.note)}</td>
      </tr>`;
    }).join('');
    return arr.length;
  } catch {
    tbody.innerHTML = emptyRow(6, 'Failed to load KYC');
    return 0;
  }
}

/* ──────────────────────────────────────────────
   NOTIFICATIONS
────────────────────────────────────────────── */
async function loadNotifications() {
  const tbody = document.getElementById('adminNotifRows');
  if (!tbody) return 0;
  tbody.innerHTML = emptyRow(7, 'Loading…');
  try {
    const list = await apiGet('/api/admin/notifications');
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) { tbody.innerHTML = emptyRow(7); return 0; }
    tbody.innerHTML = arr.map(n =>
      `<tr>
        <td>${escapeHtml(n.id)}</td>
        <td>${escapeHtml(n.userId)}</td>
        <td>${badge(n.notifType, 'badge-blue')}</td>
        <td>${escapeHtml(n.title)}</td>
        <td>${escapeHtml(n.body)}</td>
        <td>${n.read ? badge('Read', 'badge-success') : badge('Unread', 'badge-neutral')}</td>
        <td>${fmtDate(n.createdAt)}</td>
      </tr>`
    ).join('');
    return arr.length;
  } catch {
    tbody.innerHTML = emptyRow(7, 'Failed to load notifications');
    return 0;
  }
}

/* ──────────────────────────────────────────────
   AUDIT LOG
────────────────────────────────────────────── */
async function loadAudit() {
  const tbody = document.getElementById('adminAuditRows');
  if (!tbody) return 0;
  tbody.innerHTML = emptyRow(6, 'Loading…');
  try {
    const list = await apiGet('/api/admin/audit');
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) { tbody.innerHTML = emptyRow(6); return 0; }
    tbody.innerHTML = arr.map(a =>
      `<tr>
        <td>${escapeHtml(a.id)}</td>
        <td>${escapeHtml(a.userId)}</td>
        <td>${badge(a.action, 'badge-purple')}</td>
        <td style="max-width:260px;word-break:break-all;">${escapeHtml(a.detail)}</td>
        <td>${escapeHtml(a.ip)}</td>
        <td>${fmtDate(a.createdAt)}</td>
      </tr>`
    ).join('');
    return arr.length;
  } catch {
    tbody.innerHTML = emptyRow(6, 'Failed to load audit log');
    return 0;
  }
}

/* ──────────────────────────────────────────────
   Load all data at once
────────────────────────────────────────────── */
async function loadAllData() {
  await Promise.all([
    loadUsers(),
    loadTrades(),
    loadAccounts(),
    loadTransactions(),
    loadKyc(),
    loadNotifications(),
    loadAudit(),
    checkServerHealth(),
    loadMt5Status(),
  ]);
}

/* ──────────────────────────────────────────────
   Tab switching
────────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`tab-${btn.dataset.tab}`);
      if (panel) panel.classList.add('active');
    });
  });
}

/* ──────────────────────────────────────────────
   Init
────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();
  initTabs();

  // No auth guard here - the backend's LocalhostOnlyFilter ensures 
  // that ONLY the local machine can access the admin APIs and page.
  // This allows entering "straight" without a password.

  await loadAllData();

  // Reload all data
  document.getElementById('adminReloadBtn')?.addEventListener('click', async () => {
    showToast('Refreshing data…', { variant: 'info' });
    await loadAllData();
    showToast('Data refreshed', { variant: 'success' });
  });

  // Logout
  document.getElementById('adminLogoutBtn')?.addEventListener('click', async () => {
    const res = await apiPostLogout();
    if (res.ok) {
      showToast('Logged out', { variant: 'success' });
      setTimeout(() => { window.location.href = 'login.html'; }, 800);
    } else {
      showToast('Logout failed', { variant: 'error' });
    }
  });

  // Restart server
  document.getElementById('restartServerBtn')?.addEventListener('click', () => restartServer());

  // MT5
  document.getElementById('mt5ConnectBtn')?.addEventListener('click', async () => {
    try {
      const data = await apiPostJson('/api/admin/mt5/connect', {});
      if (data.connected) {
        showToast('✅ MT5 bridge connected successfully', { variant: 'success' });
      } else {
        showToast('❌ Failed to reach MT5. Ensure MT5 Terminal is running and EA is active on port 5555.', { variant: 'error' });
      }
      await loadMt5Status();
    } catch { showToast('Network error while connecting MT5', { variant: 'error' }); }
  });
  document.getElementById('mt5DisconnectBtn')?.addEventListener('click', async () => {
    try {
      await apiPostJson('/api/admin/mt5/disconnect', {});
      showToast('MT5 bridge disconnected', { variant: 'warning' });
      await loadMt5Status();
    } catch { showToast('Failed to disconnect MT5', { variant: 'error' }); }
  });

  // Auto-refresh every 60 s
  setInterval(async () => {
    await checkServerHealth();
  }, 60_000);
});
