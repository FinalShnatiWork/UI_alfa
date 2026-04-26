package com.brokerui.broker;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/mt5-bridge")
public class MT5BridgeController {

    private final MT5BridgeService mt5Service;

    public MT5BridgeController(MT5BridgeService mt5Service) {
        this.mt5Service = mt5Service;
    }

    @GetMapping("/candles")
    public ResponseEntity<?> getCandles(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "1h") String timeframe,
            @RequestParam(defaultValue = "100") int count) {
        try {
            Candle[] candles = mt5Service.getCandles(symbol, timeframe, count);
            return ResponseEntity.ok(candles);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/trade")
    public ResponseEntity<?> trade(@RequestBody Map<String, Object> body) {
        String symbol = (String) body.get("symbol");
        String action = (String) body.get("action");
        double lot = Double.parseDouble(body.get("lot").toString());
        double tp = body.containsKey("tp") ? Double.parseDouble(body.get("tp").toString()) : 0;
        double sl = body.containsKey("sl") ? Double.parseDouble(body.get("sl").toString()) : 0;

        String result = mt5Service.executeTrade(symbol, action, lot, tp, sl);
        if (result.startsWith("SUCCESS")) {
            return ResponseEntity.ok(Map.of("message", result));
        } else {
            return ResponseEntity.status(500).body(Map.of("error", result));
        }
    }

    @GetMapping("/check-symbol")
    public ResponseEntity<?> checkSymbol(@RequestParam String symbol) {
        boolean available = mt5Service.isMT5Symbol(symbol);
        return ResponseEntity.ok(Map.of("symbol", symbol, "available_in_mt5", available));
    }
}
