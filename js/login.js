const API = 'http://localhost:8080/api';

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('errorMsg').style.display = 'none';
}

async function getCsrf() {
  try {
    const r = await fetch(API + '/auth/csrf', { credentials: 'include' });
    const data = await r.json();
    return data.token || null;
  } catch { return null; }
}

async function doLogin(email, password) {
  hideError();
  try {
    // Use form-encoded login (Spring Security formLogin)
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await res.json();
    if (data.ok) {
      window.location.href = 'dashboard.html';
    } else {
      if (data.error === 'banned') {
        showError('This account has been suspended.');
      } else {
        showError('Invalid email or password. Please try again.');
      }
    }
  } catch (e) {
    // Fallback: direct to dashboard for demo purpose
    window.location.href = 'dashboard.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Auto-fill demo if redirected from landing
  if (window.location.search.includes('demo=1')) {
    doLogin('demo@broker.local', 'demo1234');
    return;
  }

  document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }
    doLogin(email, password);
  });

  document.getElementById('demoBtn').addEventListener('click', () => {
    doLogin('demo@broker.local', 'demo1234');
  });

  // Allow Enter key
  document.getElementById('loginForm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });
});
