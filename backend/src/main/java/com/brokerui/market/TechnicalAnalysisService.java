package com.brokerui.market;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * RSI / MACD / SMA / Bollinger scoring for the analyzer page.
 * Same formulas and BUY/SELL/HOLD thresholds so the Analyzer page stays numerically familiar.
 */
@Service
public class TechnicalAnalysisService {

  public Map<String, Object> analyze(List<CandleBar> candles, String symbol) {
    String sym = symbol == null ? "Unknown" : symbol.trim().toUpperCase();
    if (candles == null || candles.size() < 50) {
      Map<String, Object> empty = new LinkedHashMap<>();
      empty.put("symbol", sym);
      empty.put("recommendation", "HOLD");
      empty.put("recommendationHe", "נייטרלי");
      empty.put("score", 0);
      empty.put("confidence", 50);
      empty.put("color", "#eab308");
      empty.put("price", 0);
      empty.put("indicators", Map.of("rsi", Map.of(), "macd", Map.of(), "sma", Map.of(), "bb", Map.of()));
      empty.put("explanationsEn", List.of());
      empty.put("explanationsHe", List.of());
      empty.put("summary", "Not enough historical candle data to perform technical analysis. Requires at least 50 periods.");
      empty.put("summaryHe", "אין מספיק נתוני נרות היסטוריים לביצוע אנליזה טכנית. נדרשים לפחות 50 נרות.");
      return empty;
    }

    double[] closes = new double[candles.size()];
    for (int i = 0; i < candles.size(); i++) {
      closes[i] = candles.get(i).close();
    }
    double currentPrice = closes[closes.length - 1];

    double[] rsiValues = calculateRsi(closes, 14);
    Macd macdData = calculateMacd(closes, 12, 26, 9);
    double[] sma20Values = calculateSma(closes, 20);
    double[] sma50Values = calculateSma(closes, 50);
    Bb[] bbValues = calculateBollinger(closes, 20, 2);

    double rsi = last(rsiValues, 50);
    double macdLine = 0, signal = 0, hist = 0, prevHist = 0;
    if (macdData != null && macdData.histogram.length > 0) {
      macdLine = last(macdData.macdLine, 0);
      signal = last(macdData.signalLine, 0);
      hist = last(macdData.histogram, 0);
      prevHist = macdData.histogram.length > 1 ? macdData.histogram[macdData.histogram.length - 2] : 0;
    }
    double sma20 = last(sma20Values, currentPrice);
    double sma50 = last(sma50Values, currentPrice);
    Bb bb = lastBb(bbValues, currentPrice);

    double score = 0;
    List<String> explanationsEn = new ArrayList<>();
    List<String> explanationsHe = new ArrayList<>();

    String rsiStatus = "NEUTRAL";
    String rsiStatusHe = "נייטרלי";
    if (rsi < 30) {
      score += 3;
      rsiStatus = "OVERSOLD (BULLISH)";
      rsiStatusHe = "מכירת יתר (חיובי)";
      explanationsEn.add("RSI is at " + fmt1(rsi) + " which is oversold. A price rebound is likely.");
      explanationsHe.add("מדד ה-RSI עומד על " + fmt1(rsi) + " (מכירת יתר). סבירות גבוהה לתיקון כלפי מעלה.");
    } else if (rsi < 45) {
      score += 1;
      rsiStatus = "MODERATELY OVERSOLD";
      rsiStatusHe = "נטייה למכירת יתר";
      explanationsEn.add("RSI is low at " + fmt1(rsi) + ", showing slight upward support.");
      explanationsHe.add("מדד ה-RSI נמוך (" + fmt1(rsi) + "), תומך בהזדמנות קנייה מתונה.");
    } else if (rsi > 70) {
      score -= 3;
      rsiStatus = "OVERBOUGHT (BEARISH)";
      rsiStatusHe = "קניית יתר (שלילי)";
      explanationsEn.add("RSI is at " + fmt1(rsi) + " which is overbought. Downward correction expected.");
      explanationsHe.add("מדד ה-RSI עומד על " + fmt1(rsi) + " (קניית יתר). סבירות גבוהה לתיקון מטה.");
    } else if (rsi > 55) {
      score -= 1;
      rsiStatus = "MODERATELY OVERBOUGHT";
      rsiStatusHe = "נטייה לקניית יתר";
      explanationsEn.add("RSI is elevated at " + fmt1(rsi) + ", showing slight exhaustion.");
      explanationsHe.add("מדד ה-RSI גבוה (" + fmt1(rsi) + "), מראה סימני תשישות לקונים.");
    } else {
      explanationsEn.add("RSI is neutral at " + fmt1(rsi) + ".");
      explanationsHe.add("מדד ה-RSI נייטרלי ועומד על " + fmt1(rsi) + ".");
    }

    String macdStatus = "NEUTRAL";
    String macdStatusHe = "נייטרלי";
    if (hist > 0) {
      macdStatus = "BULLISH";
      macdStatusHe = "שוריוני (עולה)";
      if (prevHist <= 0) {
        score += 3.5;
        explanationsEn.add("MACD line crossed above the signal line (Bullish Crossover). Strong buy signal.");
        explanationsHe.add("קו ה-MACD חצה מעל קו האות (הצטלבות שורית). איתות קנייה חזק.");
      } else if (hist > prevHist) {
        score += 1.5;
        explanationsEn.add("MACD histogram is positive and expanding, indicating strong upward momentum.");
        explanationsHe.add("היסטוגרמת ה-MACD חיובית ומתרחבת, מה שמצביע על מומנטום עלייה חזק.");
      } else {
        score += 0.5;
        explanationsEn.add("MACD histogram is positive but contracting, upward momentum is weakening.");
        explanationsHe.add("היסטוגרמת ה-MACD חיובית אך מתכווצת, מומנטום העלייה נחלש.");
      }
    } else if (hist < 0) {
      macdStatus = "BEARISH";
      macdStatusHe = "דובי (יורד)";
      if (prevHist >= 0) {
        score -= 3.5;
        explanationsEn.add("MACD line crossed below the signal line (Bearish Crossover). Strong sell signal.");
        explanationsHe.add("קו ה-MACD חצה מתחת לקו האות (הצטלבות דובית). איתות מכירה חזק.");
      } else if (hist < prevHist) {
        score -= 1.5;
        explanationsEn.add("MACD histogram is negative and expanding downward, indicating strong bearish momentum.");
        explanationsHe.add("היסטוגרמת ה-MACD שלילית ומתרחבת מטה, מה שמצביע על לחץ מכירות חזק.");
      } else {
        score -= 0.5;
        explanationsEn.add("MACD histogram is negative but contracting, selling pressure is slowing.");
        explanationsHe.add("היסטוגרמת ה-MACD שלילית אך מתכווצת, לחץ המכירות מתחיל להיחלש.");
      }
    }

    String maStatus = "NEUTRAL";
    String maStatusHe = "נייטרלי";
    if (currentPrice > sma20 && currentPrice > sma50) {
      score += 2;
      maStatus = "BULLISH";
      maStatusHe = "מגמת עלייה";
      explanationsEn.add("Price is trading above both SMA 20 (" + fmt2(sma20) + ") and SMA 50 (" + fmt2(sma50) + "), confirming an uptrend.");
      explanationsHe.add("המחיר נסחר מעל ממוצעים נעים 20 (" + fmt2(sma20) + ") ו-50 (" + fmt2(sma50) + "), דבר המאשר מגמת עלייה.");
    } else if (currentPrice < sma20 && currentPrice < sma50) {
      score -= 2;
      maStatus = "BEARISH";
      maStatusHe = "מגמת ירידה";
      explanationsEn.add("Price is trading below both SMA 20 (" + fmt2(sma20) + ") and SMA 50 (" + fmt2(sma50) + "), confirming a downtrend.");
      explanationsHe.add("המחיר נסחר מתחת לממוצעים נעים 20 (" + fmt2(sma20) + ") ו-50 (" + fmt2(sma50) + "), דבר המאשר מגמת ירידה.");
    } else {
      explanationsEn.add("Price is consolidating between the 20-period and 50-period moving averages.");
      explanationsHe.add("המחיר נמצא בהתכנסות (קונסולידציה) בין הממוצעים הנעים 20 ו-50.");
    }
    if (sma20 > sma50) {
      score += 1;
      explanationsEn.add("Short-term moving average (SMA 20) is above the medium-term average (SMA 50), supporting buyers.");
      explanationsHe.add("הממוצע הקצר (SMA 20) נמצא מעל הממוצע הבינוני (SMA 50), מה שתומך בקונים.");
    } else {
      score -= 1;
      explanationsEn.add("Short-term moving average (SMA 20) is below the medium-term average (SMA 50), supporting sellers.");
      explanationsHe.add("הממוצע הקצר (SMA 20) נמצא מתחת לממוצע הבינוני (SMA 50), מה שתומך במוכרים.");
    }

    double bbWidth = bb.upper - bb.lower;
    double bbPct = bbWidth > 0 ? (currentPrice - bb.lower) / bbWidth : 0.5;
    String bbStatus = "MIDDLE";
    String bbStatusHe = "מרכז הרצועה";
    if (bbPct < 0.15) {
      score += 1.5;
      bbStatus = "OVERSOLD (LOWER BAND)";
      bbStatusHe = "רצועה תחתונה (תמיכה)";
      explanationsEn.add("Price is near the lower Bollinger Band, indicating it is cheap relative to historical deviation.");
      explanationsHe.add("המחיר קרוב לרצועת בולינגר התחתונה, מה שמסמן רמת תמיכה קרובה (המחיר נמוך יחסית).");
    } else if (bbPct > 0.85) {
      score -= 1.5;
      bbStatus = "OVERBOUGHT (UPPER BAND)";
      bbStatusHe = "רצועה עליונה (התנגדות)";
      explanationsEn.add("Price is near the upper Bollinger Band, showing resistance and high price saturation.");
      explanationsHe.add("המחיר קרוב לרצועת בולינגר העליונה, מה שמסמן רמת התנגדות קרובה (המחיר רווי יחסית).");
    } else {
      explanationsEn.add("Price is trading within the middle range of the Bollinger Bands.");
      explanationsHe.add("המחיר נסחר בטווח המרכזי של רצועות בולינגר.");
    }

    String recommendation = "HOLD";
    String recommendationHe = "נייטרלי / המתן";
    String recColor = "#eab308";
    if (score >= 5.5) {
      recommendation = "STRONG BUY";
      recommendationHe = "קנייה חזקה";
      recColor = "#22c55e";
    } else if (score >= 2.0) {
      recommendation = "BUY";
      recommendationHe = "קנייה";
      recColor = "#4ade80";
    } else if (score <= -5.5) {
      recommendation = "STRONG SELL";
      recommendationHe = "מכירה חזקה";
      recColor = "#ef4444";
    } else if (score <= -2.0) {
      recommendation = "SELL";
      recommendationHe = "מכירה";
      recColor = "#f87171";
    }

    int confidence = (int) Math.min(100, Math.max(30, Math.round(50 + (Math.abs(score) / 10.0) * 50)));
    String convEn = score >= 2 ? "positive indicator convergence" : score <= -2 ? "negative indicator convergence" : "consolidating indicators";
    String convHe = score >= 2 ? "התכנסות אינדיקטורים חיובית" : score <= -2 ? "התכנסות אינדיקטורים שלילית" : "אינדיקטורים מאוזנים ודשדוש";
    String summaryEn = "The bot recommends a " + recommendation + " action for " + sym + " with a confidence score of " + confidence
        + "%. This is based on " + convEn + ". RSI stands at " + fmt1(rsi) + " (" + rsiStatus + "), MACD is currently "
        + macdStatus + ", and price is in a " + maStatus + " layout relative to the moving averages.";
    String summaryHe = "הבוט ממליץ על פעולת " + recommendationHe + " עבור " + sym + " ברמת ביטחון של " + confidence
        + "%. המלצה זו מבוססת על " + convHe + ". מדד ה-RSI עומד על " + fmt1(rsi) + " (" + rsiStatusHe + "), ה-MACD מראה מומנטום "
        + macdStatusHe + ", והמחיר נמצא ב" + maStatusHe + " ביחס לממוצעים הנעים.";

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("symbol", sym);
    out.put("recommendation", recommendation);
    out.put("recommendationHe", recommendationHe);
    out.put("score", score);
    out.put("confidence", confidence);
    out.put("color", recColor);
    out.put("price", currentPrice);
    out.put("indicators", Map.of(
        "rsi", Map.of("value", rsi, "status", rsiStatus, "statusHe", rsiStatusHe),
        "macd", Map.of("macdLine", macdLine, "signalLine", signal, "hist", hist, "status", macdStatus, "statusHe", macdStatusHe),
        "sma", Map.of("sma20", sma20, "sma50", sma50, "status", maStatus, "statusHe", maStatusHe),
        "bb", Map.of("upper", bb.upper, "middle", bb.middle, "lower", bb.lower, "status", bbStatus, "statusHe", bbStatusHe)));
    out.put("explanationsEn", explanationsEn);
    out.put("explanationsHe", explanationsHe);
    out.put("summary", summaryEn);
    out.put("summaryHe", summaryHe);
    return out;
  }

  public Map<String, Object> overviewRow(Map<String, Object> full, String category) {
    @SuppressWarnings("unchecked")
    Map<String, Object> ind = (Map<String, Object>) full.get("indicators");
    @SuppressWarnings("unchecked")
    Map<String, Object> rsi = ind == null ? Map.of() : (Map<String, Object>) ind.getOrDefault("rsi", Map.of());
    @SuppressWarnings("unchecked")
    Map<String, Object> macd = ind == null ? Map.of() : (Map<String, Object>) ind.getOrDefault("macd", Map.of());
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("symbol", full.get("symbol"));
    row.put("category", category);
    row.put("price", full.get("price"));
    row.put("recommendation", full.get("recommendation"));
    row.put("recommendationHe", full.get("recommendationHe"));
    row.put("confidence", full.get("confidence"));
    row.put("color", full.get("color"));
    row.put("rsi", rsi.getOrDefault("value", 50));
    row.put("macdStatus", macd.getOrDefault("status", "NEUTRAL"));
    row.put("macdStatusHe", macd.getOrDefault("statusHe", "נייטרלי"));
    return row;
  }

  static double[] calculateSma(double[] data, int period) {
    if (data.length < period) return new double[0];
    double[] sma = new double[data.length - period + 1];
    for (int i = period - 1; i < data.length; i++) {
      double sum = 0;
      for (int j = 0; j < period; j++) sum += data[i - j];
      sma[i - period + 1] = sum / period;
    }
    return sma;
  }

  static double[] calculateEma(double[] data, int period) {
    if (data.length < period) return new double[0];
    double[] ema = new double[data.length - period + 1];
    double sum = 0;
    for (int i = 0; i < period; i++) sum += data[i];
    double current = sum / period;
    ema[0] = current;
    double k = 2.0 / (period + 1);
    int idx = 1;
    for (int i = period; i < data.length; i++) {
      current = data[i] * k + current * (1 - k);
      ema[idx++] = current;
    }
    return ema;
  }

  static double[] calculateRsi(double[] data, int period) {
    if (data.length < period + 1) return new double[0];
    List<Double> rsi = new ArrayList<>();
    double gains = 0;
    double losses = 0;
    for (int i = 1; i <= period; i++) {
      double diff = data[i] - data[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    double avgGain = gains / period;
    double avgLoss = losses / period;
    rsi.add(avgLoss == 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    for (int i = period + 1; i < data.length; i++) {
      double diff = data[i] - data[i - 1];
      double gain = diff > 0 ? diff : 0;
      double loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi.add(avgLoss == 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }
    return rsi.stream().mapToDouble(Double::doubleValue).toArray();
  }

  static Macd calculateMacd(double[] data, int fast, int slow, int signalPeriod) {
    double[] ema12 = calculateEma(data, fast);
    double[] ema26 = calculateEma(data, slow);
    if (ema12.length == 0 || ema26.length == 0) return null;
    int offset = fast - slow;
    double[] macdLine = new double[ema26.length];
    for (int i = 0; i < ema26.length; i++) {
      macdLine[i] = ema12[i - offset] - ema26[i];
    }
    double[] signalLine = calculateEma(macdLine, signalPeriod);
    if (signalLine.length == 0) return null;
    int signalOffset = macdLine.length - signalLine.length;
    double[] histogram = new double[signalLine.length];
    double[] alignedMacd = new double[signalLine.length];
    for (int i = 0; i < signalLine.length; i++) {
      alignedMacd[i] = macdLine[i + signalOffset];
      histogram[i] = alignedMacd[i] - signalLine[i];
    }
    return new Macd(alignedMacd, signalLine, histogram);
  }

  static Bb[] calculateBollinger(double[] data, int period, double multiplier) {
    if (data.length < period) return new Bb[0];
    Bb[] bands = new Bb[data.length - period + 1];
    for (int i = period - 1; i < data.length; i++) {
      double sum = 0;
      for (int j = 0; j < period; j++) sum += data[i - j];
      double mean = sum / period;
      double variance = 0;
      for (int j = 0; j < period; j++) variance += Math.pow(data[i - j] - mean, 2);
      double std = Math.sqrt(variance / period);
      bands[i - period + 1] = new Bb(mean + multiplier * std, mean, mean - multiplier * std);
    }
    return bands;
  }

  static List<CandleBar> syntheticCandles(String symbol) {
    String s = symbol == null ? "EURUSD" : symbol.trim().toUpperCase();
    double base = 1.17;
    if (s.startsWith("BTC")) base = 98000;
    else if (s.startsWith("ETH")) base = 2800;
    else if (s.startsWith("SOL")) base = 165;
    else if (s.startsWith("XRP")) base = 1.85;
    else if (s.startsWith("XAU")) base = 2380;
    else if (s.startsWith("XAG")) base = 30.5;
    else if (s.startsWith("USDJPY")) base = 158.5;
    else if (s.startsWith("GBPJPY")) base = 199.2;
    else if (s.startsWith("USDCAD")) base = 1.36;
    else if (s.startsWith("NZDUSD")) base = 0.61;
    long seed = 7;
    for (int i = 0; i < s.length(); i++) seed = seed * 31 + s.charAt(i);
    List<CandleBar> candles = new ArrayList<>();
    double price = base;
    long nowMs = System.currentTimeMillis();
    for (int i = 0; i < 100; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      double rnd = seed / 233280.0;
      double open = price + (rnd - 0.5) * (base * 0.008);
      seed = (seed * 9301 + 49297) % 233280;
      double rnd2 = seed / 233280.0;
      double close = open + (rnd2 - 0.49) * (base * 0.008);
      double high = Math.max(open, close) + 0.001 * base;
      double low = Math.min(open, close) - 0.001 * base;
      long t = (nowMs - (100L - i) * 3_600_000L) / 1000L;
      candles.add(new CandleBar(t, open, high, low, close));
      price = close;
    }
    return candles;
  }

  private static double last(double[] arr, double fallback) {
    return arr == null || arr.length == 0 ? fallback : arr[arr.length - 1];
  }

  private static Bb lastBb(Bb[] arr, double price) {
    return arr == null || arr.length == 0 ? new Bb(price, price, price) : arr[arr.length - 1];
  }

  private static String fmt1(double v) {
    return String.format(java.util.Locale.US, "%.1f", v);
  }

  private static String fmt2(double v) {
    return String.format(java.util.Locale.US, "%.2f", v);
  }

  record Macd(double[] macdLine, double[] signalLine, double[] histogram) {}

  record Bb(double upper, double middle, double lower) {}
}
