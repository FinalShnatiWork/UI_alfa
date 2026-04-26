package com.brokerui.broker;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
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
  private final MT5IntegrationService mt5Service;

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
      MT5IntegrationService mt5Service) {
    this.userRepo = userRepo;
    this.accountRepo = accountRepo;
    this.symbolRepo = symbolRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.fillRepo = fillRepo;
    this.txRepo = txRepo;
    this.notificationRepo = notificationRepo;
    this.kycRepo = kycRepo;
    this.mt5Service = mt5Service;
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

  @PostMapping("/transactions")
  @Transactional
  public ResponseEntity<?> createTransaction(Authentication auth, @RequestBody Map<String, Object> body) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    String type = String.valueOf(body.get("txType")).toUpperCase();
    BigDecimal amount = new BigDecimal(String.valueOf(body.get("amount")));
    
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

    return ResponseEntity.ok(Map.of("ok", true, "newBalance", ta.getBalance()));
  }

  public record PlaceOrderRequest(String symbolCode, String side, String orderType, BigDecimal quantity, BigDecimal limitPrice, BigDecimal stopPrice) {}

  @PostMapping("/orders")
  @Transactional
  public ResponseEntity<?> placeOrder(Authentication auth, @RequestBody PlaceOrderRequest body) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);

    String symbolCode = body.symbolCode().trim().toUpperCase();
    String side = body.side().trim().toUpperCase();
    String orderType = body.orderType() == null ? "MARKET" : body.orderType().trim().toUpperCase();
    BigDecimal qty = body.quantity();

    if (!"MARKET".equals(orderType)) {
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
      return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "status", "NEW"));
    }

    // MARKET execution via MT5
    double price;
    try {
      price = mt5Service.getPrice(symbolCode);
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("ok", false, "error", "mt5_price_unavailable"));
    }

    BigDecimal bdPrice = BigDecimal.valueOf(price);
    BigDecimal notional = bdPrice.multiply(qty);

    if ("BUY".equals(side) && ta.getBalance().compareTo(notional) < 0) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "insufficient_funds"));
    }

    // Update local DB for immediate UI feedback (will be synced later by background task if needed)
    Position pos = positionRepo.findByTradingAccountIdAndSymbolCode(ta.getId(), symbolCode).orElse(null);
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
      positionRepo.save(pos);
    } else {
      ta.setBalance(ta.getBalance().add(notional));
      if (pos != null) {
        BigDecimal newQty = pos.getQuantity().subtract(qty);
        pos.setQuantity(newQty);
        if (newQty.compareTo(BigDecimal.ZERO) <= 0) positionRepo.delete(pos);
        else positionRepo.save(pos);
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
    orderRepo.save(order);

    // Forward to MT5
    try {
      mt5Service.sendTrade(symbolCode, side, price, 0, 0, qty.doubleValue());
    } catch (Exception ex) {
      System.err.println("MT5 Send Failed: " + ex.getMessage());
    }

    return ResponseEntity.ok(Map.of("ok", true, "orderId", order.getId(), "fillPrice", bdPrice, "newBalance", ta.getBalance()));
  }

  @GetMapping("/notifications")
  public ResponseEntity<?> notifications(Authentication auth) {
    AppUser u = requireUser(auth);
    return ResponseEntity.ok(notificationRepo.findTop20ByUserIdOrderByCreatedAtDesc(u.getId()));
  }

  @GetMapping("/history")
  public ResponseEntity<?> history(Authentication auth) {
    AppUser u = requireUser(auth);
    TradingAccount ta = ensurePrimaryAccount(u);
    return ResponseEntity.ok(orderRepo.findByTradingAccountIdAndStatusOrderByFilledAtDesc(ta.getId(), "FILLED"));
  }
}
