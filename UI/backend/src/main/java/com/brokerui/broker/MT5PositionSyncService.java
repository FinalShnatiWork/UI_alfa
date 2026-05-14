package com.brokerui.broker;

import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Service
public class MT5PositionSyncService {

    private final MT5IntegrationService mt5Service;
    private final PositionRepository positionRepo;
    private final TradingAccountRepository accountRepo;

    public MT5PositionSyncService(MT5IntegrationService mt5Service, PositionRepository positionRepo, TradingAccountRepository accountRepo) {
        this.mt5Service = mt5Service;
        this.positionRepo = positionRepo;
        this.accountRepo = accountRepo;
    }

    @Scheduled(fixedDelay = 10000) // Every 10 seconds
    @Transactional
    public void sync() {
        if (!mt5Service.isConfigured()) return; // MT5_BASE_PATH not set — skip silently
        try {
            JSONArray mt5Positions = mt5Service.getOpenPositions();
            if (mt5Positions == null) return;

            // For the purpose of this project, we sync the first active account (Demo Account)
            Optional<TradingAccount> taOpt = accountRepo.findAll().stream().findFirst();
            if (taOpt.isEmpty()) return;
            TradingAccount ta = taOpt.get();

            // Clear existing local positions to stay in sync with MT5 source of truth
            List<Position> localPositions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
            
            // We'll update or create based on MT5 data
            // To keep it simple: we match by symbol. 
            // In a real system, we'd match by Ticket ID.
            
            for (int i = 0; i < mt5Positions.length(); i++) {
                JSONObject p = mt5Positions.getJSONObject(i);
                String mt5Symbol = p.getString("symbol");
                // Remove suffix ".m" for local matching
                String symbol = mt5Symbol.endsWith(".m") ? mt5Symbol.substring(0, mt5Symbol.length() - 2) : mt5Symbol;
                
                double volume = p.getDouble("volume");
                double priceOpen = p.getDouble("priceOpen");
                int type = p.getInt("type"); // 0 = Buy, 1 = Sell

                Position pos = positionRepo.findByTradingAccountIdAndSymbolCode(ta.getId(), symbol)
                        .orElse(new Position());
                
                pos.setTradingAccount(ta);
                pos.setSymbolCode(symbol);
                pos.setQuantity(BigDecimal.valueOf(type == 0 ? volume : -volume));
                pos.setAvgPrice(BigDecimal.valueOf(priceOpen));
                positionRepo.save(pos);
            }

            // Remove local positions that are no longer in MT5
            for (Position lp : localPositions) {
                boolean found = false;
                for (int i = 0; i < mt5Positions.length(); i++) {
                    String mt5Symbol = mt5Positions.getJSONObject(i).getString("symbol");
                    String cleanSymbol = mt5Symbol.endsWith(".m") ? mt5Symbol.substring(0, mt5Symbol.length() - 2) : mt5Symbol;
                    if (cleanSymbol.equals(lp.getSymbolCode())) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    positionRepo.delete(lp);
                }
            }

        } catch (Exception e) {
            System.err.println("[MT5 Sync] Error syncing positions: " + e.getMessage());
        }
    }
}
