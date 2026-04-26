import { getLang, setLang, applyI18n, t } from '../lib/i18n.js';
import { apiGet } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();


  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect && window.BrokerTheme) {
    themeSelect.value = window.BrokerTheme.getMode();
    themeSelect.addEventListener('change', () => {
      window.BrokerTheme.setMode(themeSelect.value);
    });
  }

  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    langSelect.value = getLang();
    langSelect.addEventListener('change', () => {
      setLang(langSelect.value);
    });
  }

  const changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', () => {
      showToast(t('alerts.passwordEmail'), { variant: 'info' });
    });
  }

  const inputs = document.querySelectorAll('input[type="checkbox"], select');
  inputs.forEach((input) => {
    if (input.id === 'themeSelect' || input.id === 'langSelect') return;
    input.addEventListener('change', () => {
      showToast(t('alerts.settingsOk'), { variant: 'success' });
    });
  });
});
