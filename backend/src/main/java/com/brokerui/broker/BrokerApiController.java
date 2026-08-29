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
  private final MarginLoanService marginLoanService;

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
      NNPredictorClient nnPredictorClient,
      MarginLoanService marginLoanService) {
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
    this.marginLoanService = marginLoanService;
  }

  private AppUser requireUser(Authentication auth) {
    if (auth == null || auth.getName() == null)
      throw new IllegalStateException("unauthorized");
    return userRepo.findByEmailIgnoreCase(auth.getName()).orElseThrow(() -> new IllegalStateException("unauthorized"));
  }

  private TradingAccount ensurePrimaryAccount(AppUser user) {
    TradingAccount existing = accountRepo.findFirstByUserIdOrderByIdAsc(user.getId()).orElse(null);
    if (existing != null)
      return existing;
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
    // Return live equity that includes unrealized PNL on all open positions
    BigDecimal liveEquity = recalcEquity(ta);
    BigDecimal marginLevel = marginLoanService.computeMarginLevel(ta);
    BigDecimal marginLevelPct = marginLevel == null ? null : marginLevel.multiply(BigDecimal.valueOf(100));
    BigDecimal marginUsed = computeMarginUsed(ta);
    // Prepaid-margin model: placeOrder already deducts margin from balance via
    // tryCoverShortfall, so remaining balance IS free cash. Subtracting marginUsed
    // again would double-count and understate freeMargin / block valid withdrawals.
    BigDecimal freeMargin = ta.getBalance();
    return ResponseEntity.ok(new BrokerOverviewDto(ta.getId(), ta.getAccountType(), ta.getCurrency(), ta.getLeverage(),
        ta.getBalance(), liveEquity, marginUsed, freeMargin,
        ta.getBorrowedBalance(), ta.getCreditLimit(), marginLevelPct, ta.getInterestAccruedTotal(),
        ta.getCommissionPaidTotal(), ta.getDailyInterestRate()));
  }

  @GetMapping("/symbols")
  public List<Symbol> symbols() {
    return symbolRepo.findByEnabledTrueOrderByKindAscCodeAsc();
  }

  @GetMapping("/positions")
  public ResponseEntity<?> positions(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(positionRepo.findByTradingAccountIdOrderByOpenedAtDescIdDesc(ta.getId()));
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
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId())
        .orElseGet(() -> ensurePrimaryAccount(u));

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
    if ("WITHDRAWAL".equals(type)) {
      // Balance already excludes margin prepaid into open positions / pending reserves,
      // so the whole cash balance is withdrawable — do NOT subtract marginUsed again.
      if (ta.getBalance().compareTo(amount) < 0) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "insufficient_funds"));
      }
      // If there's an outstanding credit-line debt, withdrawing cannot be allowed to push
      // the account straight into margin call — the collateral backing the loan must stay intact.
      BigDecimal levelAfter = marginLoanService.simulateMarginLevelAfterWithdrawal(ta, amount);
      if (levelAfter != null && levelAfter.compareTo(MarginLoanService.MARGIN_CALL_LEVEL) < 0) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "withdrawal_would_trigger_margin_call",
            "marginLevelAfterPct", levelAfter.multiply(BigDecimal.valueOf(100))));
      }
    }

    AccountTransaction tx = new AccountTransaction();
    tx.setTradingAccount(ta);
    tx.setTxType(type);
    tx.setAmount(amount);
    tx.setCurrency(ta.getCurrency());
    tx.setStatus("APPROVED");
    tx.setProcessedAt(Instant.now());
    txRepo.save(tx);

    if ("DEPOSIT".equals(type))
      ta.setBalance(ta.getBalance().add(amount));
    else
      ta.setBalance(ta.getBalance().subtract(amount));
    ta.setEquity(ta.getBalance());
    accountRepo.save(ta);

    auditLogService.log(u, type, type + " " + amount + " " + ta.getCurrency(), request);

    return ResponseEntity.ok(Map.of("ok", true, "newBalance", ta.getBalance()));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Equity for display / account bookkeeping: cash balance + live floating P/L on open
   * positions (prepaid-margin model — margin is already out of balance, so it is NOT
   * added back here). Matches the Dashboard formula. Distinct from
   * {@link MarginLoanService}'s collateral equity used for margin-call ratios.
   * Falls back to the last stored {@code unrealizedPnl} when a live quote is unavailable.
   */
  private BigDecimal recalcEquity(TradingAccount ta) {
    List<Position> positions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    BigDecimal totalUnrealized = BigDecimal.ZERO;
    for (Position p : positions) {
      try {
        double live = priceService.getLivePrice(p.getSymbolCode());
        if (live <= 0) {
          totalUnrealized = totalUnrealized.add(p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl());
          continue;
        }
        totalUnrealized = totalUnrealized.add(liveUnrealizedPnl(p, BigDecimal.valueOf(live)));
      } catch (Exception e) {
        totalUnrealized = totalUnrealized.add(p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl());
      }
    }
    return ta.getBalance().add(totalUnrealized);
  }

  /** Floating P/L for one position at {@code livePrice} (LONG/SHORT + contract size). */
  public static BigDecimal liveUnrealizedPnl(Position p, BigDecimal livePrice) {
    if (p == null || livePrice == null) return BigDecimal.ZERO;
    BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
    BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity().abs();
    BigDecimal contractSize = getContractSize(p.getSymbolCode());
    if ("SHORT".equals(p.getSide())) {
      return avg.subtract(livePrice).multiply(qty).multiply(contractSize);
    }
    return livePrice.subtract(avg).multiply(qty).multiply(contractSize);
  }

  /**
   * Margin currently locked into open positions (entry price basis, not live price), computed
   * fresh from the position table rather than trusted from the {@code marginUsed} column —
   * that column is only ever initialized to zero and never incremented/decremented as positions
   * open and close, so it would otherwise always read back as zero.
   */
  private BigDecimal computeMarginUsed(TradingAccount ta) {
    List<Position> positions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal used = BigDecimal.ZERO;
    for (Position p : positions) {
      BigDecimal contractSize = getContractSize(p.getSymbolCode());
      BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
      BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
      used = used.add(avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP));
    }
    return used;
  }

  /**
   * Calls the Neural Network predictor and sets routing fields on the order.
   * Returns true when the order should be routed to MT5 (external), false for
   * internal match.
   */
  private boolean applyNnRouting(BrokerOrder order, String symbolCode, BigDecimal qty, double price) {
    try {
      double buyQtyNorm = qty.doubleValue() / 100.0;
      double sellQtyNorm = 0.45;
      try {
        long activeSellQty = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW");
        if (activeSellQty > 0)
          sellQtyNorm = activeSellQty / 100.0;
      } catch (Exception ignored) {
      }

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
        if (buys + sells > 0)
          imbalance = (double) (buys - sells) / (buys + sells);
      } catch (Exception ignored) {
      }

      double midPriceNorm = Math.min(scaledPrice / 200.0, 1.0);
      double bookDepthBuy = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "BUY", "NEW") / 10.0;
      double bookDepthSell = orderRepo.countBySymbolCodeAndSideAndStatus(symbolCode, "SELL", "NEW") / 10.0;

      double[] features = { buyQtyNorm, sellQtyNorm, spreadNorm, imbalance,
          midPriceNorm, bookDepthBuy, bookDepthSell, 0.72 };

      java.util.Map<String, Object> pred = nnPredictorClient.getPrediction(features);
      if (pred != null) {
        double matchProb = ((Number) pred.get("matchProb")).doubleValue();
        double expectedSavings = ((Number) pred.get("expectedSavings")).doubleValue();
        double routeRecommendation = ((Number) pred.get("routeRecommendation")).doubleValue();
        order.setNnMatchProb(matchProb);
        order.setNnExpectedSavings(BigDecimal.valueOf(expectedSavings));
        order.setNnRouteRecommendation(routeRecommendation > 0.5 ? "INTERNAL" : "EXTERNAL");
        return routeRecommendation <= 0.5; // true = route external
      }
    } catch (Exception e) {
      System.err.println("Failed to fetch NN recommendation: " + e.getMessage());
    }
    order.setNnRouteRecommendation("EXTERNAL");
    order.setNnMatchProb(0.0);
    order.setNnExpectedSavings(BigDecimal.ZERO);
    return true;
  }

  /** Builds a FILLED BrokerOrder record for history/audit. */
  private BrokerOrder buildFilledOrder(TradingAccount ta, String symbolCode, String side,
      BigDecimal qty, BigDecimal fillPrice, BigDecimal realizedPnl) {
    BrokerOrder order = new BrokerOrder();
    order.setTradingAccount(ta);
    order.setSymbolCode(symbolCode);
    order.setSide(side);
    order.setOrderType("MARKET");
    order.setStatus("FILLED");
    order.setQuantity(qty);
    order.setFilledAt(Instant.now());
    order.setEntryPrice(fillPrice);
    order.setRealizedPnl(realizedPnl);
    return order;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Place Order (POST /api/broker/orders)
  // ───────────────────────────────────────────────────────────────────────────

  public record PlaceOrderRequest(String symbolCode, String side, String orderType,
      BigDecimal quantity, BigDecimal limitPrice, BigDecimal stopPrice,
      BigDecimal takeProfit, BigDecimal stopLoss, Boolean acceptLoan) {
  }

  @PostMapping("/orders")
  @Transactional
  public ResponseEntity<?> placeOrder(Authentication auth,
      @RequestBody PlaceOrderRequest body, HttpServletRequest request) {

    AppUser u = requireUser(auth);
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId())
        .orElseGet(() -> ensurePrimaryAccount(u));

    if (body.symbolCode() == null || body.side() == null || body.quantity() == null) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "missing_fields"));
    }
    String symbolCode = body.symbolCode().trim().toUpperCase();
    String side = body.side().trim().toUpperCase();
    String orderType = body.orderType() == null ? "MARKET" : body.orderType().trim().toUpperCase();
    BigDecimal qty = body.quantity();

    if (qty.compareTo(BigDecimal.ZERO) <= 0) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "invalid_quantity"));
    }

    // ── Pending (LIMIT / STOP) orders – basic validation + fund reservation ─
    if (!"MARKET".equals(orderType)) {
      double currentPrice;
      try {
        currentPrice = priceService.getLivePrice(symbolCode);
        if (currentPrice <= 0) {
          return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
        }
      } catch (Exception e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
      }
      BigDecimal bdPrice = BigDecimal.valueOf(currentPrice);

      BigDecimal targetPrice = body.limitPrice() != null ? body.limitPrice()
          : (body.stopPrice() != null ? body.stopPrice() : BigDecimal.ZERO);
      if (targetPrice.compareTo(BigDecimal.ZERO) <= 0) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "limit_price_required"));
      }

      // Classify into STOP or LIMIT dynamically based on relationship with current market price at creation:
      String mappedOrderType = "LIMIT";
      BigDecimal mappedLimitPrice = null;
      BigDecimal mappedStopPrice = null;

      if ("BUY".equals(side)) {
        if (targetPrice.compareTo(bdPrice) > 0) {
          mappedOrderType = "STOP";
          mappedStopPrice = targetPrice;
        } else {
          mappedOrderType = "LIMIT";
          mappedLimitPrice = targetPrice;
        }
      } else { // SELL
        if (targetPrice.compareTo(bdPrice) < 0) {
          mappedOrderType = "STOP";
          mappedStopPrice = targetPrice;
        } else {
          mappedOrderType = "LIMIT";
          mappedLimitPrice = targetPrice;
        }
      }

      BigDecimal contractSize = getContractSize(symbolCode);
      BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
      BigDecimal reserved = targetPrice.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      if (!marginLoanService.tryCoverShortfall(ta, reserved, u, request)) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "credit_limit_exceeded",
            "required", reserved, "available", ta.getBalance(), "creditLimit", ta.getCreditLimit()));
      }
      ta.setEquity(recalcEquity(ta));
      // Prepaid-margin model: remaining balance is free cash.
      ta.setFreeMargin(ta.getBalance());
      accountRepo.save(ta);

      BrokerOrder order = new BrokerOrder();
      order.setTradingAccount(ta);
      order.setSymbolCode(symbolCode);
      order.setSide(side);
      order.setOrderType(mappedOrderType);
      order.setStatus("NEW");
      order.setQuantity(qty);
      order.setLimitPrice(mappedLimitPrice);
      order.setStopPrice(mappedStopPrice);
      order.setTakeProfit(body.takeProfit());
      order.setStopLoss(body.stopLoss());
      order = orderRepo.save(order);
      auditLogService.log(u, "ORDER_PENDING", side + " " + qty + " " + symbolCode + " type=" + mappedOrderType, request);
      return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "status", "NEW",
          "newBalance", ta.getBalance()));
    }

    // ── MARKET order – fetch live price ──────────────────────────────────────
    double price;
    try {
      price = priceService.getLivePrice(symbolCode);
      if (price <= 0) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
      }
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
    }
    BigDecimal rawPrice = BigDecimal.valueOf(price);
    BigDecimal contractSize = getContractSize(symbolCode);
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);

    // ── BUY order ─────────────────────────────────────────────────────────────
    if ("BUY".equals(side)) {
      BigDecimal bdPrice = TradingFees.applySpread(rawPrice, true); // Client buys at Ask
      BigDecimal margin = bdPrice.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      
      BigDecimal commission = TradingFees.calculateCommission(symbolCode, qty, bdPrice);
      BigDecimal required = margin.add(commission);

      if (ta.getBalance().compareTo(required) < 0 && !Boolean.TRUE.equals(body.acceptLoan())) {
        BigDecimal shortfall = required.subtract(ta.getBalance());
        BigDecimal currentDebt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
        if (currentDebt.add(shortfall).compareTo(ta.getCreditLimit()) <= 0) {
          return ResponseEntity.badRequest().body(Map.of(
              "ok", false,
              "error", "credit_offer_available",
              "shortfall", shortfall,
              "required", required,
              "cashBalance", ta.getBalance(),
              "creditLimit", ta.getCreditLimit(),
              "dailyInterestRate", ta.getDailyInterestRate()
          ));
        }
      }

      if (!marginLoanService.tryCoverShortfall(ta, required, u, request)) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "credit_limit_exceeded",
            "required", required, "available", ta.getBalance(), "creditLimit", ta.getCreditLimit()));
      }

      Position longPos = openNewPosition(ta, symbolCode, "LONG", qty, bdPrice, body.takeProfit(), body.stopLoss());
      positionRepo.save(longPos);

      ta.setEquity(recalcEquity(ta));
      accountRepo.save(ta);

      try {
        Notification notif = new Notification();
        notif.setUser(u);
        notif.setNotifType("TRADE");
        notif.setTitle("notification.tradeOpened.title");
        notif.setBody(String.format(java.util.Locale.US, "{\"side\":\"BUY\",\"qty\":\"%.4f\",\"symbol\":\"%s\",\"price\":\"%.4f\"}", 
            qty.doubleValue(), symbolCode, bdPrice.doubleValue()));
        notificationRepo.save(notif);
      } catch (Exception e) {
        System.err.println("Failed to create notification: " + e.getMessage());
      }

      BrokerOrder order = buildFilledOrder(ta, symbolCode, "BUY", qty, bdPrice, null);
      TradingFees.charge(ta, order, commission);
      
      AccountTransaction feeTx = new AccountTransaction();
      feeTx.setTradingAccount(ta);
      feeTx.setTxType("COMMISSION");
      feeTx.setAmount(commission);
      feeTx.setCurrency(ta.getCurrency());
      feeTx.setStatus("APPROVED");
      feeTx.setProcessedAt(java.time.Instant.now());
      txRepo.save(feeTx);
      
      accountRepo.save(ta);
      boolean routeExternal = applyNnRouting(order, symbolCode, qty, price);
      orderRepo.save(order);

      auditLogService.log(u, "ORDER_PLACED",
          "BUY_LONG " + qty + " " + symbolCode + " @ " + bdPrice, request);

      if (routeExternal) {
        try {
          mt5Service.sendTrade(
              symbolCode, 
              side, 
              price, 
              body.takeProfit() != null ? body.takeProfit().doubleValue() : 0.0, 
              body.stopLoss() != null ? body.stopLoss().doubleValue() : 0.0, 
              qty.doubleValue()
          );
        } catch (Exception ex) {
          System.err.println("MT5 Send Failed: " + ex.getMessage());
        }
      } else {
        System.out.println("AI Advisor matching: Routed BUY_LONG #" + order.getId() + " internally.");
      }
      return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(),
          "fillPrice", bdPrice, "newBalance", ta.getBalance()));
    }

    // ── SELL order ────────────────────────────────────────────────────────────
    else if ("SELL".equals(side)) {
      BigDecimal bdPrice = TradingFees.applySpread(rawPrice, false); // Client sells at Bid
      BigDecimal margin = bdPrice.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      
      BigDecimal commission = TradingFees.calculateCommission(symbolCode, qty, bdPrice);
      BigDecimal sellRequired = margin.add(commission);

    if (ta.getBalance().compareTo(sellRequired) < 0 && !Boolean.TRUE.equals(body.acceptLoan())) {
      BigDecimal shortfall = sellRequired.subtract(ta.getBalance());
      BigDecimal currentDebt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
      if (currentDebt.add(shortfall).compareTo(ta.getCreditLimit()) <= 0) {
        return ResponseEntity.badRequest().body(Map.of(
            "ok", false,
            "error", "credit_offer_available",
            "shortfall", shortfall,
            "required", sellRequired,
            "cashBalance", ta.getBalance(),
            "creditLimit", ta.getCreditLimit(),
            "dailyInterestRate", ta.getDailyInterestRate()
        ));
      }
    }

    if (!marginLoanService.tryCoverShortfall(ta, sellRequired, u, request)) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "credit_limit_exceeded",
          "required", sellRequired, "available", ta.getBalance(), "creditLimit", ta.getCreditLimit()));
    }

    Position shortPos = openNewPosition(ta, symbolCode, "SHORT", qty, bdPrice, body.takeProfit(), body.stopLoss());
    positionRepo.save(shortPos);

    ta.setEquity(recalcEquity(ta));
    accountRepo.save(ta);

    try {
      Notification notif = new Notification();
      notif.setUser(u);
      notif.setNotifType("TRADE");
      notif.setTitle("notification.tradeOpened.title");
      notif.setBody(String.format(java.util.Locale.US, "{\"side\":\"SELL\",\"qty\":\"%.4f\",\"symbol\":\"%s\",\"price\":\"%.4f\"}", 
          qty.doubleValue(), symbolCode, bdPrice.doubleValue()));
      notificationRepo.save(notif);
    } catch (Exception e) {
      System.err.println("Failed to create notification: " + e.getMessage());
    }

    BrokerOrder order = buildFilledOrder(ta, symbolCode, "SELL", qty, bdPrice, null);
    TradingFees.charge(ta, order, commission);
    
    AccountTransaction feeTx = new AccountTransaction();
    feeTx.setTradingAccount(ta);
    feeTx.setTxType("COMMISSION");
    feeTx.setAmount(commission);
    feeTx.setCurrency(ta.getCurrency());
    feeTx.setStatus("APPROVED");
    feeTx.setProcessedAt(java.time.Instant.now());
    txRepo.save(feeTx);
    
    accountRepo.save(ta);
    boolean routeExternal = applyNnRouting(order, symbolCode, qty, price);
    orderRepo.save(order);

    auditLogService.log(u, "ORDER_PLACED",
        "SELL_SHORT " + qty + " " + symbolCode + " @ " + bdPrice, request);

    if (routeExternal) {
      try {
        mt5Service.sendTrade(
            symbolCode, 
            side, 
            price, 
            body.takeProfit() != null ? body.takeProfit().doubleValue() : 0.0, 
            body.stopLoss() != null ? body.stopLoss().doubleValue() : 0.0, 
            qty.doubleValue()
        );
      } catch (Exception ex) {
        System.err.println("MT5 Send Failed: " + ex.getMessage());
      }
    } else {
      System.out.println("AI Advisor matching: Routed SELL_SHORT #" + order.getId() + " internally.");
    }
    return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(),
        "fillPrice", bdPrice, "newBalance", ta.getBalance()));
    }
    return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "unsupported_side"));
  }

  /**
   * Creates a new Position for a specific side (Hedging model).
   */
  private Position openNewPosition(TradingAccount ta, String symbolCode, String side, BigDecimal qty, BigDecimal fillPrice, BigDecimal tp, BigDecimal sl) {
    Position pos = new Position();
    pos.setTradingAccount(ta);
    pos.setSymbolCode(symbolCode);
    pos.setSide(side);
    pos.setQuantity(qty);
    pos.setAvgPrice(fillPrice);
    pos.setUnrealizedPnl(BigDecimal.ZERO);
    pos.setOpenedAt(Instant.now());
    pos.setTakeProfit(tp);
    pos.setStopLoss(sl);
    return pos;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Close full position (POST /api/broker/positions/{id}/close)
  // ───────────────────────────────────────────────────────────────────────────

  @PostMapping("/positions/{id}/close")
  @Transactional
  public ResponseEntity<?> closePosition(Authentication auth,
      @PathVariable Long id, HttpServletRequest request) {
    AppUser u = requireUser(auth);
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId())
        .orElseGet(() -> ensurePrimaryAccount(u));
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
    BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
    boolean isShort = "SHORT".equals(pos.getSide());

    BigDecimal contractSize = getContractSize(pos.getSymbolCode());
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal marginReturned = avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);

    BigDecimal grossPnl;
    if (isShort) {
      // SHORT close: profit = (avgEntry - closePrice) * qty * contractSize
      grossPnl = avg.subtract(bdPrice).multiply(qty).multiply(contractSize);
    } else {
      // LONG close: profit = (closePrice - avgEntry) * qty * contractSize
      grossPnl = bdPrice.subtract(avg).multiply(qty).multiply(contractSize);
    }
    String closeSide = isShort ? "BUY" : "SELL";

    BigDecimal openCommission = TradingFees.calculateCommission(pos.getSymbolCode(), qty, avg);
    BigDecimal closeCommission = TradingFees.calculateCommission(pos.getSymbolCode(), qty, bdPrice);
    closeCommission = TradingFees.applyProfitSafetyGuard(openCommission, closeCommission, grossPnl);
    BigDecimal totalFees = openCommission.add(closeCommission);
    BigDecimal netPnl = grossPnl.subtract(totalFees);

    BrokerOrder order = buildFilledOrder(ta, pos.getSymbolCode(), closeSide, qty, bdPrice, netPnl);
    order.setOpenPrice(pos.getAvgPrice());
    order.setOpenedAt(pos.getOpenedAt());
    TradingFees.charge(ta, order, closeCommission);

    AccountTransaction closeFeeTx = new AccountTransaction();
    closeFeeTx.setTradingAccount(ta);
    closeFeeTx.setTxType("COMMISSION");
    closeFeeTx.setAmount(closeCommission);
    closeFeeTx.setCurrency(ta.getCurrency());
    closeFeeTx.setStatus("APPROVED");
    closeFeeTx.setProcessedAt(Instant.now());
    txRepo.save(closeFeeTx);

    marginLoanService.repaySettlementOrBorrow(ta, marginReturned.add(grossPnl).subtract(order.getCommission()));

    positionRepo.delete(pos);
    ta.setEquity(recalcEquity(ta));
    // Prepaid-margin model: remaining balance is free cash.
    ta.setFreeMargin(ta.getBalance());
    accountRepo.save(ta);

    // Record permanent transaction in database memory
    AccountTransaction tx = new AccountTransaction();
    tx.setTradingAccount(ta);
    tx.setTxType("TRADE_CLOSE");
    tx.setStatus("COMPLETED");
    tx.setAmount(netPnl);
    tx.setMethod("SYSTEM");
    tx.setNote("Closed position " + pos.getSymbolCode() + " " + pos.getSide() + " qty=" + qty + " Net PnL=" + netPnl + " (Gross: " + grossPnl + ", Fees: " + totalFees + ")");
    txRepo.save(tx);

    try {
      Notification notif = new Notification();
      notif.setUser(u);
      notif.setNotifType("TRADE");
      notif.setTitle("notification.tradeClosed.title");
      notif.setBody(String.format(java.util.Locale.US, "{\"side\":\"%s\",\"qty\":\"%.4f\",\"symbol\":\"%s\",\"price\":\"%.4f\",\"pnl\":\"%.2f\"}", 
          pos.getSide(), qty.doubleValue(), pos.getSymbolCode(), bdPrice.doubleValue(), netPnl.doubleValue()));
      notificationRepo.save(notif);
    } catch (Exception e) {
      System.err.println("Failed to create notification: " + e.getMessage());
    }

    // Record order history
    orderRepo.save(order);

    auditLogService.log(u, "POSITION_CLOSED",
        (isShort ? "SHORT" : "LONG") + " " + pos.getSymbolCode() +
            " qty=" + qty + " @ " + bdPrice + " pnl=" + netPnl,
        request);

    // Forward to MT5
    try {
      mt5Service.sendTrade(pos.getSymbolCode(), closeSide, price, 0, 0, qty.doubleValue());
    } catch (Exception ex) {
      System.err.println("MT5 Send Failed: " + ex.getMessage());
    }

    return ResponseEntity.ok(Map.of("ok", true, "closePnl", netPnl, "commission", order.getCommission(), "newBalance", ta.getBalance()));
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
    // Lock order FIRST, then account — same order as OrderExecutionService.tryExecute,
    // so a fill and a cancel cannot both pass the NEW check and settle the reservation.
    BrokerOrder order = orderRepo.findByIdForUpdate(id).orElse(null);
    if (order == null) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("ok", false, "error", "order_not_found"));
    }
    TradingAccount owned = ensurePrimaryAccount(u);
    if (order.getTradingAccount() == null || !order.getTradingAccount().getId().equals(owned.getId())) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("ok", false, "error", "order_not_found"));
    }
    if (!"NEW".equalsIgnoreCase(order.getStatus())) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "order_not_cancellable"));
    }
    TradingAccount ta = accountRepo.findByIdForUpdate(owned.getId()).orElseThrow();
    // Refund reserved balance for BUY and SELL orders
    if ("BUY".equalsIgnoreCase(order.getSide()) || "SELL".equalsIgnoreCase(order.getSide())) {
      BigDecimal reservePrice = order.getLimitPrice() != null ? order.getLimitPrice()
          : (order.getStopPrice() != null ? order.getStopPrice() : BigDecimal.ZERO);
      if (reservePrice.compareTo(BigDecimal.ZERO) > 0) {
        BigDecimal contractSize = getContractSize(order.getSymbolCode());
        BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
        BigDecimal refund = reservePrice.multiply(order.getQuantity()).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
        marginLoanService.repaySettlementOrBorrow(ta, refund);
        ta.setEquity(ta.getBalance());
        // Prepaid-margin model: free cash is the remaining balance (margin already deducted).
        ta.setFreeMargin(ta.getBalance());
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

  /**
   * Helper to retrieve the standard contract size multiplier for a given asset.
   *
   * @param symbol asset symbol code
   * @returns contract size multiplier
   */
  public static BigDecimal getContractSize(String symbol) {
    if (symbol == null) return BigDecimal.ONE;
    String sym = symbol.toUpperCase();
    if (sym.contains("BTC")) return BigDecimal.ONE;
    if (sym.contains("ETH")) return BigDecimal.ONE;
    if (sym.contains("SOL")) return BigDecimal.valueOf(100);
    if (sym.contains("XRP")) return BigDecimal.valueOf(1000);
    if (sym.contains("XAU")) return BigDecimal.valueOf(100);
    if (sym.contains("XAG")) return BigDecimal.valueOf(5000);
    return BigDecimal.valueOf(100000);
  }
}
