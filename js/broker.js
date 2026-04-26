const API = 'http://localhost:8080/api';

function showToast(msg, type = 'info') {
  let toast = document.getElementById('brokerToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'brokerToast';
    toast.style.cssText = 'position:fixed; bottom:30px; right:30px; background: var(--surface-2); border:1px solid var(--border-light); border-radius:10px; padding:14px 22px; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.4); z-index:200; transition:opacity 0.3s; display:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.borderColor = type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--border-light)';
  toast.style.display = 'block';
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => { toast.style.display = 'none'; }, 300); }, 3500);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('Broker admin loaded');
  
  const testBtn = document.getElementById('testConnection');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(API + '/admin/mt5/status', { credentials: 'include' });
        const data = await res.json();
        if (data && data.connected) {
          showToast('✓ MT5 Connection OK!', 'success');
        } else {
          showToast('⚠ MT5 not connected. Check bridge settings.', 'error');
        }
      } catch {
        showToast('Connection test failed. Backend may be offline.', 'error');
      }
    });
  }
});
