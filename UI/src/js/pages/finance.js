import { applyI18n, t } from '../lib/i18n.js';
import { showToast } from '../lib/toast.js';
import { apiGet, apiPostJson } from '../lib/api.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const depositBtn = document.getElementById('depositBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');
  const availableEl = document.getElementById('financeAvailable');
  const pendingEl = document.getElementById('financePendingWithdrawal');
  const tbody = document.getElementById('financeRows');

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

  async function refresh() {
    try {
      const overview = await apiGet('/api/broker/overview');
      const cur = overview.currency || 'USD';
      if (availableEl) availableEl.textContent = fmtMoney(overview.balance, cur);

      const tx = await apiGet('/api/broker/transactions');
      const list = Array.isArray(tx) ? tx : [];
      const pendingWithdraw = list
        .filter((t) => String(t.txType).toUpperCase() === 'WITHDRAWAL' && String(t.status).toUpperCase() === 'PENDING')
        .reduce((s, t) => s + Number(t.amount ?? 0), 0);
      if (pendingEl) pendingEl.textContent = fmtMoney(pendingWithdraw, cur);

      if (tbody) {
        tbody.replaceChildren();
        if (!list.length) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td colspan="6" class="text-muted text-sm">${t('alerts.comingSoon')}</td>`;
          tbody.appendChild(tr);
        } else {
          for (const r of list.slice(0, 50)) {
            const isDep = String(r.txType).toUpperCase() === 'DEPOSIT';
            const amt = Number(r.amount ?? 0);
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${fmtTime(r.createdAt)}</td>
              <td class="${isDep ? 'text-success' : 'text-danger'} font-bold">${escapeHtml(String(r.txType ?? ''))}</td>
              <td class="font-bold">${isDep ? '+' : '-'}${fmtMoney(amt, cur)}</td>
              <td>${escapeHtml(r.method ?? '—')}</td>
              <td><span class="badge ${String(r.status).toUpperCase() === 'APPROVED' ? 'badge-success' : String(r.status).toUpperCase() === 'PENDING' ? 'badge-warning' : 'badge-danger'}" ${String(r.status).toUpperCase() === 'PENDING' ? 'style="color:#000;"' : ''}>${escapeHtml(String(r.status ?? ''))}</span></td>
              <td class="text-sm dir-ltr">tx-${escapeHtml(String(r.id ?? ''))}</td>
            `;
            tbody.appendChild(tr);
          }
        }
      }
    } catch {
      // ignore; most likely not logged in
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (depositBtn) {
    depositBtn.addEventListener('click', async () => {
      const amountStr = window.prompt('Deposit amount (demo):', '1000');
      if (!amountStr) return;
      const amount = Number(amountStr);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const res = await apiPostJson('/api/broker/transactions', {
        txType: 'DEPOSIT',
        amount,
        method: 'demo',
        note: 'Demo deposit request',
      });
      if (res.ok) {
        showToast(t('alerts.connectionOk'), { variant: 'success' });
        await refresh();
      } else {
        showToast(t('alerts.authNeedLogin'), { variant: 'warning' });
      }
    });
  }

  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', async () => {
      const amountStr = window.prompt('Withdrawal amount (demo):', '500');
      if (!amountStr) return;
      const amount = Number(amountStr);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const res = await apiPostJson('/api/broker/transactions', {
        txType: 'WITHDRAWAL',
        amount,
        method: 'demo',
        note: 'Demo withdrawal request',
      });
      if (res.ok) {
        showToast(t('alerts.connectionOk'), { variant: 'success' });
        await refresh();
      } else {
        showToast(t('alerts.withdrawKyc'), { variant: 'warning' });
      }
    });
  }

  refresh();
});
