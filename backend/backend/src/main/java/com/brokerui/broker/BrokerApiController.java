package com.brokerui.broker;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/broker")
public class BrokerApiController {
  private final AppUserRepository userRepo;
  private final TradingAccountRepository accountRepo;
  private final SymbolRepository symbolRepo;
  private final PositionRepository positionRepo;
  private final BrokerOrderRepository orderRepo;
  private final TradeFillRepository fillRepo;
  private final AccountTransactionRepository txRepo;
  private final NotificationRepository notificationRepo;
  private final KycCaseRepository kycRepo;
  private final UserPreferenceRepository preferenceRepo;
  private final MT5IntegrationService mt5Service;
  private final com.brokerui.market.MarketPriceService priceService;
  private final AuditLogService auditLogService;
  private final NNPredictorClient nnPredictorClient;

  public BrokerApiController(
      AppUserRepository userRepo,
      TradingAccountRepository accountRepo,
      SymbolRepository symbolRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      TradeFillRepository fillRepo,
      AccountTransactionRepository txRepo,
      NotificationRepository notificationRepo,
      KycCaseRepository kycRepo,
      UserPreferenceRepository preferenceRepo,
      MT5IntegrationService mt5Service,
      com.brokerui.market.MarketPriceService priceService,
      AuditLogService auditLogService,
      NNPredictorClient nnPredictorClient) {
    this.userRepo = userRepo;
    this.accountRepo = accountRepo;
    this.symbolRepo = symbolRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.fillRepo = fillRepo;
    this.txRepo = txRepo;
    this.notificationRepo = notificationRepo;
    this.kycRepo = kycRepo;
    this.preferenceRepo = preferenceRepo;
    this.mt5Service = mt5Service;
    this.priceService = priceService;
    this.auditLogService = auditLogService;
    this.nnPredictorClient = nnPredictorClient;
  }

  private AppUser requireUser(Authentication auth) {
    if (auth == null || auth.getName() == null) throw new IllegalStateException("unauthorized");
    return userRepo.findByEmailIgnoreCase(auth.getName()).orElseThrow(() -> new IllegalStateException("unauthorized"));
  }

  private TradingAccount ensurePrimaryAccount(AppUser user) {
    TradingAccount existing = accountRepo.findFirstByUserIdOrderByIdAsc(user.getId()).orElse(null);
    if (existing != null) return existing;
    TradingAccount ta = new TradingAccount();
    ta.setUser(user);
    ta.setAccountType("DEMO");
    ta.setCurrency("USD");
    ta.setLeverage(100);
    ta.setStatus("ACTIVE");
    ta.setBalance(new BigDecimal("100000"));
    ta.setEquity(new BigDecimal("100000"));
    ta.setMarginUsed(BigDecimal.ZERO);
    ta.setFreeMargin(new BigDecimal("100000"));
    return accountRepo.save(ta);
  }

  @GetMapping("/overview")
  public ResponseEntity<?> overview(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(new BrokerOverviewDto(ta.getId(), ta.getAccountType(), ta.getCurrency(), ta.getLeverage(), ta.getBalance(), ta.getEquity(), ta.getMarginUsed(), ta.getFreeMargin()));
  }

  @GetMapping("/symbols")
  public List<Symbol> symbols() {
    return symbolRepo.findByEnabledTrueOrderByKindAscCodeAsc();
  }

  @GetMapping("/positions")
  public ResponseEntity<?> positions(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId()));
  }

  @GetMapping("/orders")
  public ResponseEntity<?> orders(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(orderRepo.findByTradingAccountIdOrderByCreatedAtDesc(ta.getId()));
  }

  @GetMapping("/transactions")
  public ResponseEntity<?> transactions(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(txRepo.findByTradingAccountIdOrderByCreatedAtDesc(ta.getId()));
  }

  private static final java.util.Set<String> ALLOWED_TX_TYPES = java.util.Set.of("DEPOSIT", "WITHDRAWAL");

  @PostMapping("/transactions")
  @Transactional
  public ResponseEntity<?> createTransaction(Authentication auth,
      @RequestBody Map<String, Object> body, HttpServletRequest request) {
    AppUser u = requireUser(auth);
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId()).orElseGet(() -> ensurePrimaryAccount(u));

    Object rawType = body.get("txType");
    Object rawAmount = body.get("amount");
    if (rawType == null || rawAmount == null) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "missing_fields"));
    }
    String type;
    BigDecimal amount;
    try {
      type = String.valueOf(rawType).toUpperCase();
      amount = new BigDecimal(String.valueOf(rawAmount));
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "invalid_fields"));
    }
    if (!ALLOWED_TX_TYPES.contains(type)) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "invalid_tx_type"));
    }
    if (amount.compareTo(BigDecimal.ZERO) <= 0) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "amount_must_be_positive"));
    }
    if ("WITHDRAWAL".equals(type) && ta.getBalance().compareTo(amount) < 0) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "insufficient_funds"));
    }

    AccountTransaction tx = new AccountTransaction();
    tx.setTradingAccount(ta);
    tx.setTxType(type);
    tx.setAmount(amount);
    tx.setCurrency(ta.getCurrency());
    tx.setStatus("APPROVED");
    tx.setProcessedAt(Instant.now());
    txRepo.save(tx);

    if ("DEPOSIT".equals(type)) ta.setBalance(ta.getBalance().add(amount));
    else ta.setBalance(ta.getBalance().subtract(amount));
    ta.setEquity(ta.getBalance());
    accountRepo.save(ta);

    auditLogService.log(u, type, type + " " + amount + " " + ta.getCurrency(), request);

    return ResponseEntity.ok(Map.of("ok", true, "newBalance", ta.getBalance()));
  }

  public record PlaceOrderRequest(String symbolCode, String side, String orderType, BigDecimal quantity, BigDecimal limitPrice, BigDecimal stopPrice) {}

  @PostMapping("/orders")
  @Transactional
  public ResponseEntity<?> placeOrder(Authentication auth,
      @RequestBody PlaceOrderRequest body, HttpServletRequest request) {
    AppUser u = requireUser(auth);
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId()).orElseGet(() -> ensurePrimaryAccount(u));

    String symbolCode = body.symbolCode().trim().toUpperCase();
    String side = body.side().trim().toUpperCase();
    String orderType = body.orderType() == null ? "MARKET" : body.orderType().trim().toUpperCase();
    BigDecimal qty = body.quantity();

    if (!"MARKET".equals(orderType)) {
      if ("BUY".equals(side)) {
        // Reserve funds at the limit/stop price (worst-case cost)
        BigDecimal reservePrice = body.limitPrice() != null ? body.limitPrice()
            : (body.stopPrice() != null ? body.stopPrice() : BigDecimal.ZERO);
        if (reservePrice.compareTo(BigDecimal.ZERO) <= 0) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "limit_price_required"));
        }
        BigDecimal reserved = reservePrice.multiply(qty);
        if (ta.getBalance().compareTo(reserved) < 0) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "insufficient_funds",
              "required", reserved, "available", ta.getBalance()));
        }
        ta.setBalance(ta.getBalance().subtract(reserved));
        ta.setEquity(ta.getBalance());
        ta.setFreeMargin(ta.getBalance().subtract(ta.getMarginUsed() == null ? BigDecimal.ZERO : ta.getMarginUsed()));
        accountRepo.save(ta);
      } else { // SELL limit/stop — verify position exists
        Position pos = positionRepo.findByTradingAccountIdAndSymbolCode(ta.getId(), symbolCode).orElse(null);
        if (pos == null) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "no_open_position"));
        }
        BigDecimal available = pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
        if (qty.compareTo(available) > 0) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "insufficient_position",
              "available", available));
        }
      }
      BrokerOrder order = new BrokerOrder();
      order.setTradingAccount(ta);
      order.setSymbolCode(symbolCode);
      order.setSide(side);
      order.setOrderType(orderType);
      order.setStatus("NEW");
      order.setQuantity(qty);
      order.setLimitPrice(body.limitPrice());
      order.setStopPrice(body.stopPrice());
      order = orderRepo.save(order);
      auditLogService.log(u, "ORDER_PENDING",
          side + " " + qty + " " + symbolCode + " type=" + orderType, request);
      return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "status", "NEW",
          "newBalance", ta.getBalance()));
    }

    // MARKET execution via MT5 or fallback API
    double price;
    try {
      price = priceService.getLivePrice(symbolCode);
      if (price <= 0) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
      }
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
    }

    BigDecimal bdPrice = BigDecimal.valueOf(price);
    BigDecimal notional = bdPrice.multiply(qty);

    if (body.symbolCode() == null || body.side() == null || body.quantity() == null) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "missing_fields"));
    }
    if (qty.compareTo(BigDecimal.ZERO) <= 0) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "invalid_quantity"));
    }

    if ("BUY".equals(side) && ta.getBalance().compareTo(notional) < 0) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "insufficient_funds"));
    }

    // Update local DB for immediate UI feedback – use locking query to prevent race conditions
    Position pos = positionRepo.findByTradingAccountIdAndSymbolCodeForUpdate(ta.getId(), symbolCode).orElse(null);

    if ("SELL".equals(side)) {
      if (pos == null) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "no_open_position"));
      }
      BigDecimal available = pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
      if (qty.compareTo(available) > 0) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "insufficient_position",
            "available", available, "requested", qty));
      }
    }

    if ("BUY".equals(side)) {
      ta.setBalance(ta.getBalance().subtract(notional));
      if (pos == null) {
        pos = new Position();
        pos.setTradingAccount(ta);
        pos.setSymbolCode(symbolCode);
        pos.setQuantity(BigDecimal.ZERO);
        pos.setOpenedAt(Instant.now());
      }
      BigDecimal prevQty = pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
      BigDecimal prevAvg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
      BigDecimal newQty = prevQty.add(qty);
      BigDecimal newAvg = prevQty.compareTo(BigDecimal.ZERO) == 0 ? bdPrice : 
          prevAvg.multiply(prevQty).add(bdPrice.multiply(qty)).divide(newQty, 8, RoundingMode.HALF_UP);
      pos.setQuantity(newQty);
      pos.setAvgPrice(newAvg);
      
      // Calculate exact PNL (which is exactly 0 for a brand new position right at entry price, but for adds it can be non-zero if price moved, actually we can just reset to zero based on current price being entry price)
      BigDecimal currentPrice = BigDecimal.valueOf(price);
      BigDecimal unrealized = currentPrice.subtract(newAvg).multiply(newQty);
      pos.setUnrealizedPnl(unrealized);

      positionRepo.save(pos);
    } else {
      // SELL — position existence and size already validated above
      ta.setBalance(ta.getBalance().add(notional));
      if (pos != null) {
        BigDecimal prevQty = pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
        BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();

        BigDecimal realizedDelta = bdPrice.subtract(avg).multiply(qty);
        BigDecimal realized = pos.getRealizedPnl() == null ? BigDecimal.ZERO : pos.getRealizedPnl();
        pos.setRealizedPnl(realized.add(realizedDelta));

        BigDecimal newQty = prevQty.subtract(qty);
        pos.setQuantity(newQty);
        pos.setUnrealizedPnl(bdPrice.subtract(avg).multiply(newQty));

        if (newQty.compareTo(BigDecimal.ZERO) <= 0) {
          positionRepo.delete(pos);
        } else {
          positionRepo.save(pos);
        }

        // Save realized P/L and avg open price on the order for history display
        BrokerOrder order = new BrokerOrder();
        order.setTradingAccount(ta);
        order.setSymbolCode(symbolCode);
        order.setSide(side);
        order.setOrderType("MARKET");
        order.setStatus("FILLED");
        order.setQuantity(qty);
        order.setFilledAt(Instant.now());
        order.setEntryPrice(bdPrice);
        order.setRealizedPnl(realizedDelta);

        // Call Neural Network Predictor for Routing Decision
        boolean routeExternal = true;
        try {
            double buyQtyNorm = qty.doubleValue() / 100.0;
            double sellQtyNorm = 0.45;
            try {
                long activeSellQty = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW");
                if (activeSellQty > 0) sellQtyNorm = activeSellQty / 100.0;
            } catch (Exception ignored) {}

            double scaledPrice = price;
            if (price > 0) {
                double log10 = Math.log10(price);
                long exp = Math.round(log10) - 2;
                scaledPrice = price / Math.pow(10, exp);
            }
            double spreadNorm = Math.min((scaledPrice * 0.00015) / 1.0, 1.0);

            double imbalance = 0.0;
            try {
                long buys = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "BUY", "NEW");
                long sells = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW");
                if (buys + sells > 0) {
                    imbalance = (double) (buys - sells) / (buys + sells);
                }
            } catch (Exception ignored) {}

            double midPriceNorm = Math.min(scaledPrice / 200.0, 1.0);

            double bookDepthBuy = 0.0;
            try {
                bookDepthBuy = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "BUY", "NEW") / 10.0;
            } catch (Exception ignored) {}

            double bookDepthSell = 0.0;
            try {
                bookDepthSell = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW") / 10.0;
            } catch (Exception ignored) {}

            double[] features = {
                buyQtyNorm, sellQtyNorm, spreadNorm, imbalance,
                midPriceNorm, bookDepthBuy, bookDepthSell, 0.72
            };

            java.util.Map<String, Object> pred = nnPredictorClient.getPrediction(features);
            if (pred != null) {
                double matchProb = ((Number) pred.get("matchProb")).doubleValue();
                double expectedSavings = ((Number) pred.get("expectedSavings")).doubleValue();
                double routeRecommendation = ((Number) pred.get("routeRecommendation")).doubleValue();

                order.setNnMatchProb(matchProb);
                order.setNnExpectedSavings(BigDecimal.valueOf(expectedSavings));
                order.setNnRouteRecommendation(routeRecommendation > 0.5 ? "INTERNAL" : "EXTERNAL");

                if (routeRecommendation > 0.5) {
                    routeExternal = false;
                }
            } else {
                order.setNnRouteRecommendation("EXTERNAL");
                order.setNnMatchProb(0.0);
                order.setNnExpectedSavings(BigDecimal.ZERO);
            }
        } catch (Exception e) {
            System.err.println("Failed to fetch NN recommendation: " + e.getMessage());
            order.setNnRouteRecommendation("EXTERNAL");
            order.setNnMatchProb(0.0);
            order.setNnExpectedSavings(BigDecimal.ZERO);
        }

        orderRepo.save(order);

        ta.setEquity(ta.getBalance());
        accountRepo.save(ta);

        auditLogService.log(u, "ORDER_PLACED",
            "SELL " + qty + " " + symbolCode + " @ " + bdPrice + " pnl=" + realizedDelta, request);

        if (routeExternal) {
            try { mt5Service.sendTrade(symbolCode, side, price, 0, 0, qty.doubleValue()); }
            catch (Exception ex) { System.err.println("MT5 Send Failed: " + ex.getMessage()); }
        } else {
            System.out.println("AI Advisor matching: Routed MARKET order #" + order.getId() + " internally. Skipped external MT5 routing.");
        }

        return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "fillPrice", bdPrice, "newBalance", ta.getBalance()));
      }
    }
    ta.setEquity(ta.getBalance());
    accountRepo.save(ta);

    BrokerOrder order = new BrokerOrder();
    order.setTradingAccount(ta);
    order.setSymbolCode(symbolCode);
    order.setSide(side);
    order.setOrderType("MARKET");
    order.setStatus("FILLED");
    order.setQuantity(qty);
    order.setFilledAt(Instant.now());
    order.setEntryPrice(bdPrice);

    // Call Neural Network Predictor for Routing Decision
    boolean routeExternal = true;
    try {
        double buyQtyNorm = qty.doubleValue() / 100.0;
        double sellQtyNorm = 0.45;
        try {
            long activeSellQty = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW");
            if (activeSellQty > 0) sellQtyNorm = activeSellQty / 100.0;
        } catch (Exception ignored) {}

        double scaledPrice = price;
        if (price > 0) {
            double log10 = Math.log10(price);
            long exp = Math.round(log10) - 2;
            scaledPrice = price / Math.pow(10, exp);
        }
        double spreadNorm = Math.min((scaledPrice * 0.00015) / 1.0, 1.0);

        double imbalance = 0.0;
        try {
            long buys = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "BUY", "NEW");
            long sells = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW");
            if (buys + sells > 0) {
                imbalance = (double) (buys - sells) / (buys + sells);
            }
        } catch (Exception ignored) {}

        double midPriceNorm = Math.min(scaledPrice / 200.0, 1.0);

        double bookDepthBuy = 0.0;
        try {
            bookDepthBuy = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "BUY", "NEW") / 10.0;
        } catch (Exception ignored) {}

        double bookDepthSell = 0.0;
        try {
            bookDepthSell = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW") / 10.0;
        } catch (Exception ignored) {}

        double[] features = {
            buyQtyNorm, sellQtyNorm, spreadNorm, imbalance,
            midPriceNorm, bookDepthBuy, bookDepthSell, 0.72
        };

        java.util.Map<String, Object> pred = nnPredictorClient.getPrediction(features);
        if (pred != null) {
            double matchProb = ((Number) pred.get("matchProb")).doubleValue();
            double expectedSavings = ((Number) pred.get("expectedSavings")).doubleValue();
            double routeRecommendation = ((Number) pred.get("routeRecommendation")).doubleValue();

            order.setNnMatchProb(matchProb);
            order.setNnExpectedSavings(BigDecimal.valueOf(expectedSavings));
            order.setNnRouteRecommendation(routeRecommendation > 0.5 ? "INTERNAL" : "EXTERNAL");

            if (routeRecommendation > 0.5) {
                routeExternal = false;
            }
        } else {
            order.setNnRouteRecommendation("EXTERNAL");
            order.setNnMatchProb(0.0);
            order.setNnExpectedSavings(BigDecimal.ZERO);
        }
    } catch (Exception e) {
        System.err.println("Failed to fetch NN recommendation: " + e.getMessage());
        order.setNnRouteRecommendation("EXTERNAL");
        order.setNnMatchProb(0.0);
        order.setNnExpectedSavings(BigDecimal.ZERO);
    }

    orderRepo.save(order);

    auditLogService.log(u, "ORDER_PLACED",
        "BUY " + qty + " " + symbolCode + " @ " + bdPrice, request);

    // Forward to MT5
    if (routeExternal) {
        try {
            mt5Service.sendTrade(symbolCode, side, price, 0, 0, qty.doubleValue());
        } catch (Exception ex) {
            System.err.println("MT5 Send Failed: " + ex.getMessage());
        }
    } else {
        System.out.println("AI Advisor matching: Routed MARKET order #" + order.getId() + " internally. Skipped external MT5 routing.");
    }

    return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "fillPrice", bdPrice, "newBalance", ta.getBalance()));
  }

  @PostMapping("/positions/{id}/close")
  @Transactional
  public ResponseEntity<?> closePosition(Authentication auth,
      @PathVariable Long id, HttpServletRequest request) {
    AppUser u = requireUser(auth);
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId()).orElseGet(() -> ensurePrimaryAccount(u));
    Position pos = positionRepo.findByIdForUpdate(id).orElse(null);
    if (pos == null || !pos.getTradingAccount().getId().equals(ta.getId())) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("ok", false, "error", "position_not_found"));
    }

    double price;
    try {
      price = priceService.getLivePrice(pos.getSymbolCode());
      if (price <= 0) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
      }
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
    }

    BigDecimal bdPrice = BigDecimal.valueOf(price);
    BigDecimal qty = pos.getQuantity();
    BigDecimal notional = bdPrice.multiply(qty);

    // Calculate PnL: (closePrice - avgEntryPrice) * qty
    BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
    BigDecimal pnl = bdPrice.subtract(avg).multiply(qty);

    // Add only the close notional (closePrice * qty).
    // pnl is already embedded: closePrice*qty = avgPrice*qty + pnl,
    // and avgPrice*qty was the original cost deducted on BUY.
    ta.setBalance(ta.getBalance().add(notional));
    ta.setEquity(ta.getBalance());
    accountRepo.save(ta);

    // Record order history
    BrokerOrder order = new BrokerOrder();
    order.setTradingAccount(ta);
    order.setSymbolCode(pos.getSymbolCode());
    order.setSide("SELL");
    order.setOrderType("MARKET");
    order.setStatus("FILLED");
    order.setQuantity(qty);
    order.setFilledAt(Instant.now());
    order.setEntryPrice(bdPrice);
    order.setRealizedPnl(pnl);
    orderRepo.save(order);

    positionRepo.delete(pos);

    auditLogService.log(u, "POSITION_CLOSED",
        pos.getSymbolCode() + " qty=" + qty + " @ " + bdPrice + " pnl=" + pnl, request);

    // Forward to MT5
    try {
      mt5Service.sendTrade(pos.getSymbolCode(), "SELL", price, 0, 0, qty.doubleValue());
    } catch (Exception ex) {
      System.err.println("MT5 Send Failed: " + ex.getMessage());
    }

    return ResponseEntity.ok(Map.of("ok", true, "closePnl", pnl, "newBalance", ta.getBalance()));
  }

  @GetMapping("/notifications")
  public ResponseEntity<?> notifications(Authentication auth) {
    AppUser u = requireUser(auth);
    return ResponseEntity.ok(notificationRepo.findTop20ByUserIdOrderByCreatedAtDesc(u.getId()));
  }

  @GetMapping("/preferences")
  public ResponseEntity<?> getPreferences(Authentication auth) {
    AppUser u = requireUser(auth);
    List<UserPreference> prefs = preferenceRepo.findByUser(u);
    Map<String, String> result = new java.util.LinkedHashMap<>();
    for (UserPreference p : prefs) {
      result.put(p.getPrefKey(), p.getPrefValue());
    }
    return ResponseEntity.ok(result);
  }

  @PostMapping("/preferences")
  @Transactional
  public ResponseEntity<?> savePreference(Authentication auth, @RequestBody Map<String, String> body) {
    AppUser u = requireUser(auth);
    for (Map.Entry<String, String> entry : body.entrySet()) {
      UserPreference pref = preferenceRepo.findByUserAndPrefKey(u, entry.getKey()).orElseGet(() -> {
        UserPreference p = new UserPreference();
        p.setUser(u);
        p.setPrefKey(entry.getKey());
        return p;
      });
      pref.setPrefValue(entry.getValue());
      preferenceRepo.save(pref);
    }
    return ResponseEntity.ok(Map.of("ok", true));
  }

  @GetMapping("/orders/pending")
  public ResponseEntity<?> pendingOrders(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(orderRepo.findByTradingAccountIdAndStatusOrderByCreatedAtDesc(ta.getId(), "NEW"));
  }

  @PostMapping("/orders/{id}/cancel")
  @Transactional
  public ResponseEntity<?> cancelOrder(Authentication auth, @PathVariable Long id) {
    AppUser u = requireUser(auth);
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId()).orElseThrow();
    BrokerOrder order = orderRepo.findById(id).orElse(null);
    if (order == null || !order.getTradingAccount().getId().equals(ta.getId())) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("ok", false, "error", "order_not_found"));
    }
    if (!"NEW".equalsIgnoreCase(order.getStatus())) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "order_not_cancellable"));
    }
    // Refund reserved balance for BUY orders
    if ("BUY".equalsIgnoreCase(order.getSide())) {
      BigDecimal reservePrice = order.getLimitPrice() != null ? order.getLimitPrice()
          : (order.getStopPrice() != null ? order.getStopPrice() : BigDecimal.ZERO);
      if (reservePrice.compareTo(BigDecimal.ZERO) > 0) {
        BigDecimal refund = reservePrice.multiply(order.getQuantity());
        ta.setBalance(ta.getBalance().add(refund));
        ta.setEquity(ta.getBalance());
        ta.setFreeMargin(ta.getBalance().subtract(ta.getMarginUsed() == null ? BigDecimal.ZERO : ta.getMarginUsed()));
        accountRepo.save(ta);
      }
    }
    order.setStatus("CANCELLED");
    orderRepo.save(order);
    return ResponseEntity.ok(Map.of("ok", true, "newBalance", ta.getBalance()));
  }

  @GetMapping("/history")
  public ResponseEntity<?> history(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(orderRepo.findByTradingAccountIdAndStatusOrderByFilledAtDesc(ta.getId(), "FILLED"));
  }
}
