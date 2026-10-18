package com.brokerui.market;

import com.brokerui.broker.ContractSpecs;
import com.brokerui.broker.TradingFees;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Technical summary for the analyzer page.
 * Each standard indicator casts one vote (Buy, Neutral, or Sell). The headline is the count of those votes.
 */
@Service
public class TechnicalAnalysisService {

  public Map<String, Object> analyze(List<CandleBar> candles, String symbol) {
    return analyze(candles, symbol, "1h");
  }

  public Map<String, Object> analyze(List<CandleBar> candles, String symbol, String interval) {
    String sym = symbol == null ? "Unknown" : symbol.trim().toUpperCase();
    if (candles == null || candles.size() < 50) {
      Map<String, Object> empty = new LinkedHashMap<>();
      empty.put("symbol", sym);
      empty.put("recommendation", "HOLD");
      empty.put("recommendationHe", "נייטרלי");
      empty.put("recommendationRu", "нейтрально");
      empty.put("score", 0);
      empty.put("confidence", 50);
      empty.put("color", "#eab308");
      empty.put("price", 0);
      empty.put("indicators", Map.of("rsi", Map.of(), "macd", Map.of(), "sma", Map.of(), "bb", Map.of()));
      empty.put("explanationsEn", List.of());
      empty.put("explanationsHe", List.of());
      empty.put("explanationsRu", List.of());
      empty.put("summary", "Not enough historical candle data to perform technical analysis. Requires at least 50 periods.");
      empty.put("summaryHe", "אין מספיק נתוני נרות היסטוריים לביצוע אנליזה טכנית. נדרשים לפחות 50 נרות.");
      empty.put("summaryRu", "Недостаточно исторических свечей для технического анализа. Нужно минимум 50 свечей.");
      empty.put("available", false);
      empty.put("votes", Map.of("buy", 0, "neutral", 0, "sell", 0));
      empty.put("signals", List.of());
      return empty;
    }

    double[] closes = new double[candles.size()];
    double[] highs = new double[candles.size()];
    double[] lows = new double[candles.size()];
    for (int i = 0; i < candles.size(); i++) {
      closes[i] = candles.get(i).close();
      highs[i] = candles.get(i).high();
      lows[i] = candles.get(i).low();
    }
    double currentPrice = closes[closes.length - 1];

    double[] rsiValues = calculateRsi(closes, 14);
    Macd macdData = calculateMacd(closes, 12, 26, 9);
    double[] sma20Values = calculateSma(closes, 20);
    double[] sma50Values = calculateSma(closes, 50);
    Bb[] bbValues = calculateBollinger(closes, 20, 2);

    double rsi = last(rsiValues, 50);
    double macdLine = 0, signal = 0, hist = 0;
    if (macdData != null && macdData.histogram.length > 0) {
      macdLine = last(macdData.macdLine, 0);
      signal = last(macdData.signalLine, 0);
      hist = last(macdData.histogram, 0);
    }
    double sma20 = last(sma20Values, currentPrice);
    double sma50 = last(sma50Values, currentPrice);
    Bb bb = lastBb(bbValues, currentPrice);

    List<String> explanationsEn = new ArrayList<>();
    List<String> explanationsHe = new ArrayList<>();
    List<String> explanationsRu = new ArrayList<>();

    String rsiStatus = "NEUTRAL";
    String rsiStatusHe = "נייטרלי";
    String rsiStatusRu = "нейтрально";
    if (rsi < 30) {
      rsiStatus = "OVERSOLD (BULLISH)";
      rsiStatusHe = "מכירת יתר (חיובי)";
      rsiStatusRu = "перепроданность (бычий)";
    } else if (rsi > 70) {
      rsiStatus = "OVERBOUGHT (BEARISH)";
      rsiStatusHe = "קניית יתר (שלילי)";
      rsiStatusRu = "перекупленность (медвежий)";
    }

    String macdStatus = "NEUTRAL";
    String macdStatusHe = "נייטרלי";
    String macdStatusRu = "нейтрально";
    if (hist > 0) {
      macdStatus = "BULLISH";
      macdStatusHe = "שוריוני (עולה)";
      macdStatusRu = "бычий (рост)";
    } else if (hist < 0) {
      macdStatus = "BEARISH";
      macdStatusHe = "דובי (יורד)";
      macdStatusRu = "медвежий (падение)";
    }

    String maStatus = "NEUTRAL";
    String maStatusHe = "נייטרלי";
    String maStatusRu = "нейтрально";
    if (currentPrice > sma20 && currentPrice > sma50) {
      maStatus = "BULLISH";
      maStatusHe = "מגמת עלייה";
      maStatusRu = "восходящий тренд";
    } else if (currentPrice < sma20 && currentPrice < sma50) {
      maStatus = "BEARISH";
      maStatusHe = "מגמת ירידה";
      maStatusRu = "нисходящий тренд";
    }

    double bbWidth = bb.upper - bb.lower;
    double bbPct = bbWidth > 0 ? (currentPrice - bb.lower) / bbWidth : 0.5;
    String bbStatus = "MIDDLE";
    String bbStatusHe = "מרכז הרצועה";
    String bbStatusRu = "середина канала";
    if (bbPct < 0.15) {
      bbStatus = "OVERSOLD (LOWER BAND)";
      bbStatusHe = "רצועה תחתונה (תמיכה)";
      bbStatusRu = "нижняя полоса (поддержка)";
    } else if (bbPct > 0.85) {
      bbStatus = "OVERBOUGHT (UPPER BAND)";
      bbStatusHe = "רצועה עליונה (התנגדות)";
      bbStatusRu = "верхняя полоса (сопротивление)";
    }
    List<Map<String, Object>> signals = castVotes(closes, highs, lows, explanationsEn, explanationsHe, explanationsRu);
    Map<String, Object> levels = nearestLevels(highs, lows, currentPrice);

    int buyVotes = 0;
    int sellVotes = 0;
    int neutralVotes = 0;
    for (Map<String, Object> row : signals) {
      switch (String.valueOf(row.get("action"))) {
        case "BUY" -> buyVotes++;
        case "SELL" -> sellVotes++;
        default -> neutralVotes++;
      }
    }
    int voteTotal = Math.max(1, signals.size());
    String recommendation = labelFromVotes(buyVotes, sellVotes, neutralVotes, signals.size());
    String recommendationHe;
    String recommendationRu;
    String recColor;
    int winningVotes;
    switch (recommendation) {
      case "STRONG BUY" -> {
        recommendationHe = "קנייה חזקה";
        recommendationRu = "сильная покупка";
        recColor = "#22c55e";
        winningVotes = buyVotes;
      }
      case "BUY" -> {
        recommendationHe = "קנייה";
        recommendationRu = "покупка";
        recColor = "#4ade80";
        winningVotes = buyVotes;
      }
      case "STRONG SELL" -> {
        recommendationHe = "מכירה חזקה";
        recommendationRu = "сильная продажа";
        recColor = "#ef4444";
        winningVotes = sellVotes;
      }
      case "SELL" -> {
        recommendationHe = "מכירה";
        recommendationRu = "продажа";
        recColor = "#f87171";
        winningVotes = sellVotes;
      }
      default -> {
        recommendation = "NEUTRAL";
        recommendationHe = "נייטרלי";
        recommendationRu = "нейтрально";
        recColor = "#eab308";
        winningVotes = neutralVotes;
      }
    }
    double score = (buyVotes - sellVotes) / (double) voteTotal * 7.5;
    int confidence = (int) Math.round(100.0 * winningVotes / voteTotal);
    String windowEn = "1d".equals(interval) ? "Daily candles" : "Hourly candles";
    String windowHe = "1d".equals(interval) ? "נרות יומיים" : "נרות שעתיים";
    String windowRu = "1d".equals(interval) ? "Дневные свечи" : "Часовые свечи";
    String summaryEn = windowEn + " for " + sym + ": " + buyVotes + " Buy, " + neutralVotes + " Neutral, " + sellVotes
        + " Sell. Summary: " + recommendation + ". This describes candles that already closed. It is not a price forecast.";
    String summaryHe = windowHe + " עבור " + sym + ": " + buyVotes + " קנייה, " + neutralVotes + " נייטרלי, " + sellVotes
        + " מכירה. סיכום: " + recommendationHe + ". זה מתאר נרות שכבר נסגרו, לא תחזית מחיר.";
    String summaryRu = windowRu + " по " + sym + ": покупка " + buyVotes + ", нейтрально " + neutralVotes + ", продажа " + sellVotes
        + ". Итог: " + recommendationRu + ". Это описание уже закрытых свечей, не прогноз цены.";
    explanationsEn.add(0, "How a vote is cast: price above a moving average is Buy, below is Sell. RSI is Buy under 30 and Sell over 70. Stochastic is Buy under 20 and Sell over 80. MACD is Buy when its histogram is above zero. Bollinger votes only outside the bands. Anything in between is Neutral.");
    explanationsHe.add(0, "איך נספר קול: מחיר מעל ממוצע נע הוא קנייה, ומתחתיו מכירה. RSI הוא קנייה מתחת ל-30 ומכירה מעל 70. סטוכסטי הוא קנייה מתחת ל-20 ומכירה מעל 80. MACD הוא קנייה כשההיסטוגרמה מעל אפס. בולינגר מצביע רק מחוץ לרצועות. כל השאר נייטרלי.");
    explanationsRu.add(0, "Как считается голос: цена выше скользящей средней — покупка, ниже — продажа. RSI голосует за покупку ниже 30 и за продажу выше 70. Стохастик — за покупку ниже 20 и за продажу выше 80. MACD голосует за покупку, когда гистограмма выше нуля. Боллинджер голосует только за пределами полос. Всё, что между порогами, — нейтрально.");

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("symbol", sym);
    out.put("recommendation", recommendation);
    out.put("recommendationHe", recommendationHe);
    out.put("recommendationRu", recommendationRu);
    out.put("score", score);
    out.put("confidence", confidence);
    out.put("color", recColor);
    out.put("price", currentPrice);
    out.put("indicators", Map.of(
        "rsi", Map.of("value", rsi, "status", rsiStatus, "statusHe", rsiStatusHe, "statusRu", rsiStatusRu),
        "macd", Map.of("macdLine", macdLine, "signalLine", signal, "hist", hist, "status", macdStatus, "statusHe", macdStatusHe, "statusRu", macdStatusRu),
        "sma", Map.of("sma20", sma20, "sma50", sma50, "status", maStatus, "statusHe", maStatusHe, "statusRu", maStatusRu),
        "bb", Map.of("upper", bb.upper, "middle", bb.middle, "lower", bb.lower, "status", bbStatus, "statusHe", bbStatusHe, "statusRu", bbStatusRu)));
    out.put("explanationsEn", explanationsEn);
    out.put("explanationsHe", explanationsHe);
    out.put("explanationsRu", explanationsRu);
    out.put("summary", summaryEn);
    out.put("summaryHe", summaryHe);
    out.put("summaryRu", summaryRu);
    out.put("available", true);
    out.put("interval", "1d".equals(interval) ? "1d" : "1h");
    out.put("votes", Map.of("buy", buyVotes, "neutral", neutralVotes, "sell", sellVotes));
    out.put("signals", signals);
    out.put("levels", levels);
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
    row.put("recommendationRu", full.get("recommendationRu"));
    row.put("confidence", full.get("confidence"));
    row.put("color", full.get("color"));
    row.put("rsi", rsi.getOrDefault("value", 50));
    row.put("macdStatus", macd.getOrDefault("status", "NEUTRAL"));
    row.put("macdStatusHe", macd.getOrDefault("statusHe", "נייטרלי"));
    row.put("macdStatusRu", macd.getOrDefault("statusRu", "нейтрально"));
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

  private static void voteMovingAverage(
      List<Map<String, Object>> signals,
      List<String> en,
      List<String> he,
      List<String> ru,
      String name,
      double price,
      double[] values,
      String group) {
    if (values == null || values.length == 0) return;
    double ma = values[values.length - 1];
    String action = price > ma ? "BUY" : price < ma ? "SELL" : "NEUTRAL";
    addVote(signals, en, he, ru, name, ma, fmtPx(ma), action, group);
  }

  /** Buy under the low line, sell over the high line, neutral in the middle. */
  private static void voteOscillator(
      List<Map<String, Object>> signals,
      List<String> en,
      List<String> he,
      List<String> ru,
      String name,
      double value,
      double buyBelow,
      double sellAbove,
      String valueText,
      String group) {
    String action = value < buyBelow ? "BUY" : value > sellAbove ? "SELL" : "NEUTRAL";
    addVote(signals, en, he, ru, name, value, valueText, action, group);
  }

  private static void addVote(
      List<Map<String, Object>> signals,
      List<String> en,
      List<String> he,
      List<String> ru,
      String name,
      double value,
      String valueText,
      String action,
      String group) {
    String actionHe = switch (action) {
      case "BUY" -> "קנייה";
      case "SELL" -> "מכירה";
      default -> "נייטרלי";
    };
    String actionRu = switch (action) {
      case "BUY" -> "покупка";
      case "SELL" -> "продажа";
      default -> "нейтрально";
    };
    String actionEn = switch (action) {
      case "BUY" -> "Buy";
      case "SELL" -> "Sell";
      default -> "Neutral";
    };
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("name", name);
    row.put("value", value);
    row.put("valueText", valueText);
    row.put("action", action);
    row.put("actionHe", actionHe);
    row.put("actionRu", actionRu);
    row.put("group", group);
    signals.add(row);
    if (en != null) en.add(name + ": " + valueText + " — " + actionEn);
    if (he != null) he.add(name + ": " + valueText + " — " + actionHe);
    if (ru != null) ru.add(name + ": " + valueText + " — " + actionRu);
  }

  /** Same Buy / Sell / Neutral word the summary badge uses, without the long text. */
  String verdict(List<CandleBar> candles) {
    if (candles == null || candles.size() < 50) return "HOLD";
    int n = candles.size();
    double[] closes = new double[n];
    double[] highs = new double[n];
    double[] lows = new double[n];
    for (int i = 0; i < n; i++) {
      closes[i] = candles.get(i).close();
      highs[i] = candles.get(i).high();
      lows[i] = candles.get(i).low();
    }
    List<Map<String, Object>> signals = castVotes(closes, highs, lows, null, null, null);
    int buy = 0;
    int sell = 0;
    int neutral = 0;
    for (Map<String, Object> row : signals) {
      switch (String.valueOf(row.get("action"))) {
        case "BUY" -> buy++;
        case "SELL" -> sell++;
        default -> neutral++;
      }
    }
    return labelFromVotes(buy, sell, neutral, signals.size());
  }

  /** One vote per indicator. The badge and the $10,000 line both call this. */
  private List<Map<String, Object>> castVotes(
      double[] closes,
      double[] highs,
      double[] lows,
      List<String> en,
      List<String> he,
      List<String> ru) {
    List<Map<String, Object>> signals = new ArrayList<>();
    double price = closes[closes.length - 1];
    double rsi = last(calculateRsi(closes, 14), 50);
    double[] sma20 = calculateSma(closes, 20);
    double[] sma50 = calculateSma(closes, 50);
    Macd macd = calculateMacd(closes, 12, 26, 9);
    double hist = 0;
    boolean hasMacd = macd != null && macd.histogram.length > 0;
    if (hasMacd) hist = last(macd.histogram, 0);
    Bb bb = lastBb(calculateBollinger(closes, 20, 2), price);
    voteMovingAverage(signals, en, he, ru, "SMA 10", price, calculateSma(closes, 10), "ma");
    voteMovingAverage(signals, en, he, ru, "SMA 20", price, sma20, "ma");
    voteMovingAverage(signals, en, he, ru, "SMA 50", price, sma50, "ma");
    voteMovingAverage(signals, en, he, ru, "SMA 100", price, calculateSma(closes, 100), "ma");
    voteMovingAverage(signals, en, he, ru, "EMA 12", price, calculateEma(closes, 12), "ma");
    voteMovingAverage(signals, en, he, ru, "EMA 26", price, calculateEma(closes, 26), "ma");
    voteOscillator(signals, en, he, ru, "RSI 14", rsi, 30, 70, fmt1(rsi), "oscillator");
    Double stoch = stochasticK(highs, lows, closes, 14);
    if (stoch != null) {
      voteOscillator(signals, en, he, ru, "Stochastic 14", stoch, 20, 80, fmt1(stoch), "oscillator");
    }
    if (hasMacd) {
      String macdAction = hist > 0 ? "BUY" : hist < 0 ? "SELL" : "NEUTRAL";
      addVote(signals, en, he, ru, "MACD 12,26,9", hist, fmt2(hist), macdAction, "oscillator");
    }
    String bbAction = price < bb.lower ? "BUY" : price > bb.upper ? "SELL" : "NEUTRAL";
    addVote(signals, en, he, ru, "Bollinger 20,2", price, fmtPx(price), bbAction, "oscillator");
    return signals;
  }

  /**
   * Walks the recent candles with one rule: while the summary says Buy, a pretend 10,000
   * sits in the price; otherwise it stands aside. The site's commission is charged on entry
   * and on exit. The last point cashes out, so the exit fee is included.
   */
  public Map<String, Object> replay(List<CandleBar> candles, String symbol) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (candles == null || candles.size() < 80) {
      out.put("available", false);
      return out;
    }
    String sym = symbol == null ? "" : symbol.trim().toUpperCase();
    double contract = ContractSpecs.getContractSize(sym).doubleValue();
    int start = Math.max(60, candles.size() - 120);
    double equity = 10_000;
    boolean inMarket = false;
    double entry = 0;
    double invested = 0;
    int entries = 0;
    double fees = 0;
    List<Double> points = new ArrayList<>();
    for (int i = start; i < candles.size(); i++) {
      String rec = verdict(candles.subList(0, i + 1));
      boolean wantLong = rec.contains("BUY");
      double price = candles.get(i).close();
      if (price > 0 && wantLong && !inMarket) {
        double fee = feeOn(sym, equity, price, contract);
        equity -= fee;
        fees += fee;
        entry = price;
        invested = equity;
        inMarket = true;
        entries++;
      } else if (price > 0 && !wantLong && inMarket) {
        double mark = invested * (price / entry);
        double fee = feeOn(sym, mark, price, contract);
        equity = mark - fee;
        fees += fee;
        inMarket = false;
        invested = 0;
      }
      double marked = inMarket && entry > 0 ? invested * (price / entry) : equity;
      points.add(round2(marked));
    }
    if (inMarket && entry > 0 && !points.isEmpty()) {
      double price = candles.get(candles.size() - 1).close();
      double mark = invested * (price / entry);
      double fee = feeOn(sym, mark, price, contract);
      fees += fee;
      points.set(points.size() - 1, round2(mark - fee));
    }
    double end = points.isEmpty() ? 10_000 : points.get(points.size() - 1);
    out.put("available", true);
    out.put("stake", 10000);
    out.put("endValue", round2(end));
    out.put("changePct", round2((end - 10_000) / 10_000 * 100.0));
    out.put("entries", entries);
    out.put("fees", round2(fees));
    out.put("bars", points.size());
    out.put("points", points);
    return out;
  }

  private static String labelFromVotes(int buy, int sell, int neutral, int total) {
    if (total <= 0) return "NEUTRAL";
    if (buy >= sell * 2 && buy * 5 >= total * 3) return "STRONG BUY";
    if (sell >= buy * 2 && sell * 5 >= total * 3) return "STRONG SELL";
    if (buy > sell && buy > neutral) return "BUY";
    if (sell > buy && sell > neutral) return "SELL";
    return "NEUTRAL";
  }

  /** Commission on one fill, same schedule as a real order of this size. */
  private static double feeOn(String symbol, double amount, double price, double contract) {
    if (amount <= 0 || price <= 0 || contract <= 0) return 0;
    double lots = amount / (price * contract);
    return TradingFees.calculateCommission(symbol, BigDecimal.valueOf(lots), BigDecimal.valueOf(price)).doubleValue();
  }

  private static double round2(double value) {
    return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
  }

  /**
   * Nearest confirmed turn on the recent candles.
   * A turn is a high or low that sticks out above or below the two bars on each side.
   * Resistance is the closest such high above the last price, support the closest such low below it.
   */
  private static Map<String, Object> nearestLevels(double[] high, double[] low, double price) {
    Map<String, Object> levels = new LinkedHashMap<>();
    if (high.length < 5 || low.length != high.length) return levels;
    int end = high.length - 3;
    int start = Math.max(2, end - 48);
    Double support = null;
    Double resistance = null;
    for (int i = start; i <= end; i++) {
      boolean swingHigh = high[i] > high[i - 1] && high[i] > high[i - 2] && high[i] > high[i + 1] && high[i] > high[i + 2];
      boolean swingLow = low[i] < low[i - 1] && low[i] < low[i - 2] && low[i] < low[i + 1] && low[i] < low[i + 2];
      if (swingHigh && high[i] > price && (resistance == null || high[i] < resistance)) resistance = high[i];
      if (swingLow && low[i] < price && (support == null || low[i] > support)) support = low[i];
    }
    int from = Math.max(0, high.length - 40);
    int to = high.length - 2;
    if (resistance == null) {
      for (int i = from; i <= to; i++) {
        if (high[i] > price && (resistance == null || high[i] < resistance)) resistance = high[i];
      }
    }
    if (support == null) {
      for (int i = from; i <= to; i++) {
        if (low[i] < price && (support == null || low[i] > support)) support = low[i];
      }
    }
    if (support != null) levels.put("support", support);
    if (resistance != null) levels.put("resistance", resistance);
    return levels;
  }

  /** Stochastic %K. Null when there are not enough highs and lows. */
  private static Double stochasticK(double[] high, double[] low, double[] close, int period) {
    int last = close.length - 1;
    if (last < period - 1) return null;
    double highest = high[last];
    double lowest = low[last];
    for (int j = 0; j < period; j++) {
      highest = Math.max(highest, high[last - j]);
      lowest = Math.min(lowest, low[last - j]);
    }
    if (highest == lowest) return 50.0;
    return (close[last] - lowest) / (highest - lowest) * 100.0;
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

  private static String fmtPx(double v) {
    double abs = Math.abs(v);
    if (abs >= 1000) return String.format(java.util.Locale.US, "%.2f", v);
    if (abs >= 10) return String.format(java.util.Locale.US, "%.3f", v);
    return String.format(java.util.Locale.US, "%.5f", v);
  }

  record Macd(double[] macdLine, double[] signalLine, double[] histogram) {}

  record Bb(double upper, double middle, double lower) {}
}
