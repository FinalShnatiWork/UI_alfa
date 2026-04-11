package com.brokerui.auth;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.user.UserRole;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AuthBootstrap implements ApplicationRunner {
  private final AppUserRepository repo;
  private final PasswordEncoder encoder;

  public AuthBootstrap(AppUserRepository repo, PasswordEncoder encoder) {
    this.repo = repo;
    this.encoder = encoder;
  }

  @Override
  public void run(ApplicationArguments args) {
    repo
        .findByEmailIgnoreCase("demo@broker.local")
        .ifPresent(
            u -> {
              if (u.getPasswordHash() == null || u.getPasswordHash().isBlank()) {
                u.setPasswordHash(encoder.encode("demo123"));
                if (u.getRole() == null) {
                  u.setRole(UserRole.USER);
                }
                repo.save(u);
              }
            });

    if (!repo.existsByRole(UserRole.ADMIN)) {
      ensureBootstrapAdmin();
    }
  }

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
