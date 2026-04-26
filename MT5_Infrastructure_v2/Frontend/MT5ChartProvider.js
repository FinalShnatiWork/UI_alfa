/**
 * MT5 Chart Provider
 * This module allows fetching candle data from the MT5 Bridge API
 * and integrating it with Lightweight Charts.
 */

const API_BASE = '/api/mt5-bridge';

export async function fetchMT5Candles(symbol, interval, count = 500) {
    // Map interval to MT5 format
    const tfMap = {
        '1m': '1Min',
        '5m': '5Min',
        '1h': '1Hour',
        '4h': '4Hour',
        '1d': '1Day'
    };
    
    const mt5Tf = tfMap[interval] || '1Hour';
    const url = `${API_BASE}/candles?symbol=${symbol}&timeframe=${mt5Tf}&count=${count}`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch data from MT5 Bridge');
    }
    
    const data = await response.json();
    // Lightweight charts expects time in seconds
    return data.map(c => ({
        ...c,
        time: Math.floor(c.timestamp / 1000)
    })).sort((a, b) => a.time - b.time);
}

export async function checkSymbolAvailability(symbol) {
    const response = await fetch(`${API_BASE}/check-symbol?symbol=${symbol}`);
    const data = await response.json();
    return data.available_in_mt5;
}

export async function sendMT5Trade(tradeData) {
    // tradeData: { symbol, action, lot, tp, sl }
    const response = await fetch(`${API_BASE}/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeData)
    });
    return await response.json();
}
