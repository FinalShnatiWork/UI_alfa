package com.brokerui.admin;

import com.brokerui.broker.AuditLogService;
import com.brokerui.config.SessionRegistryService;
import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import com.brokerui.user.UserDto;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.server.ResponseStatusException;

/**
 * REST controller for managing users within the administration panel.
 * Supports list, ban, unban, delete, and update operations.
 */
@RestController
@CrossOrigin
@RequestMapping("/api/admin")
public class AdminUserController {
  private final AppUserRepository repo;
  private final AuditLogService auditLogService;

  /**
   * Constructs the AdminUserController with the user repository.
   *
   * @param repo the user repository
   * @param auditLogService records who did what to which user
   */
  public AdminUserController(AppUserRepository repo, AuditLogService auditLogService) {
    this.repo = repo;
    this.auditLogService = auditLogService;
  }

  /** Logs under the acting admin; the target user is named in the detail. */
  private void audit(Authentication auth, String action, AppUser target, String extra, HttpServletRequest request) {
    AppUser admin = auth == null ? null : repo.findByEmailIgnoreCase(auth.getName()).orElse(null);
    String detail = "user #" + target.getId() + " " + target.getEmail() + (extra == null || extra.isBlank() ? "" : " — " + extra);
    auditLogService.log(admin, action, detail, request);
  }

  /**
   * Retrieves a list of all users in the system.
   * The goal is to provide administration overview of app users.
   *
   * @return a list of user details mapped to DTOs
   */
  @GetMapping("/users")
  public List<UserDto> listUsers() {
    return repo.findAll().stream().map(UserDto::from).toList();
  }

  public record BanRequest(String reason) {}

  /**
   * Internal helper to find a user by ID or throw NOT_FOUND exception.
   *
   * @param id the user ID
   * @return the AppUser entity
   * @throws ResponseStatusException if user is not found
   */
  private AppUser findOrThrow(Long id) {
    return repo.findById(id).orElseThrow(() ->
        new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));
  }

  /**
   * Bans a user from accessing their account.
   * The goal is to restrict malicious or non-compliant users.
   *
   * @param id the user ID to ban
   * @param req the optional request body containing the ban reason
   * @return a success map confirming the ban
   */
  @PostMapping("/users/{id}/ban")
  @Transactional
  public Map<String, Object> ban(@PathVariable Long id, @Valid @RequestBody(required = false) BanRequest req,
      Authentication auth, HttpServletRequest request) {
    AppUser u = findOrThrow(id);
    u.setBanned(true);
    u.setBannedAt(Instant.now());
    u.setBannedReason(req == null ? null : req.reason());
    repo.save(u);
    int ended = SessionRegistryService.invalidateUser(u.getEmail());
    audit(auth, "ADMIN_USER_BANNED", u,
        (req == null || req.reason() == null ? "" : "reason: " + req.reason() + "; ") + ended + " session(s) ended", request);
    return Map.of("ok", true, "sessionsEnded", ended);
  }

  /**
   * Unbans a previously banned user, restoring account access.
   *
   * @param id the user ID to unban
   * @return a success map confirming the unban
   */
  @PostMapping("/users/{id}/unban")
  @Transactional
  public Map<String, Object> unban(@PathVariable Long id, Authentication auth, HttpServletRequest request) {
    AppUser u = findOrThrow(id);
    u.setBanned(false);
    u.setBannedAt(null);
    u.setBannedReason(null);
    repo.save(u);
    audit(auth, "ADMIN_USER_UNBANNED", u, null, request);
    return Map.of("ok", true);
  }

  /**
   * Deletes a user permanently from the system database.
   * The goal is to completely purge user data upon request or administration order.
   *
   * @param id the user ID to delete
   * @return a success map confirming deletion
   */
  @PostMapping("/users/{id}/delete")
  @Transactional
  public Map<String, Object> deleteUser(@PathVariable Long id, Authentication auth, HttpServletRequest request) {
    AppUser u = findOrThrow(id);
    int ended = SessionRegistryService.invalidateUser(u.getEmail());
    audit(auth, "ADMIN_USER_DELETED", u, ended + " session(s) ended", request);
    repo.deleteById(id);
    return Map.of("ok", true);
  }

  public record UpdateUserRequest(String displayName, String email) {}

  /**
   * Updates user demographic details (display name and email).
   * The goal is to allow administrators to edit user profiles and resolve email conflicts.
   *
   * @param id the user ID to update
   * @param req the request containing the updated fields
   * @return a success map confirming the profile updates
   * @throws ResponseStatusException if the new email is already in use by another user
   */
  @PostMapping("/users/{id}/update")
  @Transactional
  public Map<String, Object> updateUser(@PathVariable Long id, @RequestBody UpdateUserRequest req,
      Authentication auth, HttpServletRequest request) {
    AppUser u = findOrThrow(id);
    String before = "name=" + u.getDisplayName() + ", email=" + u.getEmail();
    if (req.displayName() != null) u.setDisplayName(req.displayName());
    if (req.email() != null) {
      if (repo.existsByEmailIgnoreCase(req.email()) && !req.email().equalsIgnoreCase(u.getEmail())) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "email already in use");
      }
      u.setEmail(req.email());
    }
    repo.save(u);
    audit(auth, "ADMIN_USER_UPDATED", u, "was " + before, request);
    return Map.of("ok", true);
  }
}
