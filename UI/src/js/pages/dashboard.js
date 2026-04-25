import { applyI18n, t } from '../lib/i18n.js';
import { apiGet, apiPostLogout } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const fmtMoney = (n, currency = 'USD') => {
    const v = Number(n ?? 0);
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  };

  const balanceEl = document.getElementById('dashboardBalance');
  const equityEl = document.getElementById('dashboardEquity');
  const plEl = document.getElementById('dashboardPl');
  const alertsEl = document.getElementById('dashboardAlertsList');
  const posBody = document.getElementById('dashboardPositionsBody');
  const logoutBtn = document.getElementById('dashboardLogoutBtn');

  logoutBtn?.addEventListener('click', async () => {
    const res = await apiPostLogout();
    if (res.ok) {
      showToast(t('alerts.authLoggedOut'), { variant: 'success' });
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 700);
    } else {
      showToast(t('alerts.authLogoutFail'), { variant: 'error' });
    }
  });

  async function load() {
    try {
      const overview = await apiGet('/api/broker/overview');
      const cur = overview.currency || 'USD';
      if (balanceEl) balanceEl.textContent = fmtMoney(overview.balance, cur);
      if (equityEl) equityEl.textContent = fmtMoney(overview.equity, cur);
      if (plEl) {
        const pnl = Number(overview.equity ?? 0) - Number(overview.balance ?? 0);
        plEl.textContent = `${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, cur)}`;
        plEl.classList.toggle('text-success', pnl >= 0);
        plEl.classList.toggle('text-danger', pnl < 0);
      }

      const notifications = await apiGet('/api/broker/notifications').catch(() => []);
      if (alertsEl) {
        alertsEl.replaceChildren();
        const list = Array.isArray(notifications) ? notifications : [];
        if (!list.length) {
          const li = document.createElement('li');
          li.className = 'text-muted text-sm';
          li.style.padding = '10px 0';
          li.textContent = t('dashboard.noNotifications') || '—';
          alertsEl.appendChild(li);
        } else {
          for (const n of list.slice(0, 5)) {
            const li = document.createElement('li');
            li.style.padding = '10px 0';
            li.style.borderBottom = '1px solid var(--border-light)';
            li.style.fontSize = '0.9rem';
            li.innerHTML = `<span class="badge">${String(n.notifType ?? 'SYSTEM')}</span> <span>${escapeHtml(n.title ?? '')}</span>`;
            alertsEl.appendChild(li);
          }
        }
      }

      const positions = await apiGet('/api/broker/positions').catch(() => []);
      if (posBody) {
        posBody.replaceChildren();
        const list = Array.isArray(positions) ? positions : [];
        if (!list.length) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td colspan="6" class="text-muted text-sm" style="padding:16px;text-align:center;">${escapeHtml(t('positions.empty'))}</td>`;
          posBody.appendChild(tr);
        } else {
          for (const p of list.slice(0, 10)) {
            const tr = document.createElement('tr');
            const qty = Number(p.quantity ?? 0);
            const pl = Number(p.unrealizedPnl ?? 0) + Number(p.realizedPnl ?? 0);
            tr.innerHTML = `
              <td class="font-bold">${escapeHtml(p.symbolCode ?? '')}</td>
              <td>${qty.toFixed(2)}</td>
              <td>${p.avgPrice ?? '—'}</td>
              <td>—</td>
              <td class="${pl >= 0 ? 'text-success' : 'text-danger'} font-bold">${pl >= 0 ? '+' : ''}${fmtMoney(pl, cur)}</td>
              <td><span class="badge badge-success">${escapeHtml(t('badge.open'))}</span></td>
            `;
            posBody.appendChild(tr);
          }
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
