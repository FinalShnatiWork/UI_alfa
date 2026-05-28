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
import org.springframework.security.authentication.DisabledException;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {
  private final AppUserRepository repo;

  public AppUserDetailsService(AppUserRepository repo) {
    this.repo = repo;
  }

  @Override
  public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
    AppUser u =
        repo.findByEmailIgnoreCase(email.toLowerCase(Locale.ROOT))
            .orElseThrow(() -> new UsernameNotFoundException(email));
    if (u.getPasswordHash() == null || u.getPasswordHash().isBlank()) {
      throw new UsernameNotFoundException("no password");
    }
    if (u.isBanned()) {
      throw new DisabledException("banned");
    }
    return new User(
        u.getEmail(),
        u.getPasswordHash(),
        List.of(new SimpleGrantedAuthority("ROLE_" + u.getRole().name())));
  }
}
