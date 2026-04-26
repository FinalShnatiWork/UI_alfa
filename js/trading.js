const API = 'http://localhost:8080/api';

function showToast(msg, type = 'info') {
  let toast = document.getElementById('tradeToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'tradeToast';
    toast.style.cssText = 'position:fixed; bottom:30px; right:30px; background: var(--surface-2); border:1px solid var(--border-light); border-radius:10px; padding:14px 22px; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.4); z-index:200; transition:opacity 0.3s; display:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.borderColor = type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--border-light)';
  toast.style.display = 'block';
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => { toast.style.display = 'none'; }, 300); }, 3500);
}

async function placeOrder(side) {
  const symbol = 'EURUSD';
  const qty = parseFloat(document.getElementById('vol').value) || 1.0;
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const res = await fetch(API + '/broker/orders', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ symbolCode: symbol, side, orderType: 'MARKET', quantity: qty })
    });
    const data = await res.json();
    if (data.ok) {
      const price = data.fillPrice ? ` @ ${parseFloat(data.fillPrice).toFixed(5)}` : '';
      showToast(`${side} order filled${price} — ${qty} lots`, 'success');
    } else {
      showToast('Order failed: ' + (data.error || 'unknown'), 'error');
    }
  } catch (e) {
    showToast('Connection error. Backend may be offline.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const volInput = document.getElementById('vol');
  
  document.getElementById('volMinus').addEventListener('click', () => {
    const v = Math.max(0.01, parseFloat(volInput.value) - 0.1);
    volInput.value = v.toFixed(2);
  });
  
  document.getElementById('volPlus').addEventListener('click', () => {
    volInput.value = (parseFloat(volInput.value) + 0.1).toFixed(2);
  });
  
  document.getElementById('sellBtn').addEventListener('click', () => placeOrder('SELL'));
  document.getElementById('buyBtn').addEventListener('click', () => placeOrder('BUY'));
});
