package com.brokerui.auth;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.user.UserDto;
import com.brokerui.user.UserRole;
import jakarta.validation.Valid;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthApiController {
  private final AppUserRepository repo;
  private final PasswordEncoder encoder;

  public AuthApiController(AppUserRepository repo, PasswordEncoder encoder) {
    this.repo = repo;
    this.encoder = encoder;
  }

  @GetMapping("/api/auth/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken());
  }

  @GetMapping("/api/auth/me")
  public UserDto me(@AuthenticationPrincipal User principal) {
    return repo
        .findByEmailIgnoreCase(principal.getUsername())
        .map(UserDto::from)
        .orElseThrow();
  }

  @PostMapping("/api/auth/register")
  @Transactional
  public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req) {
    String email = req.email().trim().toLowerCase(Locale.ROOT);
    if (repo.existsByEmailIgnoreCase(email)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(Map.of("ok", false, "error", "email_taken"));
    }
    AppUser u = new AppUser();
    u.setEmail(email);
    u.setDisplayName(req.displayName().trim());
    u.setPasswordHash(encoder.encode(req.password()));
    u.setRole(UserRole.USER);
    repo.save(u);
    return ResponseEntity.status(HttpStatus.CREATED).body(UserDto.from(u));
  }
}
