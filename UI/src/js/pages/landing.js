import { applyI18n, getLang, setLang, t } from '../lib/i18n.js';
import { apiGet, apiPostFormUrlEncoded } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

function syncLandingLangButtons() {
  const lang = getLang();
  document.querySelectorAll('.landing-lang-btn[data-lang]').forEach((btn) => {
    const on = btn.getAttribute('data-lang') === lang;
    btn.classList.toggle('landing-lang-btn--active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function initLanding() {
  applyI18n();
  syncLandingLangButtons();

  // Dev smoke check: if backend is running, show a quiet success toast.
  apiGet('/api/health')
    .then(() => {
      // Keep it subtle: one toast only on landing.
      showToast('API: OK', { variant: 'success', duration: 1400 });
    })
    .catch(() => {
      // Backend is optional during static UI work; ignore errors.
    });

  document.querySelectorAll('.landing-lang-btn[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-lang');
      if (!code) return;
      setLang(code);
      syncLandingLangButtons();
    });
  });

  const demo = document.querySelector('[data-demo-link]');
  if (demo) {
    demo.addEventListener('click', async (e) => {
      e.preventDefault();
      showToast(t('alerts.demoOk'), { variant: 'success', duration: 1800 });
      const body = new URLSearchParams();
      body.set('username', 'demo@broker.local');
      body.set('password', 'demo123');
      try {
        const res = await apiPostFormUrlEncoded('/api/auth/login', body.toString());
        if (res.ok) {
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 600);
        } else {
          try {
            const err = await res.json();
            if (err?.error === 'banned') {
              showToast(t('alerts.authBanned'), { variant: 'error', duration: 5000 });
              return;
            }
          } catch {
            /* ignore */
          }
          // Fallback: route to login page if backend auth isn't available.
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 600);
        }
      } catch {
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 600);
      }
    });
  }

  document.querySelectorAll('a[href="#"]').forEach((link) => {
    if (link === demo) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showToast(t('alerts.comingSoon'), { variant: 'info' });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanding, { once: true });
} else {
  initLanding();
}
