/**
 * Coin Technical Analysis Engine
 * Calculates indicators (RSI, MACD, Moving Averages, Bollinger Bands) 
 * and determines optimal buy/sell recommendations.
 */

// Simple Moving Average
function calculateSMA(data, period) {
    if (data.length < period) return null;
    const sma = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j];
        }
        sma.push(sum / period);
    }
    return sma; // Indexes align with data from index (period - 1) onwards
}

// Exponential Moving Average
function calculateEMA(data, period) {
    if (data.length < period) return null;
    const ema = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    let currentEma = sum / period;
    ema.push(currentEma);

    const k = 2 / (period + 1);
    for (let i = period; i < data.length; i++) {
        currentEma = data[i] * k + currentEma * (1 - k);
        ema.push(currentEma);
    }
    return ema; // Indexes align with data from index (period - 1) onwards
}

// Relative Strength Index (RSI)
function calculateRSI(data, period = 14) {
    if (data.length < period + 1) return null;
    const rsi = [];
    
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let currentRsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    rsi.push(currentRsi);

    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        let gain = diff > 0 ? diff : 0;
        let loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        currentRsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        rsi.push(currentRsi);
    }
    return rsi; // Align with data index (period) onwards
}

// Moving Average Convergence Divergence (MACD)
function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const ema12 = calculateEMA(data, fastPeriod);
    const ema26 = calculateEMA(data, slowPeriod);
    if (!ema12 || !ema26) return null;

    const offset = fastPeriod - slowPeriod; // -14
    const macdLine = [];
    for (let i = 0; i < ema26.length; i++) {
        macdLine.push(ema12[i - offset] - ema26[i]);
    }

    const signalLine = calculateEMA(macdLine, signalPeriod);
    if (!signalLine) return null;

    const histogram = [];
    const signalOffset = macdLine.length - signalLine.length;
    for (let i = 0; i < signalLine.length; i++) {
        histogram.push(macdLine[i + signalOffset] - signalLine[i]);
    }

    return {
        macdLine: macdLine.slice(signalOffset),
        signalLine,
        histogram
    };
}

// Bollinger Bands
function calculateBollingerBands(data, period = 20, multiplier = 2) {
    if (data.length < period) return null;
    const bands = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[i - j];
        const mean = sum / period;

        let variance = 0;
        for (let j = 0; j < period; j++) {
            variance += Math.pow(data[i - j] - mean, 2);
        }
        const stdDev = Math.sqrt(variance / period);
        bands.push({
            upper: mean + multiplier * stdDev,
            middle: mean,
            lower: mean - multiplier * stdDev
        });
    }
    return bands; // Aligns with data from index (period - 1) onwards
}

// Primary analysis generator combining all indicators
function analyzeMarket(candles, symbol = "Unknown") {
    if (!Array.isArray(candles) || candles.length < 50) {
        return {
            symbol,
            recommendation: "HOLD",
            score: 0,
            confidence: 50,
            price: 0,
            indicators: { rsi: null, macd: null, sma: {}, bb: null },
            summary: "Not enough historical candle data to perform technical analysis. Requires at least 50 periods.",
            summaryHe: "אין מספיק נתוני נרות היסטוריים לביצוע אנליזה טכנית. נדרשים לפחות 50 נרות."
        };
    }

    const closes = candles.map(c => Number(c.close || c[4]));
    const currentPrice = closes[closes.length - 1];

    // Calculate Indicators
    const rsiValues = calculateRSI(closes, 14);
    const macdData = calculateMACD(closes, 12, 26, 9);
    const sma20Values = calculateSMA(closes, 20);
    const sma50Values = calculateSMA(closes, 50);
    const bbValues = calculateBollingerBands(closes, 20, 2);

    // Latest Indicator Values
    const rsi = rsiValues ? rsiValues[rsiValues.length - 1] : 50;
    const macd = macdData ? {
        line: macdData.macdLine[macdData.macdLine.length - 1],
        signal: macdData.signalLine[macdData.signalLine.length - 1],
        hist: macdData.histogram[macdData.histogram.length - 1],
        prevHist: macdData.histogram[macdData.histogram.length - 2]
    } : { line: 0, signal: 0, hist: 0, prevHist: 0 };

    const sma20 = sma20Values ? sma20Values[sma20Values.length - 1] : currentPrice;
    const sma50 = sma50Values ? sma50Values[sma50Values.length - 1] : currentPrice;
    
    const bb = bbValues ? bbValues[bbValues.length - 1] : { upper: currentPrice, middle: currentPrice, lower: currentPrice };

    // Scoring Engine
    let score = 0;
    const explanationsEn = [];
    const explanationsHe = [];

    // 1. RSI Scoring
    let rsiStatus = "NEUTRAL";
    let rsiStatusHe = "נייטרלי";
    if (rsi < 30) {
        score += 3;
        rsiStatus = "OVERSOLD (BULLISH)";
        rsiStatusHe = "מכירת יתר (חיובי)";
        explanationsEn.push(`RSI is at ${rsi.toFixed(1)} which is oversold. A price rebound is likely.`);
        explanationsHe.push(`מדד ה-RSI עומד על ${rsi.toFixed(1)} (מכירת יתר). סבירות גבוהה לתיקון כלפי מעלה.`);
    } else if (rsi < 45) {
        score += 1;
        rsiStatus = "MODERATELY OVERSOLD";
        rsiStatusHe = "נטייה למכירת יתר";
        explanationsEn.push(`RSI is low at ${rsi.toFixed(1)}, showing slight upward support.`);
        explanationsHe.push(`מדד ה-RSI נמוך (${rsi.toFixed(1)}), תומך בהזדמנות קנייה מתונה.`);
    } else if (rsi > 70) {
        score -= 3;
        rsiStatus = "OVERBOUGHT (BEARISH)";
        rsiStatusHe = "קניית יתר (שלילי)";
        explanationsEn.push(`RSI is at ${rsi.toFixed(1)} which is overbought. Downward correction expected.`);
        explanationsHe.push(`מדד ה-RSI עומד על ${rsi.toFixed(1)} (קניית יתר). סבירות גבוהה לתיקון מטה.`);
    } else if (rsi > 55) {
        score -= 1;
        rsiStatus = "MODERATELY OVERBOUGHT";
        rsiStatusHe = "נטייה לקניית יתר";
        explanationsEn.push(`RSI is elevated at ${rsi.toFixed(1)}, showing slight exhaustion.`);
        explanationsHe.push(`מדד ה-RSI גבוה (${rsi.toFixed(1)}), מראה סימני תשישות לקונים.`);
    } else {
        explanationsEn.push(`RSI is neutral at ${rsi.toFixed(1)}.`);
        explanationsHe.push(`מדד ה-RSI נייטרלי ועומד על ${rsi.toFixed(1)}.`);
    }

    // 2. MACD Scoring
    let macdStatus = "NEUTRAL";
    let macdStatusHe = "נייטרלי";
    if (macd.hist > 0) {
        macdStatus = "BULLISH";
        macdStatusHe = "שוריוני (עולה)";
        if (macd.prevHist <= 0) {
            score += 3.5; // Strong crossover buy
            explanationsEn.push("MACD line crossed above the signal line (Bullish Crossover). Strong buy signal.");
            explanationsHe.push("קו ה-MACD חצה מעל קו האות (הצטלבות שורית). איתות קנייה חזק.");
        } else if (macd.hist > macd.prevHist) {
            score += 1.5;
            explanationsEn.push("MACD histogram is positive and expanding, indicating strong upward momentum.");
            explanationsHe.push("היסטוגרמת ה-MACD חיובית ומתרחבת, מה שמצביע על מומנטום עלייה חזק.");
        } else {
            score += 0.5;
            explanationsEn.push("MACD histogram is positive but contracting, upward momentum is weakening.");
            explanationsHe.push("היסטוגרמת ה-MACD חיובית אך מתכווצת, מומנטום העלייה נחלש.");
        }
    } else if (macd.hist < 0) {
        macdStatus = "BEARISH";
        macdStatusHe = "דובי (יורד)";
        if (macd.prevHist >= 0) {
            score -= 3.5; // Strong crossover sell
            explanationsEn.push("MACD line crossed below the signal line (Bearish Crossover). Strong sell signal.");
            explanationsHe.push("קו ה-MACD חצה מתחת לקו האות (הצטלבות דובית). איתות מכירה חזק.");
        } else if (macd.hist < macd.prevHist) {
            score -= 1.5;
            explanationsEn.push("MACD histogram is negative and expanding downward, indicating strong bearish momentum.");
            explanationsHe.push("היסטוגרמת ה-MACD שלילית ומתרחבת מטה, מה שמצביע על לחץ מכירות חזק.");
        } else {
            score -= 0.5;
            explanationsEn.push("MACD histogram is negative but contracting, selling pressure is slowing.");
            explanationsHe.push("היסטוגרמת ה-MACD שלילית אך מתכווצת, לחץ המכירות מתחיל להיחלש.");
        }
    }

    // 3. Moving Averages Scoring
    let maStatus = "NEUTRAL";
    let maStatusHe = "נייטרלי";
    
    if (currentPrice > sma20 && currentPrice > sma50) {
        score += 2;
        maStatus = "BULLISH";
        maStatusHe = "מגמת עלייה";
        explanationsEn.push(`Price is trading above both SMA 20 (${sma20.toFixed(2)}) and SMA 50 (${sma50.toFixed(2)}), confirming an uptrend.`);
        explanationsHe.push(`המחיר נסחר מעל ממוצעים נעים 20 (${sma20.toFixed(2)}) ו-50 (${sma50.toFixed(2)}), דבר המאשר מגמת עלייה.`);
    } else if (currentPrice < sma20 && currentPrice < sma50) {
        score -= 2;
        maStatus = "BEARISH";
        maStatusHe = "מגמת ירידה";
        explanationsEn.push(`Price is trading below both SMA 20 (${sma20.toFixed(2)}) and SMA 50 (${sma50.toFixed(2)}), confirming a downtrend.`);
        explanationsHe.push(`המחיר נסחר מתחת לממוצעים נעים 20 (${sma20.toFixed(2)}) ו-50 (${sma50.toFixed(2)}), דבר המאשר מגמת ירידה.`);
    } else {
        explanationsEn.push("Price is consolidating between the 20-period and 50-period moving averages.");
        explanationsHe.push("המחיר נמצא בהתכנסות (קונסולידציה) בין הממוצעים הנעים 20 ו-50.");
    }
    
    if (sma20 > sma50) {
        score += 1;
        explanationsEn.push("Short-term moving average (SMA 20) is above the medium-term average (SMA 50), supporting buyers.");
        explanationsHe.push("הממוצע הקצר (SMA 20) נמצא מעל הממוצע הבינוני (SMA 50), מה שתומך בקונים.");
    } else {
        score -= 1;
        explanationsEn.push("Short-term moving average (SMA 20) is below the medium-term average (SMA 50), supporting sellers.");
        explanationsHe.push("הממוצע הקצר (SMA 20) נמצא מתחת לממוצע הבינוני (SMA 50), מה שתומך במוכרים.");
    }

    // 4. Bollinger Bands Scoring
    const bbWidth = bb.upper - bb.lower;
    const bbPct = bbWidth > 0 ? (currentPrice - bb.lower) / bbWidth : 0.5;
    
    let bbStatus = "MIDDLE";
    let bbStatusHe = "מרכז הרצועה";
    if (bbPct < 0.15) {
        score += 1.5;
        bbStatus = "OVERSOLD (LOWER BAND)";
        bbStatusHe = "רצועה תחתונה (תמיכה)";
        explanationsEn.push("Price is near the lower Bollinger Band, indicating it is cheap relative to historical deviation.");
        explanationsHe.push("המחיר קרוב לרצועת בולינגר התחתונה, מה שמסמן רמת תמיכה קרובה (המחיר נמוך יחסית).");
    } else if (bbPct > 0.85) {
        score -= 1.5;
        bbStatus = "OVERBOUGHT (UPPER BAND)";
        bbStatusHe = "רצועה עליונה (התנגדות)";
        explanationsEn.push("Price is near the upper Bollinger Band, showing resistance and high price saturation.");
        explanationsHe.push("המחיר קרוב לרצועת בולינגר העליונה, מה שמסמן רמת התנגדות קרובה (המחיר רווי יחסית).");
    } else {
        explanationsEn.push("Price is trading within the middle range of the Bollinger Bands.");
        explanationsHe.push("המחיר נסחר בטווח המרכזי של רצועות בולינגר.");
    }

    // Final Recommendation Formulation
    let recommendation = "HOLD";
    let recommendationHe = "נייטרלי";
    let recColor = "var(--text-secondary)";
    
    if (score >= 5.5) {
        recommendation = "STRONG BUY";
        recommendationHe = "קנייה חזקה";
        recColor = "#22c55e"; // green
    } else if (score >= 2.0) {
        recommendation = "BUY";
        recommendationHe = "קנייה";
        recColor = "#4ade80"; // light green
    } else if (score <= -5.5) {
        recommendation = "STRONG SELL";
        recommendationHe = "מכירה חזקה";
        recColor = "#ef4444"; // red
    } else if (score <= -2.0) {
        recommendation = "SELL";
        recommendationHe = "מכירה";
        recColor = "#f87171"; // light red
    } else {
        recommendation = "HOLD";
        recommendationHe = "נייטרלי / המתן";
        recColor = "#eab308"; // yellow
    }

    const confidence = Math.min(100, Math.max(30, Math.round(50 + (Math.abs(score) / 10) * 50)));

    // Generate summaries
    const summaryEn = `The bot recommends a ${recommendation} action for ${symbol} with a confidence score of ${confidence}%. This is based on ${score >= 2 ? "positive indicator convergence" : score <= -2 ? "negative indicator convergence" : "consolidating indicators"}. RSI stands at ${rsi.toFixed(1)} (${rsiStatus}), MACD is currently ${macdStatus}, and price is in a ${maStatus} layout relative to the moving averages.`;
    const summaryHe = `הבוט ממליץ על פעולת ${recommendationHe} עבור ${symbol} ברמת ביטחון של ${confidence}%. המלצה זו מבוססת על ${score >= 2 ? "התכנסות אינדיקטורים חיובית" : score <= -2 ? "התכנסות אינדיקטורים שלילית" : "אינדיקטורים מאוזנים ודשדוש"}. מדד ה-RSI עומד על ${rsi.toFixed(1)} (${rsiStatusHe}), ה-MACD מראה מומנטום ${macdStatusHe}, והמחיר נמצא ב${maStatusHe} ביחס לממוצעים הנעים.`;

    return {
        symbol,
        recommendation,
        recommendationHe,
        score,
        confidence,
        color: recColor,
        price: currentPrice,
        indicators: {
            rsi: {
                value: rsi,
                status: rsiStatus,
                statusHe: rsiStatusHe
            },
            macd: {
                macdLine: macd.line,
                signalLine: macd.signal,
                hist: macd.hist,
                status: macdStatus,
                statusHe: macdStatusHe
            },
            sma: {
                sma20,
                sma50,
                status: maStatus,
                statusHe: maStatusHe
            },
            bb: {
                upper: bb.upper,
                middle: bb.middle,
                lower: bb.lower,
                status: bbStatus,
                statusHe: bbStatusHe
            }
        },
        explanationsEn,
        explanationsHe,
        summary: summaryEn,
        summaryHe: summaryHe
    };
}

module.exports = {
    analyzeMarket,
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands
};
