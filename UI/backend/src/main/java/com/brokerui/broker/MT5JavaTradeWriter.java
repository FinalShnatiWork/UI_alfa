package com.brokerui.broker;

import com.sun.jna.Library;
import com.sun.jna.Native;

import java.io.OutputStream;
import java.io.PrintWriter;
import java.net.Socket;

public class MT5JavaTradeWriter {

    private static final String MT5_HOST = "127.0.0.1";
    private static final int MT5_PORT = 5555;

    public interface TradeDLL extends Library {
        TradeDLL INSTANCE = Native.load("TradeBridge2", TradeDLL.class);
        boolean GetLastPositions(byte[] buffer, int maxLen); 
    }

    public static String sendTradeToMT5(String symbol, String action, double entry, double tp, double sl, double lot) {
        String response;

        try (Socket socket = new Socket(MT5_HOST, MT5_PORT);
             OutputStream output = socket.getOutputStream();
             PrintWriter writer = new PrintWriter(output, true)) {

            String cleanSymbol = symbol.trim();
            String cleanAction = action.trim();

            String command = String.format(
                    "TRADE|%s|%s|%.5f|%.5f|%.5f|%.2f",
                    cleanSymbol, cleanAction, entry, tp, sl, lot
            );

            writer.println(command);
            System.out.println("✅ Trade signal sent via socket: " + command);
            response = "SUCCESS|Trade sent via socket";

        } catch (Exception e) {
            System.err.println("❌ Socket communication failed");
            e.printStackTrace();
            response = "❌ ERROR|Socket failed: " + e.getMessage();
        }

        return response;
    }
}
