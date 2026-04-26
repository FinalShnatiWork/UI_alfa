package com.brokerui.admin;

import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.user.UserDto;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;

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

  @PostMapping("/users/{id}/ban")
  public Map<String, Object> ban(@PathVariable Long id, @Valid @RequestBody(required = false) BanRequest req) {
    AppUser u = repo.findById(id).orElseThrow();
    u.setBanned(true);
    u.setBannedAt(Instant.now());
    u.setBannedReason(req == null ? null : req.reason());
    repo.save(u);
    return Map.of("ok", true);
  }

  @PostMapping("/users/{id}/unban")
  public Map<String, Object> unban(@PathVariable Long id) {
    AppUser u = repo.findById(id).orElseThrow();
    u.setBanned(false);
    u.setBannedAt(null);
    u.setBannedReason(null);
    repo.save(u);
    return Map.of("ok", true);
  }

  @PostMapping("/users/{id}/delete")
  public Map<String, Object> deleteUser(@PathVariable Long id) {
    repo.deleteById(id);
    return Map.of("ok", true);
  }

  public record UpdateUserRequest(String displayName, String email) {}

  @PostMapping("/users/{id}/update")
  public Map<String, Object> updateUser(@PathVariable Long id, @RequestBody UpdateUserRequest req) {
    AppUser u = repo.findById(id).orElseThrow();
    if (req.displayName() != null) u.setDisplayName(req.displayName());
    if (req.email() != null) u.setEmail(req.email());
    repo.save(u);
    return Map.of("ok", true);
  }
}
