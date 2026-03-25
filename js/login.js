document.addEventListener('DOMContentLoaded', () => {
  console.log('Login screen loaded');
  
  document.getElementById('loginBtn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
});
