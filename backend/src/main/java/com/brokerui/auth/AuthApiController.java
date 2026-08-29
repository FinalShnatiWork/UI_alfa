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

/**
 * REST controller for handling user authentication endpoints.
 * Handles registration, fetching current session profile, and retrieving CSRF tokens.
 */
@RestController
public class AuthApiController {
  private final AppUserRepository repo;
  private final PasswordEncoder encoder;

  /**
   * Constructs the AuthApiController.
   *
   * @param repo the user accounts database repository
   * @param encoder password hashing utility encoder
   */
  public AuthApiController(AppUserRepository repo, PasswordEncoder encoder) {
    this.repo = repo;
    this.encoder = encoder;
  }

  /**
   * Retrieves the current Spring Security CSRF token.
   * The goal of this endpoint is to support JavaScript CSRF client handshakes.
   *
   * @param token the active CsrfToken populated by Spring Security
   * @return a map containing the CSRF token string value
   */
  @GetMapping("/api/auth/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken());
  }

  /**
   * Retrieves the current authenticated user's profile details.
   * The goal is to verify session credentials and populate client dashboard settings.
   *
   * @param principal the Spring Security User representation from the session context
   * @return the AppUser profile details mapped to a DTO
   */
  @GetMapping("/api/auth/me")
  public UserDto me(@AuthenticationPrincipal User principal) {
    return repo
        .findByEmailIgnoreCase(principal.getUsername())
        .map(UserDto::from)
        .orElseThrow();
  }

  /**
   * Registers a new standard user account.
   * The goal is to hash passwords, check email uniqueness, and store the profile.
   *
   * @param req valid registration parameters body
   * @return the created AppUser profile DTO or a conflict response if email is taken
   */
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
