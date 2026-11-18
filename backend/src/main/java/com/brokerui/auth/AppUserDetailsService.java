package com.brokerui.auth;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import java.util.List;
import java.util.Locale;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Custom UserDetailsService implementation.
 * Integrates AppUser entities from the database with Spring Security.
 */
@Service
public class AppUserDetailsService implements UserDetailsService {
  private final AppUserRepository repo;

  /**
   * Constructs the AppUserDetailsService.
   *
   * @param repo the user accounts database repository
   */
  public AppUserDetailsService(AppUserRepository repo) {
    this.repo = repo;
  }

  /**
   * Loads user authentication details from the database by email address.
   * Checks if user is banned or missing a password.
   *
   * @param email user email address
   * @return Spring Security UserDetails representation of the authenticated user
   * @throws UsernameNotFoundException if user or password hash is not found
   * A banned user is returned disabled, so the login fails with DisabledException.
   */
  @Override
  public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
    AppUser u =
        repo.findByEmailIgnoreCase(email.toLowerCase(Locale.ROOT))
            .orElseThrow(() -> new UsernameNotFoundException(email));
    if (u.getPasswordHash() == null || u.getPasswordHash().isBlank()) {
      throw new UsernameNotFoundException("no password");
    }
    // A disabled user makes Spring throw DisabledException itself, so the login answers "banned".
    // Throwing it from here would be wrapped and reported as wrong credentials.
    return User.withUsername(u.getEmail())
        .password(u.getPasswordHash())
        .disabled(u.isBanned())
        .authorities(List.of(new SimpleGrantedAuthority("ROLE_" + u.getRole().name())))
        .build();
  }
}
