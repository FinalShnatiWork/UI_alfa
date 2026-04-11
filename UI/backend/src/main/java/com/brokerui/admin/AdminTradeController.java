package com.brokerui.admin;

import com.brokerui.broker.BrokerOrder;
import com.brokerui.broker.BrokerOrderRepository;
import com.brokerui.broker.Position;
import com.brokerui.broker.PositionRepository;
import com.brokerui.broker.TradingAccountRepository;
import com.brokerui.broker.AccountTransactionRepository;
import com.brokerui.broker.KycCaseRepository;
import com.brokerui.broker.NotificationRepository;
import com.brokerui.broker.AuditLogRepository;
import com.brokerui.broker.MT5ConnectionManager;
import org.springframework.context.ApplicationContext;
import org.springframework.boot.SpringApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
public class AdminTradeController {
  
  private final BrokerOrderRepository orderRepo;
  private final PositionRepository positionRepo;
  private final TradingAccountRepository accountRepo;
  private final AccountTransactionRepository transactionRepo;
  private final KycCaseRepository kycRepo;
  private final NotificationRepository notifRepo;
  private final AuditLogRepository auditRepo;
  private final MT5ConnectionManager mt5ConnectionManager;
  private final ApplicationContext applicationContext;

  public AdminTradeController(BrokerOrderRepository orderRepo, PositionRepository positionRepo,
        TradingAccountRepository accountRepo, AccountTransactionRepository transactionRepo,
        KycCaseRepository kycRepo, NotificationRepository notifRepo,
        AuditLogRepository auditRepo, MT5ConnectionManager mt5ConnectionManager,
        ApplicationContext applicationContext) {
    this.orderRepo = orderRepo;
    this.positionRepo = positionRepo;
    this.accountRepo = accountRepo;
    this.transactionRepo = transactionRepo;
    this.kycRepo = kycRepo;
    this.notifRepo = notifRepo;
    this.auditRepo = auditRepo;
    this.mt5ConnectionManager = mt5ConnectionManager;
    this.applicationContext = applicationContext;
  }

  /**
   * Gracefully shuts down the JVM after a short delay.
   * The OS process manager (or the .bat start script) should relaunch it.
   * The frontend polls /api/health until the server is back online.
   */
  @PostMapping("/server/restart")
  public Map<String, String> restartServer() {
    Thread restartThread = new Thread(() -> {
      try {
        Thread.sleep(500); // give response time to flush
      } catch (InterruptedException ignored) {}
      int exitCode = SpringApplication.exit(applicationContext, () -> 0);
      System.exit(exitCode);
    });
    restartThread.setDaemon(false);
    restartThread.setName("admin-restart");
    restartThread.start();
    return Map.of("status", "restarting");
  }

  public record TradeDto(Long id, Long accountId, String type, String symbol, String side, BigDecimal quantity, String status, Instant date) {}

  @GetMapping("/trades")
  public List<TradeDto> getAllTrades() {
    List<TradeDto> orders = orderRepo.findAll().stream()
      .map(o -> new TradeDto(
          o.getId(), 
          o.getTradingAccount().getUser().getId(), 
          o.getOrderType(), 
          o.getSymbolCode(), 
          o.getSide(), 
          o.getQuantity(), 
          o.getStatus(), 
          o.getCreatedAt()))
      .collect(Collectors.toList());

    List<TradeDto> positions = positionRepo.findAll().stream()
      .map(p -> new TradeDto(
          p.getId(), 
          p.getTradingAccount().getUser().getId(),
          "POSITION", 
          p.getSymbolCode(), 
          "OPEN", 
          p.getQuantity(), 
          "ACTIVE", 
          p.getOpenedAt()))
      .collect(Collectors.toList());

    orders.addAll(positions);
    return orders;
  }

  public record AccountDto(Long id, Long userId, String accountType, String currency, int leverage, String status, BigDecimal balance, BigDecimal equity, BigDecimal marginUsed, BigDecimal freeMargin) {}

  @GetMapping("/accounts")
  public List<AccountDto> getAccounts() {
    return accountRepo.findAll().stream()
      .map(a -> new AccountDto(a.getId(), a.getUser().getId(), a.getAccountType(), a.getCurrency(), a.getLeverage(), a.getStatus(), a.getBalance(), a.getEquity(), a.getMarginUsed(), a.getFreeMargin()))
      .collect(Collectors.toList());
  }

  public record TransactionDto(Long id, Long accountId, String txType, String status, BigDecimal amount, String currency, String method, Instant createdAt) {}

  @GetMapping("/transactions")
  public List<TransactionDto> getTransactions() {
    return transactionRepo.findAll().stream()
      .map(t -> new TransactionDto(t.getId(), t.getTradingAccount().getId(), t.getTxType(), t.getStatus(), t.getAmount(), t.getCurrency(), t.getMethod(), t.getCreatedAt()))
      .collect(Collectors.toList());
  }

  public record KycDto(Long id, Long userId, String status, Instant submittedAt, Instant reviewedAt, String note) {}

  @GetMapping("/kyc")
  public List<KycDto> getKyc() {
    return kycRepo.findAll().stream()
      .map(k -> new KycDto(k.getId(), k.getUser().getId(), k.getStatus(), k.getSubmittedAt(), k.getReviewedAt(), k.getNote()))
      .collect(Collectors.toList());
  }

  public record NotifDto(Long id, Long userId, String notifType, String title, String body, boolean read, Instant createdAt) {}

  @GetMapping("/notifications")
  public List<NotifDto> getNotifications() {
    return notifRepo.findAll().stream()
      .map(n -> new NotifDto(n.getId(), n.getUser().getId(), n.getNotifType(), n.getTitle(), n.getBody(), n.getReadAt() != null, n.getCreatedAt()))
      .collect(Collectors.toList());
  }

  public record AuditDto(Long id, Long userId, String action, String detail, String ip, Instant createdAt) {}

  @GetMapping("/audit")
  public List<AuditDto> getAuditLog() {
    return auditRepo.findAll().stream()
      .map(a -> new AuditDto(a.getId(), a.getUser() != null ? a.getUser().getId() : null, a.getAction(), a.getDetail(), a.getIp(), a.getCreatedAt()))
      .collect(Collectors.toList());
  }

  @GetMapping("/mt5/status")
  public Map<String, Boolean> getMt5Status() {
      return Map.of("connected", mt5ConnectionManager.isConnected());
  }

  @PostMapping("/mt5/connect")
  public Map<String, Boolean> connectMt5() {
      // In a real scenario, this might initiate the socket connection test.
      // Here, we just toggle the state to indicate the bridge is active.
      mt5ConnectionManager.setConnected(true);
      return Map.of("connected", true);
  }

  @PostMapping("/mt5/disconnect")
  public Map<String, Boolean> disconnectMt5() {
      mt5ConnectionManager.setConnected(false);
      return Map.of("connected", false);
  }
}

