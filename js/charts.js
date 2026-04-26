const API = 'http://localhost:8080/api';

document.addEventListener('DOMContentLoaded', () => {
  const chartContainer = document.getElementById('chartContainer');
  if (!chartContainer) return;

  const chart = LightweightCharts.createChart(chartContainer, {
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight,
    layout: {
      backgroundColor: '#ffffff',
      textColor: '#333',
    },
    grid: {
      vertLines: { color: '#f0f0f0' },
      horzLines: { color: '#f0f0f0' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: '#dfdfdf',
    },
    timeScale: {
      borderColor: '#dfdfdf',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  const candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  });

  let currentSymbol = 'EURUSD';
  let currentInterval = '1h';

  async function loadData(symbol, interval) {
    let type = 'forex';
    if (symbol.startsWith('XAU') || symbol.startsWith('XAG')) {
      type = 'metals';
    } else if (symbol.length < 6) {
      type = 'stock';
    }

    try {
      const res = await fetch(`${API}/market/${type}/candles?symbol=${symbol}&interval=${interval}`);
      const data = await res.json();
      
      if (Array.isArray(data)) {
        const formattedData = data.map(d => ({
          time: d.time, // assuming backend returns seconds
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })).sort((a, b) => a.time - b.time);

        candleSeries.setData(formattedData);
        chart.timeScale().fitContent();
        
        document.getElementById('symbolDisplay').textContent = symbol;
        loadLivePrice(symbol);
      }
    } catch (e) {
      console.error('Failed to load chart data', e);
    }
  }

  async function loadLivePrice(symbol) {
    try {
      const res = await fetch(`${API}/market/price/${symbol}`);
      const data = await res.json();
      if (data.price) {
        document.getElementById('priceDisplay').textContent = `Bid: ${(data.price * 0.9999).toFixed(5)} | Ask: ${(data.price * 1.0001).toFixed(5)}`;
      }
    } catch (e) {
      console.error('Failed to load live price', e);
    }
  }

  // Handle resizing
  window.addEventListener('resize', () => {
    chart.resize(chartContainer.clientWidth, chartContainer.clientHeight);
  });

  // Symbol buttons
  document.querySelectorAll('.symbol-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.symbol-btn').forEach(b => b.classList.replace('btn-blue', 'btn-outline-dark'));
      btn.classList.replace('btn-outline-dark', 'btn-blue');
      currentSymbol = btn.textContent;
      loadData(currentSymbol, currentInterval);
    });
  });

  // Interval buttons
  document.querySelectorAll('.interval-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('text-primary', 'font-bold'));
      btn.classList.add('text-primary', 'font-bold');
      currentInterval = btn.dataset.interval;
      loadData(currentSymbol, currentInterval);
    });
  });

  // Initial load
  loadData(currentSymbol, currentInterval);
  setInterval(() => loadLivePrice(currentSymbol), 5000);
});
