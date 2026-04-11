import { applyI18n, t } from '../lib/i18n.js';
import { apiPostJson } from '../lib/api.js';
import { showToast } from '../lib/toast.js';
import { saveUserProfile } from '../lib/userProfile.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const registerBtn = document.getElementById('registerBtn');
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const terms = document.getElementById('terms');
      const risk = document.getElementById('risk');
      if (!terms?.checked || !risk?.checked) {
        showToast(t('alerts.registerTerms'), { variant: 'warning' });
        return;
      }

      const firstName = document.getElementById('regFirstName')?.value.trim() ?? '';
      const lastName = document.getElementById('regLastName')?.value.trim() ?? '';
      const idDoc = document.getElementById('regIdDoc')?.value.trim() ?? '';
      const email = document.getElementById('regEmail')?.value.trim() ?? '';
      const phone = document.getElementById('regPhone')?.value.trim() ?? '';
      const currency = document.getElementById('regCurrency')?.value ?? '';
      const leverage = document.getElementById('regLeverage')?.value ?? '';
      const password = document.getElementById('regPassword')?.value ?? '';

      if (!email || !password) {
        showToast(t('alerts.authFields'), { variant: 'warning' });
        return;
      }
      if (password.length < 8) {
        showToast(t('alerts.authPasswordShort'), { variant: 'warning' });
        return;
      }

      const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || email.split('@')[0];

      try {
        const res = await apiPostJson('/api/auth/register', {
          email,
          displayName,
          password,
        });
        if (res.status === 201) {
          saveUserProfile({
            firstName,
            lastName,
            idDoc,
            email,
            phone,
            currency,
            leverage,
          });
          showToast(t('alerts.registerOk'), { variant: 'success', duration: 2400 });
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 1800);
        } else if (res.status === 409) {
          showToast(t('alerts.authRegisterConflict'), { variant: 'warning' });
        } else {
          showToast(t('alerts.authRegisterFail'), { variant: 'error' });
        }
      } catch {
        showToast(t('alerts.authRegisterFail'), { variant: 'error' });
      }
    });
  }
});
