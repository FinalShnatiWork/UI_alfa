package com.brokerui.user;

import java.time.Instant;

public record UserDto(
    Long id,
    String email,
    String displayName,
    String role,
    Instant createdAt,
    boolean banned,
    Instant bannedAt,
    String bannedReason) {
  public static UserDto from(AppUser u) {
    return new UserDto(
        u.getId(),
        u.getEmail(),
        u.getDisplayName(),
        u.getRole().name(),
        u.getCreatedAt(),
        u.isBanned(),
        u.getBannedAt(),
        u.getBannedReason());
  }
}

