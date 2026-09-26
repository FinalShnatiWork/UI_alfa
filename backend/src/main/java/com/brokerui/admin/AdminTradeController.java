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
import com.brokerui.broker.MarginLoanLedger;
import com.brokerui.broker.MarginLoanLedgerRepository;
import com.brokerui.broker.MarginLoanService;
import org.springframework.context.ApplicationContext;
import org.springframework.boot.SpringApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.transaction.annotation.Transactional;

/**
 * REST controller for administrator functions, including server control,
 * MT5 bridge connection management, viewing system-wide accounts, trades,
 * audits, transactions, and updating account balances.
 */
@RestController
@CrossOrigin
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
  private final MarginLoanLedgerRepository marginLedgerRepo;
  private final MarginLoanService marginLoanService;

  /**
   * Constructs the AdminTradeController with required repositories and services.
   *
   * @param orderRepo the repository for orders
   * @param positionRepo the repository for open positions
   * @param accountRepo the repository for trading accounts
   * @param transactionRepo the repository for ledger transactions
   * @param kycRepo the repository for KYC/verification cases
   * @param notifRepo the repository for user alerts/notifications
   * @param auditRepo the repository for system audit logs
   * @param mt5ConnectionManager the manager for MT5 bridge socket connectivity
   * @param applicationContext the Spring application context
   * @param marginLedgerRepo the repository for margin credit line ledger entries
   * @param marginLoanService the margin credit line service (interest/liquidation)
   */
  public AdminTradeController(BrokerOrderRepository orderRepo, PositionRepository positionRepo,
        TradingAccountRepository accountRepo, AccountTransactionRepository transactionRepo,
        KycCaseRepository kycRepo, NotificationRepository notifRepo,
        AuditLogRepository auditRepo, MT5ConnectionManager mt5ConnectionManager,
        ApplicationContext applicationContext, MarginLoanLedgerRepository marginLedgerRepo,
        MarginLoanService marginLoanService) {
    this.orderRepo = orderRepo;
    this.positionRepo = positionRepo;
    this.accountRepo = accountRepo;
    this.transactionRepo = transactionRepo;
    this.kycRepo = kycRepo;
    this.notifRepo = notifRepo;
    this.auditRepo = auditRepo;
    this.mt5ConnectionManager = mt5ConnectionManager;
    this.applicationContext = applicationContext;
    this.marginLedgerRepo = marginLedgerRepo;
    this.marginLoanService = marginLoanService;
  }

  /**
   * Gracefully shuts down the JVM after a short delay.
   * The OS process manager (or the .bat start script) should relaunch it.
   * The frontend polls /api/health until the server is back online.
   *
   * @return a map confirming the restart action has been initiated
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

  public record TradeDto(Long id, Long accountId, String type, String symbol, String side, BigDecimal quantity, String status, Instant date, String executionRouting, BigDecimal commission, BigDecimal realizedPnl) {}

  /**
   * Retrieves all trades (orders and active positions) in the system.
   * The goal is to provide a combined historical view for admin oversight.
   *
   * @return a list of all orders and open positions mapped to a unified DTO
   */
  @GetMapping("/trades")
  @Transactional(readOnly = true)
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
          o.getCreatedAt(),
          o.getNnRouteRecommendation() != null ? o.getNnRouteRecommendation() : "EXTERNAL",
          o.getCommission() != null ? o.getCommission() : BigDecimal.ZERO,
          o.getRealizedPnl()))
      .collect(Collectors.toList());

    List<TradeDto> positions = positionRepo.findAll().stream()
      .map(p -> new TradeDto(
          p.getId(), 
          p.getTradingAccount().getUser().getId(),
          "POSITION", 
          p.getSymbolCode(), 
          "LONG".equalsIgnoreCase(p.getSide()) ? "BUY" : "SELL", 
          p.getQuantity(), 
          "ACTIVE", 
          p.getOpenedAt(),
          "INTERNAL",
          BigDecimal.ZERO,
          p.getUnrealizedPnl()))
      .collect(Collectors.toList());

    orders.addAll(positions);
    return orders;
  }

  public record AccountDto(Long id, Long userId, String accountType, String currency, int leverage, String status,
      BigDecimal balance, BigDecimal equity, BigDecimal marginUsed, BigDecimal freeMargin,
      BigDecimal borrowedBalance, BigDecimal marginLevelPct, BigDecimal interestAccruedTotal,
      BigDecimal commissionPaidTotal) {}

  /**
   * Retrieves all trading accounts in the system.
   * The goal is to audit user balances, margins, and account settings.
   *
   * @return a list of all trading accounts mapped to their summary DTOs
   */
  @GetMapping("/accounts")
  @Transactional(readOnly = true)
  public List<AccountDto> getAccounts() {
    return accountRepo.findAll().stream()
      .map(a -> {
        BigDecimal level = marginLoanService.computeMarginLevel(a);
        return new AccountDto(a.getId(), a.getUser().getId(), a.getAccountType(), a.getCurrency(), a.getLeverage(),
            a.getStatus(), a.getBalance(), a.getEquity(), a.getMarginUsed(), a.getFreeMargin(),
            a.getBorrowedBalance(), level == null ? null : level.multiply(BigDecimal.valueOf(100)),
            a.getInterestAccruedTotal(), a.getCommissionPaidTotal());
      })
      .collect(Collectors.toList());
  }

  public record MarginLedgerDto(Long id, Long accountId, Long userId, String entryType, BigDecimal amount,
      BigDecimal borrowedAfter, BigDecimal balanceAfter, String note, Instant createdAt) {}

  /**
   * Retrieves the full margin credit line ledger (borrows, repayments, interest charges,
   * and liquidations) across all accounts, newest first.
   *
   * @return a list of all margin loan ledger entries
   */
  @GetMapping("/margin-loans")
  @Transactional(readOnly = true)
  public List<MarginLedgerDto> getMarginLoans() {
    return marginLedgerRepo.findAllByOrderByCreatedAtDesc().stream()
      .map(e -> new MarginLedgerDto(e.getId(), e.getTradingAccount().getId(), e.getTradingAccount().getUser().getId(),
          e.getEntryType(), e.getAmount(), e.getBorrowedAfter(), e.getBalanceAfter(), e.getNote(), e.getCreatedAt()))
      .collect(Collectors.toList());
  }

  /**
   * Manually triggers the daily interest accrual job for every indebted account.
   * Intended for admin testing/demo — normally this runs automatically once every 24h.
   *
   * @return a map confirming the job ran
   */
  @PostMapping("/margin-loans/run-interest")
  public Map<String, Object> runInterestNow() {
    marginLoanService.accrueDailyInterest();
    return Map.of("ok", true);
  }

  /**
   * Manually triggers the liquidation check across all indebted accounts.
   * Intended for admin testing/demo — normally this runs automatically every 10s.
   *
   * @return a map confirming the job ran
   */
  @PostMapping("/margin-loans/run-liquidation-check")
  public Map<String, Object> runLiquidationCheckNow() {
    marginLoanService.checkLiquidations();
    return Map.of("ok", true);
  }

  public record TransactionDto(Long id, Long accountId, String txType, String status, BigDecimal amount, String currency, String method, Instant createdAt) {}

  /**
   * Retrieves all deposit and withdrawal transactions in the system.
   * The goal is to provide financial auditing logs.
   *
   * @return a list of all ledger transactions
   */
  @GetMapping("/transactions")
  @Transactional(readOnly = true)
  public List<TransactionDto> getTransactions() {
    return transactionRepo.findAll().stream()
      .map(t -> new TransactionDto(t.getId(), t.getTradingAccount().getId(), t.getTxType(), t.getStatus(), t.getAmount(), t.getCurrency(), t.getMethod(), t.getCreatedAt()))
      .collect(Collectors.toList());
  }

  public record KycDto(Long id, Long userId, String status, Instant submittedAt, Instant reviewedAt, String note) {}

  /**
   * Retrieves all KYC/verification submissions.
   * The goal is to support administrative verification approvals.
   *
   * @return a list of all KYC cases
   */
  @GetMapping("/kyc")
  @Transactional(readOnly = true)
  public List<KycDto> getKyc() {
    return kycRepo.findAll().stream()
      .map(k -> new KycDto(k.getId(), k.getUser().getId(), k.getStatus(), k.getSubmittedAt(), k.getReviewedAt(), k.getNote()))
      .collect(Collectors.toList());
  }

  public record NotifDto(Long id, Long userId, String notifType, String title, String body, boolean read, Instant createdAt) {}

  /**
   * Retrieves all system-wide user alerts/notifications.
   * The goal is to audit notifications sent to client dashboards.
   *
   * @return a list of all user notifications
   */
  @GetMapping("/notifications")
  @Transactional(readOnly = true)
  public List<NotifDto> getNotifications() {
    return notifRepo.findAll().stream()
      .map(n -> new NotifDto(n.getId(), n.getUser().getId(), n.getNotifType(), n.getTitle(), n.getBody(), n.getReadAt() != null, n.getCreatedAt()))
      .collect(Collectors.toList());
  }

  public record AuditDto(Long id, Long userId, String action, String detail, String ip, Instant createdAt) {}

  /**
   * Retrieves security audit logs.
   * The goal is to trace actions, logins, and system configuration modifications.
   *
   * @return a list of all system audit logs
   */
  @GetMapping("/audit")
  @Transactional(readOnly = true)
  public List<AuditDto> getAuditLog() {
    return auditRepo.findAll().stream()
      .map(a -> new AuditDto(a.getId(), a.getUser() != null ? a.getUser().getId() : null, a.getAction(), a.getDetail(), a.getIp(), a.getCreatedAt()))
      .collect(Collectors.toList());
  }

  /**
   * Checks the health and connection status of the MT5 server bridge.
   * Attempting auto-connection if reachable but disconnected.
   *
   * @return a status map detailing connection, path, and bridge reachability
   */
  @GetMapping("/mt5/status")
  public Map<String, Object> getMt5Status() {
      boolean reachable = mt5ConnectionManager.getMt5Service().checkHealth();
      if (reachable && !mt5ConnectionManager.isConnected()) {
          mt5ConnectionManager.attemptConnect();
      }
      
      boolean connected = mt5ConnectionManager.isConnected();
      String path = mt5ConnectionManager.getMt5Service().getBasePath();
      return Map.of(
          "connected", connected,
          "path", path,
          "bridgeReachable", reachable
      );
  }

  /**
   * Triggers a manual connection attempt to the MT5 bridge.
   * The goal is to establish bridge communications if automatic ticks fail.
   *
   * @return a map indicating the resulting connection status
   */
  @PostMapping("/mt5/connect")
  public Map<String, Boolean> connectMt5() {
      // Perform a real connectivity check (ping socket and verify file paths)
      boolean success = mt5ConnectionManager.attemptConnect();
      return Map.of("connected", success);
  }

  /**
   * Instructs the manager to disconnect from the MT5 bridge.
   * The goal is to switch off MT5 synchronization for testing or debugging.
   *
   * @return a map confirming disconnection status
   */
  @PostMapping("/mt5/disconnect")
  public Map<String, Boolean> disconnectMt5() {
      mt5ConnectionManager.setConnected(false);
      return Map.of("connected", false);
  }

  public record UpdateBalanceRequest(BigDecimal balance) {}

  /**
   * Updates the balance of a specific trading account.
   * The goal is to adjust demo user virtual funds.
   *
   * @param id the target trading account ID
   * @param req the request containing the new balance value
   * @return a map indicating the success of the update
   */
  @PostMapping("/accounts/{id}/balance")
  @org.springframework.transaction.annotation.Transactional
  public Map<String, Object> updateBalance(@PathVariable Long id, @RequestBody UpdateBalanceRequest req) {
      if (req.balance() == null || req.balance().compareTo(BigDecimal.ZERO) < 0) {
        throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.BAD_REQUEST, "balance must be non-negative");
      }
      var acc = accountRepo.findByIdForUpdate(id)
          .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
               org.springframework.http.HttpStatus.NOT_FOUND, "account not found"));
      acc.setBalance(req.balance());
      acc.setEquity(req.balance());
      accountRepo.save(acc);
      return Map.of("ok", true);
  }

  public record UpdateLoanRequest(BigDecimal borrowedBalance) {}

  /**
   * Updates the margin loan borrowed balance of a specific trading account for demo testing.
   *
   * @param id the target trading account ID
   * @param req the request containing the new borrowedBalance value
   * @return a map indicating the success of the update
   */
  @PostMapping("/accounts/{id}/loan")
  @org.springframework.transaction.annotation.Transactional
  public Map<String, Object> updateLoan(@PathVariable Long id, @RequestBody UpdateLoanRequest req) {
      var acc = accountRepo.findByIdForUpdate(id)
          .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
               org.springframework.http.HttpStatus.NOT_FOUND, "account not found"));
      BigDecimal newBorrowed = (req != null && req.borrowedBalance() != null) ? req.borrowedBalance() : new BigDecimal("3500.00");
      acc.setBorrowedBalance(newBorrowed);
      if (acc.getInterestAccruedTotal() == null || acc.getInterestAccruedTotal().compareTo(BigDecimal.ZERO) == 0) {
        acc.setInterestAccruedTotal(new BigDecimal("17.50"));
      }
      acc.setLastInterestAt(Instant.now());
      accountRepo.save(acc);

      MarginLoanLedger entry = new MarginLoanLedger();
      entry.setTradingAccount(acc);
      entry.setEntryType("BORROW");
      entry.setAmount(newBorrowed);
      entry.setBorrowedAfter(newBorrowed);
      entry.setBalanceAfter(acc.getBalance());
      entry.setNote("Manual margin loan activation for demo");
      marginLedgerRepo.save(entry);

      return Map.of("ok", true, "borrowedBalance", acc.getBorrowedBalance());
  }
}


