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
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(BrokerApiController.class);
  private final AppUserRepository userRepo;
  private final TradingAccountRepository accountRepo;
  private final SymbolRepository symbolRepo;
  private final PositionRepository positionRepo;
  private final BrokerOrderRepository orderRepo;
  private final AccountTransactionRepository txRepo;
  private final NotificationRepository notificationRepo;
  private final UserPreferenceRepository preferenceRepo;
  private final MT5IntegrationService mt5Service;
  private final com.brokerui.market.MarketPriceService priceService;
  private final AuditLogService auditLogService;
  private final NNPredictorClient nnPredictorClient;
  private final MarginLoanService marginLoanService;
  private final MarginLoanLedgerRepository ledgerRepo;

  public BrokerApiController(
      AppUserRepository userRepo,
      TradingAccountRepository accountRepo,
      SymbolRepository symbolRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      AccountTransactionRepository txRepo,
      NotificationRepository notificationRepo,
      UserPreferenceRepository preferenceRepo,
      MT5IntegrationService mt5Service,
      com.brokerui.market.MarketPriceService priceService,
      AuditLogService auditLogService,
      NNPredictorClient nnPredictorClient,
      MarginLoanService marginLoanService,
      MarginLoanLedgerRepository ledgerRepo) {
    this.userRepo = userRepo;
    this.accountRepo = accountRepo;
    this.symbolRepo = symbolRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.txRepo = txRepo;
    this.notificationRepo = notificationRepo;
    this.preferenceRepo = preferenceRepo;
    this.mt5Service = mt5Service;
    this.priceService = priceService;
    this.auditLogService = auditLogService;
    this.nnPredictorClient = nnPredictorClient;
    this.marginLoanService = marginLoanService;
    this.ledgerRepo = ledgerRepo;
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
    // GET endpoints run in read-only transactions; a brand-new user's first GET (e.g. /overview)
    // used to fail with "cannot execute INSERT in a read-only transaction". Create it in its own
    // short read-write transaction instead.
    if (txManager != null
        && org.springframework.transaction.support.TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
      org.springframework.transaction.support.TransactionTemplate rw =
          new org.springframework.transaction.support.TransactionTemplate(txManager);
      rw.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
      Long id = rw.execute(s -> accountRepo.findFirstByUserIdOrderByIdAsc(user.getId())
          .orElseGet(() -> createPrimaryAccount(user)).getId());
      return accountRepo.findById(id).orElseThrow();
    }
    return createPrimaryAccount(user);
  }

  private TradingAccount createPrimaryAccount(AppUser user) {
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

  @Transactional(readOnly = true)@GetMapping("/overview")
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

  @Transactional(readOnly = true)@GetMapping("/symbols")
  public List<Symbol> symbols() {
    return symbolRepo.findByEnabledTrueOrderByKindAscCodeAsc();
  }

  @Transactional(readOnly = true)@GetMapping("/positions")
  public ResponseEntity<?> positions(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(positionRepo.findByTradingAccountIdOrderByOpenedAtDescIdDesc(ta.getId()));
  }

  @Transactional(readOnly = true)@GetMapping("/orders")
  public ResponseEntity<?> orders(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(orderRepo.findByTradingAccountIdOrderByCreatedAtDesc(ta.getId()));
  }

  @Transactional(readOnly = true)@GetMapping("/transactions")
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
    Object rawMethod = body.get("method");
    if (rawMethod != null) {
      String method = String.valueOf(rawMethod).trim();
      if (method.length() > 32) method = method.substring(0, 32);
      if (!method.isEmpty()) tx.setMethod(method);
    }
    Object rawNote = body.get("note");
    if (rawNote != null) {
      String note = String.valueOf(rawNote).trim();
      if (note.length() > 2000) note = note.substring(0, 2000);
      if (!note.isEmpty()) tx.setNote(note);
    }
    txRepo.save(tx);

    if ("DEPOSIT".equals(type))
      ta.setBalance(ta.getBalance().add(amount));
    else
      ta.setBalance(ta.getBalance().subtract(amount));
    // Equity is balance + floating P/L everywhere else; writing bare cash here made the
    // stored column disagree with the account's real value until the next trade.
    ta.setEquity(recalcEquity(ta));
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

  /**
   * @param strictLimit optional (netting tests / API clients): keep an explicit LIMIT as a LIMIT even
   *                    when it is marketable, instead of the UI's automatic LIMIT→STOP re-classification.
   *                    The React UI never sends it, so its behaviour is unchanged.
   */
  public record PlaceOrderRequest(String symbolCode, String side, String orderType,
      BigDecimal quantity, BigDecimal limitPrice, BigDecimal stopPrice,
      BigDecimal takeProfit, BigDecimal stopLoss, Boolean acceptLoan, Boolean strictLimit) {
  }

  /** Result of the placement transaction: either a finished response, or an order to execute next. */
  private record Placement(ResponseEntity<?> response, Long executeOrderId, String auditAction) {}

  @PostMapping("/orders")
  public ResponseEntity<?> placeOrder(Authentication auth,
      @RequestBody PlaceOrderRequest body, HttpServletRequest request) {
    // Phase 1 (own transaction): validate, reserve cash, store the order. Committing here releases
    // the account lock before netting locks accounts in id order (plan R1: no deadlocks).
    Placement placement = inTransaction(() -> reserveAndStore(auth, body, request));
    if (placement.executeOrderId() == null) {
      return placement.response();
    }
    // Phase 2 (NettingService's own transaction): internal book first, then the remainder.
    if (nettingService == null) {
      throw new IllegalStateException("NettingService is not available");
    }
    com.brokerui.broker.netting.NettingService.Result r = nettingService.executeNow(placement.executeOrderId());
    AppUser u = requireUser(auth);
    if ("REJECTED".equals(r.status())) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "credit_limit_exceeded",
          "orderId", r.orderId()));
    }
    auditLogService.log(u, placement.auditAction(),
        body.side().trim().toUpperCase() + " " + body.quantity() + " " + body.symbolCode().trim().toUpperCase()
            + " status=" + r.status() + " routing=" + r.routing() + " internal=" + r.internalQty()
            + " external=" + r.externalQty() + (r.avgPrice() != null ? " @ " + r.avgPrice() : ""),
        request);
    Map<String, Object> resp = new java.util.LinkedHashMap<>();
    resp.put("ok", true);
    resp.put("orderId", r.orderId());
    resp.put("status", r.status());
    if (r.avgPrice() != null) resp.put("fillPrice", r.avgPrice());
    resp.put("newBalance", r.newBalance());
    resp.put("routing", r.routing());
    resp.put("filledQty", r.filledQty());
    resp.put("internalQty", r.internalQty());
    resp.put("externalQty", r.externalQty());
    resp.put("matches", r.matches());
    return ResponseEntity.ok(resp);
  }

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private org.springframework.transaction.PlatformTransactionManager txManager;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  @org.springframework.context.annotation.Lazy
  private com.brokerui.broker.netting.NettingService nettingService;

  private <T> T inTransaction(java.util.function.Supplier<T> work) {
    if (txManager == null) return work.get(); // plain unit tests
    return new org.springframework.transaction.support.TransactionTemplate(txManager).execute(s -> work.get());
  }

  private Placement reserveAndStore(Authentication auth, PlaceOrderRequest body, HttpServletRequest request) {
    AppUser u = requireUser(auth);
    TradingAccount ta = accountRepo.findByIdForUpdate(ensurePrimaryAccount(u).getId())
        .orElseGet(() -> ensurePrimaryAccount(u));

    if (body.symbolCode() == null || body.side() == null || body.quantity() == null) {
      return done(ResponseEntity.badRequest().body(Map.of("ok", false, "error", "missing_fields")));
    }
    String symbolCode = body.symbolCode().trim().toUpperCase();
    String side = body.side().trim().toUpperCase();
    String orderType = body.orderType() == null ? "MARKET" : body.orderType().trim().toUpperCase();
    BigDecimal qty = body.quantity();

    if (qty.compareTo(BigDecimal.ZERO) <= 0) {
      return done(ResponseEntity.badRequest().body(Map.of("ok", false, "error", "invalid_quantity")));
    }

    // ── Pending (LIMIT / STOP) orders – basic validation + fund reservation ─
    if (!"MARKET".equals(orderType)) {
      double currentPrice;
      try {
        currentPrice = priceService.getLivePrice(symbolCode);
        if (currentPrice <= 0) {
          return done(ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable")));
        }
      } catch (Exception e) {
        return done(ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable")));
      }
      BigDecimal bdPrice = BigDecimal.valueOf(currentPrice);

      BigDecimal targetPrice = body.limitPrice() != null ? body.limitPrice()
          : (body.stopPrice() != null ? body.stopPrice() : BigDecimal.ZERO);
      if (targetPrice.compareTo(BigDecimal.ZERO) <= 0) {
        return done(ResponseEntity.badRequest().body(Map.of("ok", false, "error", "limit_price_required")));
      }

      // Classify into STOP or LIMIT dynamically based on relationship with current market price at creation:
      String mappedOrderType = "LIMIT";
      BigDecimal mappedLimitPrice = null;
      BigDecimal mappedStopPrice = null;
      boolean strictLimit = Boolean.TRUE.equals(body.strictLimit()) && "LIMIT".equals(orderType) && body.limitPrice() != null;

      if (strictLimit) {
        // Explicit LIMIT kept as LIMIT even when marketable (netting: it may cross internally at the mid).
        mappedLimitPrice = targetPrice;
      } else if ("BUY".equals(side)) {
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
        return done(ResponseEntity.badRequest().body(Map.of("ok", false, "error", "credit_limit_exceeded",
            "required", reserved, "available", ta.getBalance(), "creditLimit", ta.getCreditLimit())));
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
      order.setReserveRemaining(reserved);
      order = orderRepo.save(order);
      auditLogService.log(u, "ORDER_PENDING", side + " " + qty + " " + symbolCode + " type=" + mappedOrderType, request);
      if (strictLimit) {
        return new Placement(null, order.getId(), "ORDER_PLACED");
      }
      return done(ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "status", "NEW",
          "newBalance", ta.getBalance())));
    }

    // ── MARKET order – fetch live price ──────────────────────────────────────
    if (!"BUY".equals(side) && !"SELL".equals(side)) {
      return done(ResponseEntity.badRequest().body(Map.of("ok", false, "error", "unsupported_side")));
    }
    double price;
    try {
      price = priceService.getLivePrice(symbolCode);
      if (price <= 0) {
        return done(ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable")));
      }
    } catch (Exception e) {
      return done(ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable")));
    }
    BigDecimal rawPrice = BigDecimal.valueOf(price);
    BigDecimal contractSize = getContractSize(symbolCode);
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    boolean isBuy = "BUY".equals(side);

    // Worst case = the external price (BUY at Ask, SELL at Bid). Netting can only make it cheaper;
    // whatever is not used is returned by FillBooking when the order fills.
    BigDecimal bdPrice = TradingFees.applySpread(rawPrice, isBuy);
    BigDecimal margin = bdPrice.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
    BigDecimal commission = TradingFees.calculateCommission(symbolCode, qty, bdPrice);
    BigDecimal required = margin.add(commission);

    if (ta.getBalance().compareTo(required) < 0 && !Boolean.TRUE.equals(body.acceptLoan())) {
      BigDecimal shortfall = required.subtract(ta.getBalance());
      BigDecimal currentDebt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
      if (currentDebt.add(shortfall).compareTo(ta.getCreditLimit()) <= 0) {
        return done(ResponseEntity.badRequest().body(Map.of(
            "ok", false,
            "error", "credit_offer_available",
            "shortfall", shortfall,
            "required", required,
            "cashBalance", ta.getBalance(),
            "creditLimit", ta.getCreditLimit(),
            "dailyInterestRate", ta.getDailyInterestRate()
        )));
      }
    }

    if (!marginLoanService.tryCoverShortfall(ta, required, u, request)) {
      return done(ResponseEntity.badRequest().body(Map.of("ok", false, "error", "credit_limit_exceeded",
          "required", required, "available", ta.getBalance(), "creditLimit", ta.getCreditLimit())));
    }
    ta.setEquity(recalcEquity(ta));
    ta.setFreeMargin(ta.getBalance());
    accountRepo.save(ta);

    BrokerOrder order = new BrokerOrder();
    order.setTradingAccount(ta);
    order.setSymbolCode(symbolCode);
    order.setSide(side);
    order.setOrderType("MARKET");
    order.setStatus("NEW");
    order.setQuantity(qty);
    order.setTakeProfit(body.takeProfit());
    order.setStopLoss(body.stopLoss());
    order.setReserveRemaining(required);
    order = orderRepo.save(order);
    return new Placement(null, order.getId(), "ORDER_PLACED");
  }

  private static Placement done(ResponseEntity<?> response) {
    return new Placement(response, null, null);
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

    PositionCloseMath.Snapshot close = PositionCloseMath.compute(pos, ta, BigDecimal.valueOf(price));
    BigDecimal bdPrice = close.closePrice();
    BigDecimal qty = close.quantity();
    boolean isShort = close.shortPosition();
    String closeSide = close.closeSide();
    BigDecimal grossPnl = close.grossPnl();
    BigDecimal closeCommission = close.closeCommission();
    BigDecimal totalFees = close.totalFees();
    BigDecimal netPnl = close.netPnl();

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

    marginLoanService.repaySettlementOrBorrow(ta, close.settlement());

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
      log.warn("Failed to create notification: {}", e.getMessage());
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
      log.error("MT5 Send Failed: {}", ex.getMessage());
    }

    return ResponseEntity.ok(Map.of("ok", true, "closePnl", netPnl, "commission", order.getCommission(), "newBalance", ta.getBalance()));
  }

  @Transactional(readOnly = true)@GetMapping("/notifications")
  public ResponseEntity<?> notifications(Authentication auth) {
    AppUser u = requireUser(auth);
    return ResponseEntity.ok(notificationRepo.findTop20ByUserIdOrderByCreatedAtDesc(u.getId()));
  }

  @Transactional(readOnly = true)@GetMapping("/preferences")
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

  @Transactional(readOnly = true)@GetMapping("/orders/pending")
  public ResponseEntity<?> pendingOrders(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(orderRepo.findByTradingAccountIdAndStatusInOrderByCreatedAtDesc(ta.getId(),
        com.brokerui.broker.netting.NettingService.OPEN_STATUSES));
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
    String st = order.getStatus() == null ? "" : order.getStatus().toUpperCase();
    if (!com.brokerui.broker.netting.NettingService.OPEN_STATUSES.contains(st)) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "order_not_cancellable"));
    }
    TradingAccount ta = accountRepo.findByIdForUpdate(owned.getId()).orElseThrow();
    // Refund what is still reserved for the unfilled part (whole reserve if nothing filled yet).
    if ("BUY".equalsIgnoreCase(order.getSide()) || "SELL".equalsIgnoreCase(order.getSide())) {
      BigDecimal refund = com.brokerui.broker.netting.FillBooking.outstandingReserve(order, ta);
      if (refund.compareTo(BigDecimal.ZERO) > 0) {
        marginLoanService.repaySettlementOrBorrow(ta, refund);
        order.setReserveRemaining(BigDecimal.ZERO);
        ta.setEquity(recalcEquity(ta));
        // Prepaid-margin model: free cash is the remaining balance (margin already deducted).
        ta.setFreeMargin(ta.getBalance());
        accountRepo.save(ta);
      }
    }
    order.setStatus("CANCELLED");
    order.setNetDeadline(null);
    orderRepo.save(order);
    return ResponseEntity.ok(Map.of("ok", true, "newBalance", ta.getBalance()));
  }

  @Transactional(readOnly = true)@GetMapping("/history")
  public ResponseEntity<?> history(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(orderRepo.findByTradingAccountIdAndStatusOrderByFilledAtDesc(ta.getId(), "FILLED"));
  }

  @Transactional(readOnly = true)@GetMapping("/credit-ledger")
  public ResponseEntity<?> creditLedger(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(ledgerRepo.findByTradingAccountIdOrderByCreatedAtDesc(ta.getId()));
  }

  /**
   * Helper to retrieve the standard contract size multiplier for a given asset.
   *
   * @param symbol asset symbol code
   * @returns contract size multiplier
   */
  public static BigDecimal getContractSize(String symbol) {
    return ContractSpecs.getContractSize(symbol);
  }
}
