package com.brokerui.broker;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.TimeUnit;

/**
 * Orchestrates the MetaTrader 5 bridge:
 * 1. File Bridge (getting candles and prices) - based on AlpacaClient logic.
 * 2. Socket Bridge (executing trades) - based on MT5JavaTradeWriter logic.
 */
@Service
public class MT5IntegrationService {

    @Value("${broker.mt5.base-path}")
    private String basePath;

    private static final String MT5_HOST = "127.0.0.1";
    private static final int MT5_PORT = 5555;

    private final DateTimeFormatter fileFmt = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

    /**
     * Verifies if the MT5 bridge is actually reachable.
     */
    public boolean checkHealth() {
        // 1. Check if the file bridge directory exists
        File dir = new File(basePath);
        if (!dir.exists() || !dir.isDirectory()) {
            return false;
        }

        // 2. Try to ping the MT5 socket (port 5555)
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(MT5_HOST, MT5_PORT), 2000);
            return true;
        } catch (IOException e) {
            System.err.println("[MT5 Health] Socket connection failed: " + e.getMessage());
            return false;
        }
    }

    /* ─── Execution Logic ─── */

    public String sendTrade(String symbol, String action, double price, double tp, double sl, double lot) {
        try (Socket socket = new Socket(MT5_HOST, MT5_PORT);
             PrintWriter writer = new PrintWriter(socket.getOutputStream(), true)) {

            String command = String.format(Locale.US,
                    "TRADE|%s|%s|%.5f|%.5f|%.5f|%.2f",
                    symbol.trim().toUpperCase(), action.trim().toUpperCase(), price, tp, sl, lot
            );

            writer.println(command);
            return "SUCCESS|Trade signal sent: " + command;
        } catch (Exception e) {
            return "ERROR|Socket failed: " + e.getMessage();
        }
    }

    /* ─── File-Bridge Logic (based on AlpacaClient.java) ─── */

    public double getPrice(String symbol) throws Exception {
        File priceFile = new File(basePath, "currentPrice.json");
        File requestFile = new File(basePath, "request_price.txt");

        if (priceFile.exists()) new FileWriter(priceFile, false).close();

        Files.writeString(requestFile.toPath(),
                "SYMBOL=" + symbol + System.lineSeparator(),
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

        int waited = 0;
        while (waited < 10) {
            if (priceFile.exists() && priceFile.length() > 5) break;
            TimeUnit.SECONDS.sleep(1);
            waited++;
        }

        if (waited >= 10) throw new IOException("Timeout waiting for price from MT5");

        String content = Files.readString(priceFile.toPath()).trim();
        JSONObject json = new JSONObject(content);
        double mid = json.getDouble("mid");

        new FileWriter(priceFile, false).close();
        new FileWriter(requestFile, false).close();

        return mid;
    }

    public Candle[] getRecentCandles(String symbol, int count, String timeframe) throws Exception {
        File candleFile = new File(basePath, "candles_data.json");
        File requestFile = new File(basePath, "request_candles.txt");

        if (candleFile.exists()) new FileWriter(candleFile, false).close();

        ZonedDateTime from = ZonedDateTime.now(ZoneOffset.UTC).minusDays(14);
        String fromDate = from.format(fileFmt);

        String request = String.format(Locale.US, "SYMBOL=%s\nTIMEFRAME=%s\nFROM=%s\n", symbol, timeframe, fromDate);
        Files.writeString(requestFile.toPath(), request, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

        int waited = 0;
        while (waited < 10) {
            if (candleFile.exists() && candleFile.length() > 5) break;
            TimeUnit.SECONDS.sleep(1);
            waited++;
        }

        if (waited >= 10) throw new IOException("Timeout waiting for candle data from MT5");

        String content = Files.readString(candleFile.toPath()).trim();
        JSONArray arr = new JSONArray(content);
        int actual = Math.min(count, arr.length());
        Candle[] candles = new Candle[actual];

        for (int i = 0; i < actual; i++) {
            JSONObject o = arr.getJSONObject(arr.length() - 1 - i);
            LocalDateTime dt = LocalDateTime.parse(o.getString("time"), fileFmt);
            candles[i] = new Candle(
                    o.getDouble("open"),
                    o.getDouble("high"),
                    o.getDouble("low"),
                    o.getDouble("close"),
                    dt.toInstant(ZoneOffset.UTC).toEpochMilli()
            );
        }

        new FileWriter(candleFile, false).close();
        new FileWriter(requestFile, false).close();
        return candles;
    }
}
