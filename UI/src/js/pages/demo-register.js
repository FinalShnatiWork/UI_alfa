import { apiPostJson, apiPostFormUrlEncoded } from '../lib/api.js';
import { showToast } from '../lib/toast.js';
import { applyI18n } from '../lib/i18n.js';

const API_REGISTER = '/api/auth/register';
const API_LOGIN    = '/api/auth/login';

function showError(msg) {
  const el = document.getElementById('demoErrorMsg');
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  const el = document.getElementById('demoErrorMsg');
  if (el) el.style.display = 'none';
}

function setLoading(loading) {
  const btn = document.getElementById('demoRegisterBtn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading
    ? 'Creating account…'
    : 'Create Demo Account & Start Trading';
}

async function doRegisterAndLogin(name, email, password) {
  setLoading(true);
  hideError();

  try {
    // 1. Register
    const regRes = await apiPostJson(API_REGISTER, {
      email,
      displayName: name || email.split('@')[0],
      password,
    });

    if (regRes.status === 409) {
      // Account already exists → just try to log in
      showToast('Account already exists — logging you in…', { variant: 'info', duration: 2000 });
    } else if (regRes.status === 201) {
      showToast('Account created! Logging you in…', { variant: 'success', duration: 1800 });
    } else {
      const body = await regRes.json().catch(() => ({}));
      showError(body?.error || 'Registration failed. Please try again.');
      setLoading(false);
      return;
    }

    // 2. Auto-login using Spring Security form login
    const loginBody = new URLSearchParams();
    loginBody.set('username', email);
    loginBody.set('password', password);

    const loginRes = await apiPostFormUrlEncoded(API_LOGIN, loginBody.toString());

    if (loginRes.ok) {
      // Backend auto-provisions $100,000 demo balance (BrokerApiController.ensurePrimaryAccount)
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    } else {
      const err = await loginRes.json().catch(() => ({}));
      if (err?.error === 'banned') {
        showError('This account has been suspended. Please contact support.');
      } else {
        showError('Login failed after registration. Please try logging in manually.');
        setTimeout(() => { window.location.href = 'login.html'; }, 2500);
      }
      setLoading(false);
    }
  } catch (e) {
    console.error('[demo-register]', e);
    showError('Connection error. Make sure the server is running.');
    setLoading(false);
  }
}

function validate(name, email, password) {
  if (!email || !email.includes('@')) {
    showError('Please enter a valid email address.');
    return false;
  }
  if (!password || password.length < 8) {
    showError('Password must be at least 8 characters.');
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  // Password visibility toggle
  const toggleBtn = document.getElementById('toggleDemoPassword');
  const pwInput   = document.getElementById('demoPassword');
  if (toggleBtn && pwInput) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = pwInput.type === 'password';
      pwInput.type = isHidden ? 'text' : 'password';
      toggleBtn.textContent = isHidden ? '🙈' : '👁';
      toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  }

  // Form submit (button click or Enter)
  const form = document.getElementById('demoRegisterForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name     = document.getElementById('demoName')?.value.trim() ?? '';
      const email    = document.getElementById('demoEmail')?.value.trim() ?? '';
      const password = document.getElementById('demoPassword')?.value ?? '';

      if (!validate(name, email, password)) return;
      await doRegisterAndLogin(name, email, password);
    });
  }

  // Clear error on any input change
  ['demoName', 'demoEmail', 'demoPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', hideError);
  });
});
