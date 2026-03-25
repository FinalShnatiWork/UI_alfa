document.addEventListener('DOMContentLoaded', () => {
  console.log('Register screen loaded');
  
  document.getElementById('registerBtn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
});
