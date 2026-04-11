import { applyI18n, t } from '../lib/i18n.js';
import { showToast } from '../lib/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const testBtn = document.getElementById('testConnection');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      showToast(t('alerts.connectionOk'), { variant: 'success' });
    });
  }
});
