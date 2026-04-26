package com.brokerui.broker;

import org.json.JSONArray;
import org.json.JSONObject;
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
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * STANDALONE MT5 BRIDGE INFRASTRUCTURE
 * This service handles the communication with MT5 for:
 * 1. Chart Data (Candles)
 * 2. Real-time Price
 * 3. Order Execution
 */
@Service
public class MT5BridgeService {

    @Value("${broker.mt5.base-path}")
    private String basePath; // Path to MT5/MQL5/Files directory

    private static final String MT5_HOST = "127.0.0.1";
    private static final int MT5_PORT = 5555;
    private static final DateTimeFormatter MT5_DATE_FMT = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

    /**
     * Executes a trade on MT5 via Socket.
     */
    public String executeTrade(String symbol, String action, double lot, double tp, double sl) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(MT5_HOST, MT5_PORT), 2000);
            try (PrintWriter writer = new PrintWriter(socket.getOutputStream(), true)) {
                // Command Format: TRADE|SYMBOL|ACTION|PRICE|TP|SL|LOT
                String command = String.format(Locale.US, "TRADE|%s|%s|0|%.5f|%.5f|%.2f",
                        symbol.trim().toUpperCase(), action.toUpperCase(), tp, sl, lot);
                writer.println(command);
                return "SUCCESS: Trade command sent for " + symbol;
            }
        } catch (IOException e) {
            return "ERROR: Connection to MT5 socket failed: " + e.getMessage();
        }
    }

    /**
     * Fetches candle data from MT5 via File Bridge.
     */
    public Candle[] getCandles(String symbol, String timeframe, int count) throws Exception {
        File candleFile = new File(basePath, "candles_data.json");
        File requestFile = new File(basePath, "request_candles.txt");

        // Clean existing data
        if (candleFile.exists()) new FileWriter(candleFile, false).close();

        // Write request
        ZonedDateTime from = ZonedDateTime.now(ZoneOffset.UTC).minusDays(14); // Default to 14 days
        String requestContent = String.format(Locale.US, "SYMBOL=%s\nTIMEFRAME=%s\nFROM=%s\n", 
                symbol, timeframe, from.format(MT5_DATE_FMT));
        
        Files.writeString(requestFile.toPath(), requestContent, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

        // Wait for response
        int waited = 0;
        while (waited < 15) {
            if (candleFile.exists() && candleFile.length() > 5) break;
            TimeUnit.SECONDS.sleep(1);
            waited++;
        }

        if (waited >= 15) throw new IOException("Timeout: MT5 did not respond with candle data for " + symbol);

        // Parse result
        String content = Files.readString(candleFile.toPath()).trim();
        JSONArray arr = new JSONArray(content);
        int actual = Math.min(count, arr.length());
        Candle[] candles = new Candle[actual];

        for (int i = 0; i < actual; i++) {
            JSONObject o = arr.getJSONObject(arr.length() - 1 - i); // From newest to oldest
            LocalDateTime dt = LocalDateTime.parse(o.getString("time"), MT5_DATE_FMT);
            candles[i] = new Candle(
                    o.getDouble("open"),
                    o.getDouble("high"),
                    o.getDouble("low"),
                    o.getDouble("close"),
                    dt.toInstant(ZoneOffset.UTC).toEpochMilli()
            );
        }

        // Cleanup
        new FileWriter(candleFile, false).close();
        new FileWriter(requestFile, false).close();

        return candles;
    }

    /**
     * Checks if a symbol is available in MT5. 
     * In a real scenario, this would use a list or query MT5. 
     * For now, we use a naming convention or a config.
     */
    public boolean isMT5Symbol(String symbol) {
        // Typically Forex and Gold are in MT5. Stocks might be missing.
        String s = symbol.toUpperCase();
        return s.contains("USD") || s.contains("EUR") || s.contains("GBP") || s.contains("JPY") || s.equals("XAUUSD");
    }
}
