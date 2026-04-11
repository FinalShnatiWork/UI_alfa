package com.brokerui.broker;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class BotState {
    public static boolean isBotOn = true;
    public static boolean isConfirmingTrade = false;

    public static boolean isBusy() {
        return isConfirmingTrade;
    }

    // 🧠 הגבלת זמן לסיגנלים הפוכים
    private static final Duration oppositeSignalCooldown = Duration.ofDays(1);

    private static final Map<String, LastDirectionInfo> lastDirectionMap = new HashMap<>();

   
    private static class LastDirectionInfo {
        String direction;
        LocalDateTime time;

        LastDirectionInfo(String direction, LocalDateTime time) {
            this.direction = direction;
            this.time = time;
        }
    }
    // 🧼 ניקוי רשומות ישנות
    private static void cleanOldDirections() {
        Iterator<Map.Entry<String, LastDirectionInfo>> it = lastDirectionMap.entrySet().iterator();
        LocalDateTime now = LocalDateTime.now();
        while (it.hasNext()) {
            Map.Entry<String, LastDirectionInfo> entry = it.next();
            if (Duration.between(entry.getValue().time, now).compareTo(oppositeSignalCooldown) > 0) {
                it.remove();
            }
        }
    }
    
 
    



    public static void updateLastDirection(String symbol, String direction) {
        cleanOldDirections(); // ✅ ניקוי לפני עדכון
        lastDirectionMap.put(symbol, new LastDirectionInfo(direction, LocalDateTime.now()));
    }

    // ✅ משתנים קיימים
    public static String pendingSymbol;
    public static String pendingAction;
    public static double pendingEntry;
    public static double pendingTP;
    public static double pendingSL;
    public static double lowPendingTP;
    public static double lowPendingSL;
    public static String selectedRisk;

    private static final Map<String, Long> lastSignalTimeMap = new HashMap<>();

    public static boolean isDuplicate(String symbol, String timeframe, long candleTime) {
        String key = symbol + "_" + timeframe;
        Long lastTime = lastSignalTimeMap.get(key);
        return lastTime != null && lastTime == candleTime;
    }

    public static void updateLastSignal(String symbol, String timeframe, long candleTime) {
        lastSignalTimeMap.put(symbol + "_" + timeframe, candleTime);
    }

    public static void botstateReset() {
        isConfirmingTrade = false;
        pendingAction = null;
        pendingSymbol = null;
        pendingEntry = 0;
        pendingTP = 0;
        pendingSL = 0;
        lowPendingTP = 0;
        lowPendingSL = 0;
        selectedRisk = "";
    }

 


    private static final Map<String, String> lastDirections = new HashMap<>();


    public static void updateSignal(String symbol, String timeframe, String direction, String timeframeAgain) {
        // עדכון כיוון אחרון לפי סימבול וטיימפריים
        updateLastSignalDirection(symbol, timeframe, direction);

        // עדכון כיוון כולל לפי הסימבול (למניעת סתירות כלליות)
        updateLastDirection(symbol, direction);

        // שמירת זמן עדכני כדי למנוע כפילויות
        long now = System.currentTimeMillis();
        updateLastSignal(symbol, timeframe, now);
    }

    
    
    public static void updateLastSignalDirection(String symbol, String timeframe, String direction) {
        lastDirections.put(symbol + ":" + timeframe, direction);
    }

    public static String getLastDirectionOtherTimeframes(String symbol, String currentTf) {
        for (String key : lastDirections.keySet()) {
            if (key.startsWith(symbol + ":") && !key.endsWith(":" + currentTf)) {
                return lastDirections.get(key);
            }
        }
        return null;
    }

	
}
