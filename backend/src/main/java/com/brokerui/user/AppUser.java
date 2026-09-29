package com.brokerui.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_user")
public class AppUser {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(name = "display_name", nullable = false)
  private String displayName;

  @Column(name = "password_hash")
  @JsonIgnore
  private String passwordHash;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 32)
  private UserRole role = UserRole.USER;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "banned", nullable = false)
  private boolean banned = false;

  @Column(name = "banned_at")
  private Instant bannedAt;

  @Column(name = "banned_reason", length = 500)
  private String bannedReason;

  /** Simulated "computer" counterparty (never logs in), V32. */
  @Column(name = "is_simulated", nullable = false)
  private boolean simulated = false;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public UserRole getRole() {
    return role;
  }

  public void setRole(UserRole role) {
    this.role = role;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public boolean isBanned() {
    return banned;
  }

  public void setBanned(boolean banned) {
    this.banned = banned;
  }

  public Instant getBannedAt() {
    return bannedAt;
  }

  public void setBannedAt(Instant bannedAt) {
    this.bannedAt = bannedAt;
  }

  public String getBannedReason() {
    return bannedReason;
  }

  public void setBannedReason(String bannedReason) {
    this.bannedReason = bannedReason;
  }

  public boolean isSimulated() { return simulated; }
  public void setSimulated(boolean simulated) { this.simulated = simulated; }
}
