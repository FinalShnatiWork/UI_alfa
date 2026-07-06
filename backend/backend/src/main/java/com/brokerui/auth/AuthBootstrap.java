package com.brokerui.auth;

import com.brokerui.broker.TradingAccount;
import com.brokerui.broker.TradingAccountRepository;
import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.user.UserRole;
import java.math.BigDecimal;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Application startup runner that bootstraps demo database records.
 * Creates a default demo user and a default administrator account if they don't exist.
 */
@Component
public class AuthBootstrap implements ApplicationRunner {
  private final AppUserRepository repo;
  private final PasswordEncoder encoder;
  private final TradingAccountRepository accountRepo;

  /**
   * Constructs the AuthBootstrap runner.
   *
   * @param repo user repository
   * @param encoder password encoder utility
   * @param accountRepo trading account repository
   */
  public AuthBootstrap(AppUserRepository repo, PasswordEncoder encoder, TradingAccountRepository accountRepo) {
    this.repo = repo;
    this.encoder = encoder;
    this.accountRepo = accountRepo;
  }

  /**
   * Overrides Spring Boot ApplicationRunner execution method.
   * Bootstraps the demo user account, demo trading account, and system administrator.
   *
   * @param args application runtime arguments
   */
  @Override
  public void run(ApplicationArguments args) {
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

    // Ensure demo user has at least one trading account
    if (accountRepo.findFirstByUserIdOrderByIdAsc(demoUser.getId()).isEmpty()) {
      TradingAccount acc = new TradingAccount();
      acc.setUser(demoUser);
      acc.setAccountType("DEMO");
      acc.setCurrency("USD");
      acc.setBalance(new BigDecimal("10000.00"));
      acc.setEquity(new BigDecimal("10000.00"));
      acc.setFreeMargin(new BigDecimal("10000.00"));
      acc.setLeverage(100);
      acc.setStatus("ACTIVE");
      accountRepo.save(acc);
    }

    if (!repo.existsByRole(UserRole.ADMIN)) {
      ensureBootstrapAdmin();
    }
  }

  /**
   * Helper method to ensure that a default system administrator account exists.
   * If a user with the admin email exists, updates their role to ADMIN.
   * Otherwise, creates a new admin user account.
   */
  private void ensureBootstrapAdmin() {
    // Demo only. Override with BROKER_ADMIN_PASSWORD for anything serious.
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
