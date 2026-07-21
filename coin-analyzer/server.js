const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { analyzeMarket } = require('./analyzer.js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3008;

// All supported symbols
const SUPPORTED_ASSETS = [
    { id: 'BTCUSD', category: 'crypto' },
    { id: 'ETHUSD', category: 'crypto' },
    { id: 'SOLUSD', category: 'crypto' },
    { id: 'XRPUSD', category: 'crypto' },
    { id: 'EURUSD', category: 'forex' },
    { id: 'GBPUSD', category: 'forex' },
    { id: 'USDJPY', category: 'forex' },
    { id: 'GBPJPY', category: 'forex' },
    { id: 'USDCAD', category: 'forex' },
    { id: 'NZDUSD', category: 'forex' },
    { id: 'XAUUSD', category: 'metals' },
    { id: 'XAGUSD', category: 'metals' }
];

// Helper to generate synthetic candles in case backend is offline
function generateSyntheticCandles(symbol) {
    const nowMs = Date.now();
    const candles = [];
    
    let basePrice = 1.17;
    if (symbol.startsWith("BTC")) basePrice = 98000;
    else if (symbol.startsWith("ETH")) basePrice = 2800;
    else if (symbol.startsWith("SOL")) basePrice = 165;
    else if (symbol.startsWith("XRP")) basePrice = 1.85;
    else if (symbol.startsWith("XAU")) basePrice = 2380;
    else if (symbol.startsWith("XAG")) basePrice = 30.5;
    else if (symbol.startsWith("USDJPY")) basePrice = 158.5;
    else if (symbol.startsWith("GBPJPY")) basePrice = 199.2;
    else if (symbol.startsWith("USDCAD")) basePrice = 1.36;
    else if (symbol.startsWith("NZDUSD")) basePrice = 0.61;
    
    // Seed random generator based on symbol name to make trends stable
    let seed = 7;
    for (let i = 0; i < symbol.length; i++) seed = seed * 31 + symbol.charCodeAt(i);
    
    let price = basePrice;
    for (let i = 0; i < 100; i++) {
        // Pseudo-random walk
        seed = (seed * 9301 + 49297) % 233280;
        const rnd = seed / 233280.0;
        
        const open = price + (rnd - 0.5) * (basePrice * 0.008);
        
        // Next rnd
        const rnd2 = ((seed * 9301 + 49297) % 233280) / 233280.0;
        const close = open + (rnd2 - 0.49) * (basePrice * 0.008); // Slight positive bias for fun
        
        const high = Math.max(open, close) + Math.random() * (basePrice * 0.003);
        const low = Math.min(open, close) - Math.random() * (basePrice * 0.003);
        
        candles.push({
            openTime: Math.floor((nowMs - (100 - i) * 3600000) / 1000),
            open,
            high,
            low,
            close
        });
        price = close;
    }
    return candles;
}

// Endpoint to fetch single coin analysis
app.get('/api/analysis', async (req, res) => {
    const { symbol = 'BTCUSD', category = 'crypto', interval = '1h' } = req.query;
    const cleanSymbol = symbol.trim().toUpperCase();
    
    try {
        // Query Spring Boot backend for candles
        const backendUrl = `http://127.0.0.1:8080/api/market/${category}/candles`;
        const response = await axios.get(backendUrl, {
            params: { symbol: cleanSymbol, interval },
            timeout: 3000
        });
        
        let candles = response.data;
        if (!Array.isArray(candles) || candles.length === 0) {
            console.log(`[Analyzer] Backend returned empty candles for ${cleanSymbol}, generating mock data...`);
            candles = generateSyntheticCandles(cleanSymbol);
        }
        
        const analysis = analyzeMarket(candles, cleanSymbol);
        res.json(analysis);
    } catch (e) {
        console.log(`[Analyzer] Backend unreachable or failed to fetch candles for ${cleanSymbol}: ${e.message}. Using synthetic fallback...`);
        const candles = generateSyntheticCandles(cleanSymbol);
        const analysis = analyzeMarket(candles, cleanSymbol);
        res.json(analysis);
    }
});

// Endpoint to get overall recommendation board for all supported symbols
app.get('/api/analysis/all', async (req, res) => {
    const results = [];
    
    for (const asset of SUPPORTED_ASSETS) {
        try {
            const backendUrl = `http://127.0.0.1:8080/api/market/${asset.category}/candles`;
            const response = await axios.get(backendUrl, {
                params: { symbol: asset.id, interval: '1h' },
                timeout: 1000
            });
            
            let candles = response.data;
            if (!Array.isArray(candles) || candles.length === 0) {
                candles = generateSyntheticCandles(asset.id);
            }
            
            const analysis = analyzeMarket(candles, asset.id);
            results.push({
                symbol: asset.id,
                category: asset.category,
                price: analysis.price,
                recommendation: analysis.recommendation,
                recommendationHe: analysis.recommendationHe,
                confidence: analysis.confidence,
                color: analysis.color,
                rsi: analysis.indicators.rsi?.value || 50,
                macdStatus: analysis.indicators.macd?.status || 'NEUTRAL',
                macdStatusHe: analysis.indicators.macd?.statusHe || 'נייטרלי'
            });
        } catch (e) {
            const candles = generateSyntheticCandles(asset.id);
            const analysis = analyzeMarket(candles, asset.id);
            results.push({
                symbol: asset.id,
                category: asset.category,
                price: analysis.price,
                recommendation: analysis.recommendation,
                recommendationHe: analysis.recommendationHe,
                confidence: analysis.confidence,
                color: analysis.color,
                rsi: analysis.indicators.rsi?.value || 50,
                macdStatus: analysis.indicators.macd?.status || 'NEUTRAL',
                macdStatusHe: analysis.indicators.macd?.statusHe || 'נייטרלי'
            });
        }
    }
    
    res.json(results);
});

app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`📈 COIN ANALYZER & BOT SERVER RUNNING`);
    console.log(`➡️  Listening on http://localhost:${PORT}`);
    console.log(`==============================================\n`);
});
