const API = 'http://localhost:8080/api';

async function demoLogin() {
  try {
    const body = new URLSearchParams({ username: 'demo@broker.local', password: 'demo1234' });
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await res.json();
    if (data.ok) {
      window.location.href = '/pages/dashboard.html';
    } else {
      // Redirect to login page with demo flag
      window.location.href = 'login.html?demo=1';
    }
  } catch (e) {
    window.location.href = 'login.html?demo=1';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const demoBtn = document.getElementById('demoLoginBtn');
  if (demoBtn) {
    demoBtn.addEventListener('click', demoLogin);
  }
});
