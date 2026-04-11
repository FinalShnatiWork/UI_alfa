import { applyI18n, t } from '../lib/i18n.js';
import { apiPostFormUrlEncoded } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = (document.getElementById('loginEmail')?.value.trim() ?? '').toLowerCase();
      const password = document.getElementById('loginPassword')?.value ?? '';
      if (!email || !password) {
        showToast(t('alerts.authFields'), { variant: 'warning' });
        return;
      }
      const body = new URLSearchParams();
      body.set('username', email);
      body.set('password', password);
      try {
        const res = await apiPostFormUrlEncoded('/api/auth/login', body.toString());
        if (res.ok) {
          showToast(t('alerts.authLoginOk'), { variant: 'success', duration: 1400 });
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 600);
        } else {
          let err = null;
          try {
            err = await res.json();
          } catch {
            /* ignore */
          }
          if (err?.error === 'banned') {
            showToast(t('alerts.authBanned'), { variant: 'error', duration: 5000 });
          } else {
            showToast(t('alerts.authLoginFail'), { variant: 'error' });
          }
        }
      } catch {
        showToast(t('alerts.authLoginFail'), { variant: 'error' });
      }
    });
  }

  const forgot = document.getElementById('forgotPasswordLink');
  if (forgot) {
    forgot.addEventListener('click', (e) => {
      e.preventDefault();
      showToast(t('alerts.passwordRecovery'), { variant: 'info' });
    });
  }

  const googleBtn = document.getElementById('googleLoginBtn');
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      showToast(t('alerts.googleLogin'), { variant: 'info', duration: 3200 });
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);
    });
  }
});
