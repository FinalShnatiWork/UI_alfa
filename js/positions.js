document.addEventListener('DOMContentLoaded', () => {
  console.log('Positions loaded');
  
  document.querySelectorAll('.close-position').forEach(btn => {
    btn.addEventListener('click', () => {
      const symbol = btn.dataset.symbol;
      if (confirm('Are you sure you want to close the position for ' + symbol + '?')) {
        alert('Position closed!');
      }
    });
  });
});
