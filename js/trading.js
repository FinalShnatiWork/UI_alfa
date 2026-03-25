document.addEventListener('DOMContentLoaded', () => {
  console.log('Trading loaded');
  
  const volInput = document.getElementById('vol');
  
  document.getElementById('volMinus').addEventListener('click', () => {
    volInput.value = (parseFloat(volInput.value) - 0.1).toFixed(2);
  });
  
  document.getElementById('volPlus').addEventListener('click', () => {
    volInput.value = (parseFloat(volInput.value) + 0.1).toFixed(2);
  });
  
  document.getElementById('sellBtn').addEventListener('click', () => {
    alert(`Order SELL for ${volInput.value} lots submitted successfully!`);
  });
  
  document.getElementById('buyBtn').addEventListener('click', () => {
    alert(`Order BUY for ${volInput.value} lots submitted successfully!`);
  });
});
