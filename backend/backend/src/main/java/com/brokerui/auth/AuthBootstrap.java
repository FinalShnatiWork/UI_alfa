package com.brokerui.auth;

import com.brokerui.broker.MarginLoanLedger;
import com.brokerui.broker.MarginLoanLedgerRepository;
import com.brokerui.broker.Position;
import com.brokerui.broker.PositionRepository;
import com.brokerui.broker.TradingAccount;
import com.brokerui.broker.TradingAccountRepository;
import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.user.UserRole;
import java.math.BigDecimal;
import java.time.Instant;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Application startup runner that bootstraps demo database records.
 * Creates default demo users across 4 distinct use-case scenarios.
 */
@Component
public class AuthBootstrap implements ApplicationRunner {
  private final AppUserRepository repo;
  private final PasswordEncoder encoder;
  private final TradingAccountRepository accountRepo;
  private final MarginLoanLedgerRepository ledgerRepo;
  private final PositionRepository positionRepo;

  /**
   * Constructs the AuthBootstrap runner.
   *
   * @param repo user repository
   * @param encoder password encoder utility
   * @param accountRepo trading account repository
   * @param ledgerRepo margin loan ledger repository
   * @param positionRepo position repository
   */
  public AuthBootstrap(
      AppUserRepository repo,
      PasswordEncoder encoder,
      TradingAccountRepository accountRepo,
      MarginLoanLedgerRepository ledgerRepo,
      PositionRepository positionRepo) {
    this.repo = repo;
    this.encoder = encoder;
    this.accountRepo = accountRepo;
    this.ledgerRepo = ledgerRepo;
    this.positionRepo = positionRepo;
  }

  /**
   * Bootstraps system accounts for 4 distinct use cases.
   */
  @Override
  public void run(ApplicationArguments args) {
    // 1. Default Demo User
    AppUser demoUser = repo
        .findByEmailIgnoreCase("demo@broker.local")
        .orElseGet(() -> {
          AppUser demo = new AppUser();
          demo.setEmail("demo@broker.local");
          demo.setDisplayName("Demo Trader");
          demo.setPasswordHash(encoder.encode("demo123"));
          demo.setRole(UserRole.USER);
          return repo.save(demo);
        });

    if (accountRepo.findFirstByUserIdOrderByIdAsc(demoUser.getId()).isEmpty()) {
      TradingAccount acc = new TradingAccount();
      acc.setUser(demoUser);
      acc.setAccountType("DEMO");
      acc.setCurrency("USD");
      acc.setBalance(new BigDecimal("10000.00"));
      acc.setEquity(new BigDecimal("10000.00"));
      acc.setFreeMargin(new BigDecimal("10000.00"));
      acc.setCreditLimit(new BigDecimal("10000.00"));
      acc.setDailyInterestRate(new BigDecimal("0.005"));
      acc.setLeverage(100);
      acc.setStatus("ACTIVE");
      accountRepo.save(acc);
    }

    // 2. Case 1: Hedging Trader (Multiple Independent Positions on Gold & BTC)
    bootstrapHedgeTrader();

    // 3. Case 2: VIP Trader ($25k Credit Limit, Low 0.3%/day Rate)
    bootstrapVipTrader();

    // 4. Case 3: Standard Borrower ($1,500 Active Loan)
    bootstrapStandardBorrower();

    // 5. Case 4: High Risk Trader (Margin Call Warning)
    bootstrapHighRiskTrader();

    if (!repo.existsByRole(UserRole.ADMIN)) {
      ensureBootstrapAdmin();
    }
  }

  private void bootstrapHedgeTrader() {
    AppUser user = repo.findByEmailIgnoreCase("trader.hedge@broker.local").orElseGet(() -> {
      AppUser u = new AppUser();
      u.setEmail("trader.hedge@broker.local");
      u.setDisplayName("Hedge Trader (Multiple Gold Trades)");
      u.setPasswordHash(encoder.encode("hedge123"));
      u.setRole(UserRole.USER);
      return repo.save(u);
    });

    TradingAccount acc = accountRepo.findFirstByUserIdOrderByIdAsc(user.getId()).orElseGet(() -> {
      TradingAccount a = new TradingAccount();
      a.setUser(user);
      a.setAccountType("DEMO");
      a.setCurrency("USD");
      a.setBalance(new BigDecimal("5000.00"));
      a.setEquity(new BigDecimal("5000.00"));
      a.setFreeMargin(new BigDecimal("5000.00"));
      a.setCreditLimit(new BigDecimal("10000.00"));
      a.setDailyInterestRate(new BigDecimal("0.005"));
      a.setLeverage(100);
      a.setStatus("ACTIVE");
      return accountRepo.save(a);
    });

    if (positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(acc.getId()).isEmpty()) {
      createPosition(acc, "XAUUSD", "LONG", new BigDecimal("0.1000"), new BigDecimal("2400.00"));
      createPosition(acc, "XAUUSD", "LONG", new BigDecimal("0.2000"), new BigDecimal("2415.00"));
      createPosition(acc, "BTCUSD", "LONG", new BigDecimal("0.0500"), new BigDecimal("65000.00"));
    }
  }

  private void bootstrapVipTrader() {
    AppUser user = repo.findByEmailIgnoreCase("trader.vip@broker.local").orElseGet(() -> {
      AppUser u = new AppUser();
      u.setEmail("trader.vip@broker.local");
      u.setDisplayName("VIP Trader ($25k Credit Line)");
      u.setPasswordHash(encoder.encode("vip123"));
      u.setRole(UserRole.USER);
      return repo.save(u);
    });

    TradingAccount acc = accountRepo.findFirstByUserIdOrderByIdAsc(user.getId()).orElseGet(() -> {
      TradingAccount a = new TradingAccount();
      a.setUser(user);
      a.setAccountType("DEMO");
      a.setCurrency("USD");
      a.setBalance(new BigDecimal("15000.00"));
      a.setEquity(new BigDecimal("15000.00"));
      a.setFreeMargin(new BigDecimal("15000.00"));
      a.setCreditLimit(new BigDecimal("25000.00"));
      a.setDailyInterestRate(new BigDecimal("0.003")); // 0.3%/day VIP rate
      a.setLeverage(100);
      a.setStatus("ACTIVE");
      return accountRepo.save(a);
    });

    if (positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(acc.getId()).isEmpty()) {
      createPosition(acc, "BTCUSD", "LONG", new BigDecimal("0.5000"), new BigDecimal("65500.00"));
    }
  }

  private void bootstrapStandardBorrower() {
    AppUser user = repo.findByEmailIgnoreCase("loan@broker.local").orElseGet(() -> {
      AppUser u = new AppUser();
      u.setEmail("loan@broker.local");
      u.setDisplayName("Loan Trader");
      u.setPasswordHash(encoder.encode("loan123"));
      u.setRole(UserRole.USER);
      return repo.save(u);
    });

    TradingAccount acc = accountRepo.findFirstByUserIdOrderByIdAsc(user.getId()).orElseGet(() -> {
      TradingAccount a = new TradingAccount();
      a.setUser(user);
      a.setAccountType("DEMO");
      a.setCurrency("USD");
      a.setBalance(new BigDecimal("2500.00"));
      a.setBorrowedBalance(new BigDecimal("1500.00"));
      a.setInterestAccruedTotal(new BigDecimal("17.50"));
      a.setLastInterestAt(Instant.now());
      a.setEquity(new BigDecimal("2500.00"));
      a.setFreeMargin(new BigDecimal("2500.00"));
      a.setCreditLimit(new BigDecimal("10000.00"));
      a.setDailyInterestRate(new BigDecimal("0.005"));
      a.setLeverage(100);
      a.setStatus("ACTIVE");
      return accountRepo.save(a);
    });

    if (ledgerRepo.findByTradingAccountIdOrderByCreatedAtDesc(acc.getId()).isEmpty()) {
      MarginLoanLedger entry = new MarginLoanLedger();
      entry.setTradingAccount(acc);
      entry.setEntryType("BORROW");
      entry.setAmount(new BigDecimal("1500.00"));
      entry.setBorrowedAfter(new BigDecimal("1500.00"));
      entry.setBalanceAfter(new BigDecimal("2500.00"));
      entry.setNote("Standard margin credit line utilization");
      ledgerRepo.save(entry);
    }

    if (positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(acc.getId()).isEmpty()) {
      createPosition(acc, "BTCUSD", "LONG", new BigDecimal("0.0500"), new BigDecimal("65700.00"));
    }
  }

  private void bootstrapHighRiskTrader() {
    AppUser user = repo.findByEmailIgnoreCase("trader.risk@broker.local").orElseGet(() -> {
      AppUser u = new AppUser();
      u.setEmail("trader.risk@broker.local");
      u.setDisplayName("High Risk Trader (Margin Call)");
      u.setPasswordHash(encoder.encode("risk123"));
      u.setRole(UserRole.USER);
      return repo.save(u);
    });

    TradingAccount acc = accountRepo.findFirstByUserIdOrderByIdAsc(user.getId()).orElseGet(() -> {
      TradingAccount a = new TradingAccount();
      a.setUser(user);
      a.setAccountType("DEMO");
      a.setCurrency("USD");
      a.setBalance(new BigDecimal("280.00"));
      a.setBorrowedBalance(new BigDecimal("3400.00"));
      a.setInterestAccruedTotal(new BigDecimal("45.00"));
      a.setLastInterestAt(Instant.now());
      a.setEquity(new BigDecimal("3680.00"));
      a.setFreeMargin(new BigDecimal("280.00"));
      a.setCreditLimit(new BigDecimal("10000.00"));
      a.setDailyInterestRate(new BigDecimal("0.007")); // 0.7%/day high risk rate
      a.setLeverage(100);
      a.setStatus("ACTIVE");
      return accountRepo.save(a);
    });

    if (positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(acc.getId()).isEmpty()) {
      createPosition(acc, "BTCUSD", "LONG", new BigDecimal("0.0500"), new BigDecimal("65700.00"));
    }
  }

  private void createPosition(TradingAccount ta, String symbol, String side, BigDecimal qty, BigDecimal price) {
    Position pos = new Position();
    pos.setTradingAccount(ta);
    pos.setSymbolCode(symbol);
    pos.setSide(side);
    pos.setQuantity(qty);
    pos.setAvgPrice(price);
    pos.setUnrealizedPnl(BigDecimal.ZERO);
    pos.setOpenedAt(Instant.now());
    positionRepo.save(pos);
  }

  private void ensureBootstrapAdmin() {
    String pwd = System.getenv().getOrDefault("BROKER_ADMIN_PASSWORD", "1234");
    String email = "admin@gmail.com";
    repo
        .findByEmailIgnoreCase(email)
        .ifPresentOrElse(
            u -> {
              u.setRole(UserRole.ADMIN);
              u.setDisplayName("Administrator");
              u.setPasswordHash(encoder.encode(pwd));
              repo.save(u);
            },
            () -> {
              AppUser admin = new AppUser();
              admin.setEmail(email);
              admin.setDisplayName("Administrator");
              admin.setPasswordHash(encoder.encode(pwd));
              admin.setRole(UserRole.ADMIN);
              repo.save(admin);
            });
  }
}


