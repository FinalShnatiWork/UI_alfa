function showToast(msg, type = 'info') {
  let toast = document.getElementById('financeToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'financeToast';
    toast.style.cssText = 'position:fixed; bottom:30px; right:30px; background: var(--surface-2); border:1px solid var(--border-light); border-radius:10px; padding:14px 22px; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.4); z-index:200; transition:opacity 0.3s; display:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.borderColor = type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--amber)';
  toast.style.display = 'block';
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => { toast.style.display = 'none'; }, 300); }, 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('Finance loaded');
  
  const depositBtn = document.getElementById('depositBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');

  if (depositBtn) {
    depositBtn.addEventListener('click', () => {
      showToast('💳 Redirecting to payment gateway...', 'info');
    });
  }
  
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', () => {
      showToast('📋 Withdrawal request form opening...', 'info');
    });
  }
});
