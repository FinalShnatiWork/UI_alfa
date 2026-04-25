import { applyI18n, t } from '../lib/i18n.js';
import { apiGet, apiPostLogout } from '../lib/api.js';
import { showToast } from '../lib/toast.js';
import { getUserProfile } from '../lib/userProfile.js';

function hydrateAccountFromProfile() {
  const p = getUserProfile();
  const nameEl = document.getElementById('accountDisplayName');
  const uidLine = document.getElementById('accountUidLine');

  if (!p) {
    if (nameEl) nameEl.textContent = '—';
    return;
  }

  const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  if (nameEl) nameEl.textContent = full || '—';

  if (uidLine) {
    uidLine.removeAttribute('data-i18n');
    uidLine.textContent = p.uid ? t('account.uidFormat', { uid: String(p.uid) }) : t('account.uid');
  }

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value && String(value).trim() ? String(value).trim() : '—';
  };

  setText('accountValIdDoc', p.idDoc);
  setText('accountValEmail', p.email);
  setText('accountValPhone', p.phone);
  setText('accountValPan', p.uid);

  const levBadge = document.getElementById('accountLeverageBadge');
  if (levBadge && p.leverage) {
    levBadge.removeAttribute('data-i18n');
    levBadge.textContent = t('account.leverageDynamic', { leverage: String(p.leverage) });
  }

  const curLine = document.getElementById('accountCurrencyLine');
  if (curLine && p.currency) {
    curLine.textContent = t('account.currencyDynamic', { currency: String(p.currency) });
    curLine.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  hydrateAccountFromProfile();

  // Prefer real server data when logged in (demo-friendly)
  (async () => {
    try {
      const me = await apiGet('/api/auth/me');
      const ov = await apiGet('/api/broker/overview');

      const nameEl = document.getElementById('accountDisplayName');
      if (nameEl && me?.displayName) nameEl.textContent = me.displayName;

      const uidLine = document.getElementById('accountUidLine');
      if (uidLine && ov?.tradingAccountId) {
        uidLine.removeAttribute('data-i18n');
        uidLine.textContent = t('account.uidFormat', { uid: String(ov.tradingAccountId) });
      }

      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value && String(value).trim() ? String(value).trim() : '—';
      };

      setText('accountValEmail', me?.email);
      const levBadge = document.getElementById('accountLeverageBadge');
      if (levBadge && ov?.leverage) {
        levBadge.removeAttribute('data-i18n');
        levBadge.textContent = t('account.leverageDynamic', { leverage: String(ov.leverage) });
      }
      const curLine = document.getElementById('accountCurrencyLine');
      if (curLine && ov?.currency) {
        curLine.textContent = t('account.currencyDynamic', { currency: String(ov.currency) });
        curLine.hidden = false;
      }

      const cur = ov?.currency || 'USD';
      const fmtMoney = (n) =>
        new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n ?? 0));
      const balEl = document.getElementById('accountBalance');
      const eqEl  = document.getElementById('accountEquity');
      const fmEl  = document.getElementById('accountFreeMargin');
      if (balEl && ov?.balance  != null) balEl.textContent  = fmtMoney(ov.balance);
      if (eqEl  && ov?.equity   != null) eqEl.textContent   = fmtMoney(ov.equity);
      if (fmEl  && ov?.freeMargin != null) fmEl.textContent = fmtMoney(ov.freeMargin);
    } catch {
      // keep local demo profile fallback
    }
  })();

  const editBtn = document.getElementById('editProfileBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      showToast(t('alerts.editProfile'), { variant: 'info' });
    });
  }

  document.getElementById('accountLogoutBtn')?.addEventListener('click', async () => {
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
});
