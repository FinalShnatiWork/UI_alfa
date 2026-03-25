document.addEventListener('DOMContentLoaded', () => {
  console.log('Finance loaded');
  
  document.getElementById('depositBtn').addEventListener('click', () => {
    alert('Redirecting to payment gateway / display wire transfer details...');
  });
  
  document.getElementById('withdrawBtn').addEventListener('click', () => {
    alert('Opening withdrawal request form...');
  });
});
