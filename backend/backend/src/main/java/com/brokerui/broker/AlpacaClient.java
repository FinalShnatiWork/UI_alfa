package com.brokerui.broker;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;

import org.json.*;

/**
 * Client class that acts as a file-bridge connector to the MetaTrader 5 (MT5) client terminal.
 * Reads and writes request files to prompt the MT5 Expert Advisor (EA)
 * for current prices and historical/recent candlestick indicators.
 */
public class AlpacaClient {

	   private static final String REQUEST_FILE = "C:\\Users\\david\\AppData\\Roaming\\MetaQuotes\\Terminal\\E7DB6AF1FE93F292652A5D3B98342601\\MQL5\\Files\\request_candles.txt";
	    private static final String CANDLE_FILE = "C:\\Users\\david\\AppData\\Roaming\\MetaQuotes\\Terminal\\E7DB6AF1FE93F292652A5D3B98342601\\MQL5\\Files\\candles_data.json";
	    private static final String REQUEST_PRICE_FILE = "C:\\Users\\david\\AppData\\Roaming\\MetaQuotes\\Terminal\\E7DB6AF1FE93F292652A5D3B98342601\\MQL5\\Files\\request_price.txt";
	    private static final String PRICE_FILE   = "C:\\Users\\david\\AppData\\Roaming\\MetaQuotes\\Terminal\\E7DB6AF1FE93F292652A5D3B98342601\\MQL5\\Files\\currentPrice.json";

	    /**
	     * Requests recent candlestick bars from the MT5 EA terminal.
	     *
	     * @param symbol trading symbol (e.g. EURUSD)
	     * @param count count of candles to parse
	     * @param timeframe timeframe period identifier (e.g. 1Hour)
	     * @return array of populated Candles (candles[0] being the newest)
	     * @throws Exception if connection times out or file access fails
	     */
	    public static Candle[] getRecentCandles(String symbol, int count, String timeframe) throws Exception {
	        File candleFile = new File(CANDLE_FILE);
	        File requestFile = new File(REQUEST_FILE);

	        // 🧹 ניקוי קובץ נרות אם קיים
	        if (candleFile.exists() && candleFile.length() > 5) {
	            System.out.println("⚠️ candles_data.json לא ריק – מרוקן תוכן...");
	            new FileWriter(candleFile, false).close();
	        }

	        // 🕒 חישוב טווח של 15 ימים אחורה
	        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
	        ZonedDateTime from = now.minusDays(14);
	        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

	        String fromDate = from.format(fmt);

	        // ✍️ כתיבה לקובץ הבקשה
	        StringBuilder request = new StringBuilder();
	        request.append("SYMBOL=").append(symbol).append(".m").append(System.lineSeparator());
	        request.append("TIMEFRAME=").append(timeframe).append(System.lineSeparator());
	        request.append("FROM=").append(fromDate).append(System.lineSeparator());

	        Files.writeString(requestFile.toPath(), request.toString(), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
	        System.out.println("📨 Request sent to MetaTrader: " + symbol + " / " + timeframe + " / from: " + fromDate);

	        // 🕒 ממתין לתשובה
	        int waited = 0;
	        while (waited < 10) {
	            if (candleFile.exists() && candleFile.length() > 5) break;
	            TimeUnit.SECONDS.sleep(1);
	            waited++;
	        }

	        if (waited >= 10) throw new IOException("❌ Timeout waiting for candle data");

	        // 📥 קריאה של הקובץ
	        String content = Files.readString(candleFile.toPath()).trim();
	        JSONArray arr = new JSONArray(content);

	        int actualCount = Math.min(count, arr.length());
	        Candle[] candles = new Candle[actualCount];

	        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

	        for (int i = 0; i < actualCount; i++) {
	            JSONObject o = arr.getJSONObject(arr.length() - 1 - i);  // קריאה מהנר הכי חדש לישן
	            double open = o.getDouble("open");
	            double high = o.getDouble("high");
	            double low  = o.getDouble("low");
	            double close = o.getDouble("close");

	            LocalDateTime dt = LocalDateTime.parse(o.getString("time"), formatter);
	            long timestamp = dt.toInstant(ZoneOffset.UTC).toEpochMilli();

	            candles[i] = new Candle(open, high, low, close, timestamp);
	        }

	        // 🧹 מרוקן את שני הקבצים מבלי למחוק אותם
	        new FileWriter(candleFile, false).close();
	        new FileWriter(requestFile, false).close();

	        System.out.println("✅ Candle data parsed and cleaned");

	        return candles;
	    }


	    /**
	     * Historical candle fetcher for ML dataset building.
	     * Same MT5 file-bridge protocol as getRecentCandles, but accepts a
	     * custom `fromDate` and waits longer for the response because
	     * historical queries are heavier on the EA side.
	     *
	     * NOTE: Shares the same request/response files as getRecentCandles,
	     * so the main bot must be OFF while this runs (use /off in Telegram).
	     *
	     * @param symbol     e.g. "EURUSD"
	     * @param fromDate   start of the historical range (UTC)
	     * @param timeframe  "30Min", "1Hour" or "4Hour"
	     * @param maxCount   upper bound on the number of candles returned
	     * @return           array with candles[0] = newest (same convention
	     *                   as getRecentCandles)
	     */
	    public static Candle[] getHistoricalCandles(String symbol,
	                                                ZonedDateTime fromDate,
	                                                String timeframe,
	                                                int maxCount) throws Exception {
	        File candleFile  = new File(CANDLE_FILE);
	        File requestFile = new File(REQUEST_FILE);

	        // 🧹 ניקוי קובץ נרות אם קיים
	        if (candleFile.exists() && candleFile.length() > 5) {
	            new FileWriter(candleFile, false).close();
	        }

	        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");
	        String fromDateStr = fromDate.format(fmt);

	        // ✍️ כתיבה לקובץ הבקשה
	        StringBuilder request = new StringBuilder();
	        request.append("SYMBOL=").append(symbol).append(".m").append(System.lineSeparator());
	        request.append("TIMEFRAME=").append(timeframe).append(System.lineSeparator());
	        request.append("FROM=").append(fromDateStr).append(System.lineSeparator());

	        Files.writeString(requestFile.toPath(), request.toString(),
	                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
	        System.out.println("📨 Historical request: " + symbol + " / " + timeframe + " / from: " + fromDateStr);

	        // 🕒 המתנה ארוכה יותר — שאילתות היסטוריות איטיות יותר (עד 30 שניות)
	        int waited = 0;
	        while (waited < 30) {
	            if (candleFile.exists() && candleFile.length() > 5) break;
	            TimeUnit.SECONDS.sleep(1);
	            waited++;
	        }

	        if (waited >= 30) throw new IOException("❌ Timeout waiting for historical candle data");

	        // 📥 קריאה
	        String content = Files.readString(candleFile.toPath()).trim();
	        JSONArray arr = new JSONArray(content);

	        int actualCount = Math.min(maxCount, arr.length());
	        Candle[] candles = new Candle[actualCount];

	        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

	        // ✅ אותה קונבנציה כמו getRecentCandles: candles[0] = החדש ביותר
	        for (int i = 0; i < actualCount; i++) {
	            JSONObject o = arr.getJSONObject(arr.length() - 1 - i);
	            double open  = o.getDouble("open");
	            double high  = o.getDouble("high");
	            double low   = o.getDouble("low");
	            double close = o.getDouble("close");

	            LocalDateTime dt = LocalDateTime.parse(o.getString("time"), formatter);
	            long timestamp = dt.toInstant(ZoneOffset.UTC).toEpochMilli();

	            candles[i] = new Candle(open, high, low, close, timestamp);
	        }

	        // 🧹 ריקון הקבצים
	        new FileWriter(candleFile, false).close();
	        new FileWriter(requestFile, false).close();

	        System.out.println("✅ Received " + actualCount + " historical candles for "
	                           + symbol + " [" + timeframe + "]");

	        return candles;
	    }

	    
	    
	    /**
	     * Fetches current exchange rate quote from the MT5 EA terminal.
	     * The goal of this method is to retrieve the live bid-ask mid price.
	     *
	     * @param symbol trading symbol code (e.g. EURUSD)
	     * @return current mid rate price quote
	     * @throws Exception if connection times out or file access fails
	     */
public static double getExchangeRate(String symbol) throws Exception {
    File priceFile = new File(PRICE_FILE);
    File requestFile = new File(REQUEST_PRICE_FILE);

    // 🔄 שלב 1: ניקוי תוכן קובץ currentPrice.json אם קיים
    if (priceFile.exists() && priceFile.length() > 5) {
        System.out.println("⚠️ currentPrice.json לא ריק – מרוקן תוכן...");
        new FileWriter(priceFile, false).close();
    }

    // 📝 שלב 2: כתיבת בקשה ל־request_price.txt
    Files.writeString(requestFile.toPath(),
            "SYMBOL=" + symbol + ".m" + System.lineSeparator(),
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

    System.out.println("📨 Request sent to MetaTrader for price of " + symbol);

    // 🕒 שלב 3: המתנה לתשובת EA
    int waited = 0;
    while (waited < 10) {
        if (priceFile.exists() && priceFile.length() > 5) break;
        TimeUnit.SECONDS.sleep(1);
        waited++;
    }

    if (waited >= 10) {
        throw new IOException("❌ Timeout waiting for currentPrice.json from EA");
    }

    // 📥 שלב 4: קריאה מהקובץ
    String content = Files.readString(priceFile.toPath()).trim();
    JSONObject json = new JSONObject(content);

    double mid = json.getDouble("mid");
    System.out.println("✅ Mid price of " + symbol + ": " + mid);

    // 🧹 שלב 5: ריקון שני הקבצים לאחר שימוש
    new FileWriter(priceFile, false).close();
    new FileWriter(requestFile, false).close();

    return mid;
}


	 
	}

