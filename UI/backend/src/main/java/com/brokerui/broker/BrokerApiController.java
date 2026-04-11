package com.brokerui.broker;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.market.BinancePriceService;
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
  private final BinancePriceService binancePrices;
  private final MT5ConnectionManager mt5ConnectionManager;

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
      BinancePriceService binancePrices,
      MT5ConnectionManager mt5ConnectionManager) {
    this.userRepo = userRepo;
    this.accountRepo = accountRepo;
    this.symbolRepo = symbolRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.fillRepo = fillRepo;
    this.txRepo = txRepo;
    this.notificationRepo = notificationRepo;
    this.kycRepo = kycRepo;
    this.binancePrices = binancePrices;
    this.mt5ConnectionManager = mt5ConnectionManager;
  }

  private AppUser requireUser(Authentication auth) {
    if (auth == null || auth.getName() == null) {
      throw new IllegalStateException("unauthorized");
    }
    return userRepo
        .findByEmailIgnoreCase(auth.getName())
        .orElseThrow(() -> new IllegalStateException("unauthorized"));
  }

  private TradingAccount requirePrimaryAccount(Long userId) {
    return accountRepo.findFirstByUserIdOrderByIdAsc(userId).orElse(null);
  }

  private TradingAccount ensurePrimaryAccount(AppUser user) {
    TradingAccount existing = requirePrimaryAccount(user.getId());
    if (existing != null) {
      return existing;
    }

    // Demo-friendly: auto-provision a DEMO trading account for any user (including ADMIN)
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
    ta = accountRepo.save(ta);

    AccountTransaction tx = new AccountTransaction();
    tx.setTradingAccount(ta);
    tx.setTxType("DEPOSIT");
    tx.setStatus("APPROVED");
    tx.setAmount(new BigDecimal("100000"));
    tx.setCurrency(ta.getCurrency());
    tx.setMethod("internal");
    tx.setNote("Auto-provisioned demo balance");
    tx.setProcessedAt(Instant.now());
    txRepo.save(tx);

    return ta;
  }

  @GetMapping("/overview")
  public ResponseEntity<?> overview(Authentication auth) {
    try {
      AppUser u = requireUser(auth);
      TradingAccount ta = ensurePrimaryAccount(u);
      return ResponseEntity.ok(
          new BrokerOverviewDto(
              ta.getId(),
              ta.getAccountType(),
              ta.getCurrency(),
              ta.getLeverage(),
              ta.getBalance(),
              ta.getEquity(),
              ta.getMarginUsed(),
              ta.getFreeMargin()));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  @GetMapping("/symbols")
  public List<Symbol> symbols() {
    return symbolRepo.findByEnabledTrueOrderByKindAscCodeAsc();
  }

  @GetMapping("/positions")
  public ResponseEntity<?> positions(Authentication auth) {
    try {
      AppUser u = requireUser(auth);
      TradingAccount ta = ensurePrimaryAccount(u);
      return ResponseEntity.ok(positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId()));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  @GetMapping("/orders")
  public ResponseEntity<?> orders(Authentication auth) {
    try {
      AppUser u = requireUser(auth);
      TradingAccount ta = ensurePrimaryAccount(u);
      return ResponseEntity.ok(orderRepo.findByTradingAccountIdOrderByCreatedAtDesc(ta.getId()));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  @GetMapping("/transactions")
  public ResponseEntity<?> transactions(Authentication auth) {
    try {
      AppUser u = requireUser(auth);
      TradingAccount ta = ensurePrimaryAccount(u);
      return ResponseEntity.ok(txRepo.findByTradingAccountIdOrderByCreatedAtDesc(ta.getId()));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  public record CreateTransactionRequest(String txType, BigDecimal amount, String method, String note) {}

  @PostMapping("/transactions")
  public ResponseEntity<?> createTransaction(Authentication auth, @RequestBody CreateTransactionRequest body) {
    try {
      AppUser u = requireUser(auth);
      TradingAccount ta = ensurePrimaryAccount(u);
      if (body == null || body.txType() == null || body.amount() == null) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_request"));
      }
      String type = body.txType().trim().toUpperCase();
      if (!List.of("DEPOSIT", "WITHDRAWAL").contains(type)) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_tx_type"));
      }
      if (body.amount().compareTo(BigDecimal.ZERO) <= 0) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_amount"));
      }

      AccountTransaction tx = new AccountTransaction();
      tx.setTradingAccount(ta);
      tx.setTxType(type);
      tx.setStatus("PENDING");
      tx.setAmount(body.amount());
      tx.setCurrency(ta.getCurrency());
      tx.setMethod(body.method());
      tx.setNote(body.note());
      txRepo.save(tx);

      return ResponseEntity.ok(Map.of("ok", true, "id", tx.getId()));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  public record PlaceOrderRequest(
      String symbolCode, String side, String orderType, BigDecimal quantity, BigDecimal limitPrice, BigDecimal stopPrice) {}

  @PostMapping("/orders")
  @Transactional
  public ResponseEntity<?> placeOrder(Authentication auth, @RequestBody PlaceOrderRequest body) {
    try {
      AppUser u = requireUser(auth);
      TradingAccount ta = ensurePrimaryAccount(u);

      if (body == null || body.symbolCode() == null || body.side() == null || body.quantity() == null) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_request"));
      }

      String symbolCode = body.symbolCode().trim().toUpperCase();
      String side = body.side().trim().toUpperCase();
      String orderType = body.orderType() == null ? "MARKET" : body.orderType().trim().toUpperCase();
      BigDecimal qty = body.quantity();

      if (symbolCode.isEmpty()) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "symbol_required"));
      }
      if (!List.of("BUY", "SELL").contains(side)) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_side"));
      }
      if (!List.of("MARKET", "LIMIT", "STOP").contains(orderType)) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_order_type"));
      }
      if (qty.compareTo(BigDecimal.ZERO) <= 0) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_quantity"));
      }

      Symbol sym =
          symbolRepo
              .findByCode(symbolCode)
              .orElse(null);
      if (sym == null || !sym.isEnabled()) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(Map.of("ok", false, "error", "symbol_disabled"));
      }

      if (!"MARKET".equals(orderType)) {
        // Create NEW order; it will be filled by OrderExecutionService when trigger conditions met.
        if ("LIMIT".equals(orderType) && body.limitPrice() == null) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "limit_price_required"));
        }
        if ("STOP".equals(orderType) && body.stopPrice() == null) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "stop_price_required"));
        }
        if (body.limitPrice() != null && body.limitPrice().compareTo(BigDecimal.ZERO) <= 0) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_limit_price"));
        }
        if (body.stopPrice() != null && body.stopPrice().compareTo(BigDecimal.ZERO) <= 0) {
          return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "bad_stop_price"));
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
        return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "status", order.getStatus()));
      }

      // MARKET: execute immediately at current price.
      BigDecimal price;
      try {
        price = binancePrices.getLastPrice(symbolCode);
      } catch (Exception e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "price_unavailable"));
      }

      // Balance updates (SPOT model)
      BigDecimal notional = price.multiply(qty);
      BigDecimal balance = ta.getBalance() == null ? BigDecimal.ZERO : ta.getBalance();

      Position pos =
          positionRepo.findByTradingAccountIdAndSymbolCode(ta.getId(), symbolCode).orElse(null);

      if ("BUY".equals(side)) {
        if (balance.compareTo(notional) < 0) {
          return ResponseEntity.status(HttpStatus.BAD_REQUEST)
              .body(Map.of("ok", false, "error", "insufficient_funds"));
        }
        ta.setBalance(balance.subtract(notional));

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
        BigDecimal newAvg =
            prevQty.compareTo(BigDecimal.ZERO) == 0
                ? price
                : prevAvg.multiply(prevQty).add(price.multiply(qty)).divide(newQty, 8, RoundingMode.HALF_UP);
        pos.setQuantity(newQty);
        pos.setAvgPrice(newAvg);
        positionRepo.save(pos);
      } else { // SELL
        BigDecimal prevQty = pos == null || pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
        if (prevQty.compareTo(qty) < 0) {
          return ResponseEntity.status(HttpStatus.BAD_REQUEST)
              .body(Map.of("ok", false, "error", "insufficient_position"));
        }
        ta.setBalance(balance.add(notional));

        BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
        BigDecimal realizedDelta = price.subtract(avg).multiply(qty);
        BigDecimal realized = pos.getRealizedPnl() == null ? BigDecimal.ZERO : pos.getRealizedPnl();
        pos.setRealizedPnl(realized.add(realizedDelta));
        BigDecimal newQty = prevQty.subtract(qty);
        pos.setQuantity(newQty);
        if (newQty.compareTo(BigDecimal.ZERO) == 0) {
          pos.setAvgPrice(null);
        }
        positionRepo.save(pos);
      }

      // In this MVP, equity/free margin track balance.
      ta.setEquity(ta.getBalance());
      ta.setMarginUsed(BigDecimal.ZERO);
      ta.setFreeMargin(ta.getBalance());
      accountRepo.save(ta);

      BrokerOrder order = new BrokerOrder();
      order.setTradingAccount(ta);
      order.setSymbolCode(symbolCode);
      order.setSide(side);
      order.setOrderType("MARKET");
      order.setStatus("FILLED");
      order.setQuantity(qty);
      order.setFilledAt(Instant.now());
      order = orderRepo.save(order);

      TradeFill fill = new TradeFill();
      fill.setOrder(order);
      fill.setPrice(price);
      fill.setQuantity(qty);
      fill.setLiquidity("TAKER");
      fillRepo.save(fill);

      Notification n = new Notification();
      n.setUser(u);
      n.setNotifType("TRADE");
      n.setTitle("Trade filled");
      n.setBody(
          side
              + " "
              + qty.stripTrailingZeros().toPlainString()
              + " "
              + symbolCode
              + " @ "
              + price.stripTrailingZeros().toPlainString());
      notificationRepo.save(n);

      // Forward MARKET order to MT5 if admin enabled the bridge
      if (mt5ConnectionManager.isConnected()) {
        try {
          MT5JavaTradeWriter.sendTradeToMT5(
              symbolCode, side, price.doubleValue(), 0.0, 0.0, qty.doubleValue());
        } catch (Exception ex) {
          System.err.println("[MT5] Failed to forward MARKET order: " + ex.getMessage());
        }
      }

      return ResponseEntity.ok(
          Map.of(
              "ok", true,
              "orderId", order.getId(),
              "fillPrice", price,
              "notional", notional,
              "newBalance", ta.getBalance()));

    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  @PostMapping("/orders/{id}/cancel")
  @Transactional
  public ResponseEntity<?> cancelOrder(Authentication auth, @PathVariable Long id) {
    try {
      AppUser u = requireUser(auth);
      TradingAccount ta = ensurePrimaryAccount(u);
      BrokerOrder o = orderRepo.findById(id).orElse(null);
      if (o == null) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("ok", false, "error", "not_found"));
      }
      if (!o.getTradingAccount().getId().equals(ta.getId())) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("ok", false, "error", "forbidden"));
      }
      if (!"NEW".equalsIgnoreCase(o.getStatus())) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "not_cancelable"));
      }
      o.setStatus("CANCELED");
      orderRepo.save(o);
      return ResponseEntity.ok(Map.of("ok", true));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  @GetMapping("/notifications")
  public ResponseEntity<?> notifications(Authentication auth) {
    try {
      AppUser u = requireUser(auth);
      return ResponseEntity.ok(notificationRepo.findTop20ByUserIdOrderByCreatedAtDesc(u.getId()));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    }
  }

  @GetMapping("/kyc")
  public ResponseEntity<?> kyc(Authentication auth) {
    try {
      AppUser u = requireUser(auth);
      return ResponseEntity.ok(
          kycRepo
              .findByUserId(u.getId())
              .map(k -> Map.of("status", k.getStatus(), "submittedAt", k.getSubmittedAt(), "reviewedAt", k.getReviewedAt()))
              .orElse(Map.of("status", "NOT_STARTED")));
    } catch (IllegalStateException e) {
      if ("unauthorized".equals(e.getMessage())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("ok", false, "error", "unauthorized"));
      }
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    }
  }
}

