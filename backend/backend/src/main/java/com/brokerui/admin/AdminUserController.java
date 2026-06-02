package com.brokerui.admin;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.user.UserDto;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.server.ResponseStatusException;

@RestController
@CrossOrigin
@RequestMapping("/api/admin")
public class AdminUserController {
  private final AppUserRepository repo;

  public AdminUserController(AppUserRepository repo) {
    this.repo = repo;
  }

  @GetMapping("/users")
  public List<UserDto> listUsers() {
    return repo.findAll().stream().map(UserDto::from).toList();
  }

  public record BanRequest(String reason) {}

  private AppUser findOrThrow(Long id) {
    return repo.findById(id).orElseThrow(() ->
        new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));
  }

  @PostMapping("/users/{id}/ban")
  @Transactional
  public Map<String, Object> ban(@PathVariable Long id, @Valid @RequestBody(required = false) BanRequest req) {
    AppUser u = findOrThrow(id);
    u.setBanned(true);
    u.setBannedAt(Instant.now());
    u.setBannedReason(req == null ? null : req.reason());
    repo.save(u);
    return Map.of("ok", true);
  }

  @PostMapping("/users/{id}/unban")
  @Transactional
  public Map<String, Object> unban(@PathVariable Long id) {
    AppUser u = findOrThrow(id);
    u.setBanned(false);
    u.setBannedAt(null);
    u.setBannedReason(null);
    repo.save(u);
    return Map.of("ok", true);
  }

  @PostMapping("/users/{id}/delete")
  @Transactional
  public Map<String, Object> deleteUser(@PathVariable Long id) {
    if (!repo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found");
    repo.deleteById(id);
    return Map.of("ok", true);
  }

  public record UpdateUserRequest(String displayName, String email) {}

  @PostMapping("/users/{id}/update")
  @Transactional
  public Map<String, Object> updateUser(@PathVariable Long id, @RequestBody UpdateUserRequest req) {
    AppUser u = findOrThrow(id);
    if (req.displayName() != null) u.setDisplayName(req.displayName());
    if (req.email() != null) {
      if (repo.existsByEmailIgnoreCase(req.email()) && !req.email().equalsIgnoreCase(u.getEmail())) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "email already in use");
      }
      u.setEmail(req.email());
    }
    repo.save(u);
    return Map.of("ok", true);
  }
}
