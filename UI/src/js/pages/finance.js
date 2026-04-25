import { applyI18n, t } from '../lib/i18n.js';
import { showToast } from '../lib/toast.js';
import { apiGet, apiPostJson } from '../lib/api.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const depositBtn        = document.getElementById('depositBtn');
  const withdrawBtn       = document.getElementById('withdrawBtn');
  const availableEl       = document.getElementById('financeAvailable');
  const pendingEl         = document.getElementById('financePendingWithdrawal');
  const tbody             = document.getElementById('financeRows');

  // Modal elements
  const txModal           = document.getElementById('txModal');
  const txModalTitle      = document.getElementById('txModalTitle');
  const txModalIconRow    = document.getElementById('txModalIconRow');
  const txModalNote       = document.getElementById('txModalNote');
  const txModalClose      = document.getElementById('txModalClose');
  const txCancelBtn       = document.getElementById('txCancelBtn');
  const txConfirmBtn      = document.getElementById('txConfirmBtn');
  const txAmountInput     = document.getElementById('txAmount');
  const txMethodSelect    = document.getElementById('txMethod');
  const txPresetBtns      = document.querySelectorAll('.tx-preset-btn');

  let currentTxType = 'DEPOSIT';
  let currency = 'USD';

  // ── Formatters ─────────────────────────────────────────────────────────────
  const fmtMoney = (n, cur = 'USD') =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n ?? 0));

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Data refresh ───────────────────────────────────────────────────────────
  async function refresh() {
    try {
      const overview = await apiGet('/api/broker/overview');
      currency = overview.currency || 'USD';
      if (availableEl) availableEl.textContent = fmtMoney(overview.balance, currency);

      const tx = await apiGet('/api/broker/transactions');
      const list = Array.isArray(tx) ? tx : [];
      const pendingWithdraw = list
        .filter((r) => String(r.txType).toUpperCase() === 'WITHDRAWAL' && String(r.status).toUpperCase() === 'PENDING')
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
      if (pendingEl) pendingEl.textContent = fmtMoney(pendingWithdraw, currency);

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
            const statusUpper = String(r.status ?? '').toUpperCase();
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${fmtTime(r.createdAt)}</td>
              <td class="${isDep ? 'text-success' : 'text-danger'} font-bold">${escapeHtml(String(r.txType ?? ''))}</td>
              <td class="font-bold">${isDep ? '+' : '-'}${fmtMoney(amt, currency)}</td>
              <td>${escapeHtml(r.method ?? '—')}</td>
              <td><span class="badge ${statusUpper === 'APPROVED' ? 'badge-success' : statusUpper === 'PENDING' ? 'badge-warning' : 'badge-danger'}" ${statusUpper === 'PENDING' ? 'style="color:#000;"' : ''}>${escapeHtml(String(r.status ?? ''))}</span></td>
              <td class="text-sm dir-ltr">tx-${escapeHtml(String(r.id ?? ''))}</td>
            `;
            tbody.appendChild(tr);
          }
        }
      }
    } catch {
      // not logged in
    }
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function openModal(type) {
    currentTxType = type;
    const isDeposit = type === 'DEPOSIT';

    if (txModalTitle) txModalTitle.setAttribute('data-i18n', isDeposit ? 'finance.deposit' : 'finance.withdraw');
    if (txModalTitle) txModalTitle.textContent = t(isDeposit ? 'finance.deposit' : 'finance.withdraw');

    if (txModalIconRow) {
      txModalIconRow.innerHTML = isDeposit
        ? `<div class="tx-modal-icon deposit-icon">↑</div><div class="tx-modal-icon-label" data-i18n="finance.deposit">${t('finance.deposit')}</div>`
        : `<div class="tx-modal-icon withdraw-icon">↓</div><div class="tx-modal-icon-label" data-i18n="finance.withdraw">${t('finance.withdraw')}</div>`;
    }

    if (txModalNote) {
      txModalNote.textContent = isDeposit
        ? t('finance.modalDepositNote')
        : t('finance.modalWithdrawNote');
    }

    if (txConfirmBtn) {
      txConfirmBtn.className = `btn tx-confirm-btn ${isDeposit ? 'btn-primary' : 'btn-danger'}`;
    }

    if (txAmountInput) txAmountInput.value = '';
    if (txMethodSelect) txMethodSelect.value = 'card';
    txPresetBtns.forEach((b) => b.classList.remove('active'));

    if (txModal) txModal.style.display = 'flex';
    if (txAmountInput) txAmountInput.focus();
  }

  function closeModal() {
    if (txModal) txModal.style.display = 'none';
  }

  // Preset buttons
  txPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      if (txAmountInput) txAmountInput.value = val;
      txPresetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Close triggers
  if (txModalClose) txModalClose.addEventListener('click', closeModal);
  if (txCancelBtn) txCancelBtn.addEventListener('click', closeModal);
  if (txModal) txModal.addEventListener('click', (e) => { if (e.target === txModal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Confirm
  if (txConfirmBtn) {
    txConfirmBtn.addEventListener('click', async () => {
      const amount = Number(txAmountInput?.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast(t('finance.modalInvalidAmount'), { variant: 'warning' });
        return;
      }

      txConfirmBtn.disabled = true;
      txConfirmBtn.textContent = t('common.loading');

      try {
        const res = await apiPostJson('/api/broker/transactions', {
          txType: currentTxType,
          amount,
          method: txMethodSelect?.value || 'card',
          note: currentTxType === 'DEPOSIT' ? 'Demo deposit' : 'Demo withdrawal request',
        });

        if (res.ok) {
          const isDeposit = currentTxType === 'DEPOSIT';
          showToast(
            isDeposit ? t('finance.toastDepositOk') : t('finance.toastWithdrawOk'),
            { variant: isDeposit ? 'success' : 'info' }
          );
          closeModal();
          await refresh();
        } else {
          showToast(t('alerts.authNeedLogin'), { variant: 'warning' });
        }
      } finally {
        txConfirmBtn.disabled = false;
        txConfirmBtn.textContent = t('finance.modalConfirm');
      }
    });
  }

  // Open modal on button click
  if (depositBtn) depositBtn.addEventListener('click', () => openModal('DEPOSIT'));
  if (withdrawBtn) withdrawBtn.addEventListener('click', () => openModal('WITHDRAWAL'));

  refresh();
});
