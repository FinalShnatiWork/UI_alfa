package com.brokerui.broker;

import com.brokerui.user.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

/**
 * Centralized audit logging service.
 * Writes every critical user action to the audit_log table.
 * Never throws – audit failures must not interrupt business logic.
 */
@Service
public class AuditLogService {

  private final AuditLogRepository auditLogRepo;

  /**
   * Constructs the AuditLogService with AuditLogRepository.
   *
   * @param auditLogRepo the repository for audit logs
   */
  public AuditLogService(AuditLogRepository auditLogRepo) {
    this.auditLogRepo = auditLogRepo;
  }

  /**
   * Records a user activity in the audit log database.
   * The goal of this method is to safely write trace records without throwing exceptions.
   *
   * @param user   the acting user (may be null for failed logins)
   * @param action short action code, e.g. "LOGIN_SUCCESS", "ORDER_PLACED"
   * @param detail human-readable detail string
   * @param req    current HTTP request for IP / User-Agent extraction (may be null)
   */
  public void log(AppUser user, String action, String detail, HttpServletRequest req) {
    try {
      AuditLog entry = new AuditLog();
      entry.setUser(user);
      entry.setAction(action);
      entry.setDetail(detail);
      if (req != null) {
        entry.setIp(extractIp(req));
        entry.setUserAgent(truncate(req.getHeader("User-Agent"), 512));
      }
      auditLogRepo.save(entry);
    } catch (Exception ex) {
      // Log to stderr but never propagate – audit must not break the request
      System.err.println("[AuditLog] save failed: " + ex.getMessage());
    }
  }

  /**
   * Extracts the client IP address from the request header or servlet properties.
   *
   * @param req servlet HTTP request
   * @return extracted IP address string
   */
  private String extractIp(HttpServletRequest req) {
    String forwarded = req.getHeader("X-Forwarded-For");
    if (forwarded != null && !forwarded.isBlank()) {
      return truncate(forwarded.split(",")[0].trim(), 64);
    }
    return req.getRemoteAddr();
  }

  /**
   * Utility method to safely truncate strings to prevent column width constraint violations.
   *
   * @param s raw string input
   * @param max maximum character width
   * @return truncated string or null if input was null
   */
  private String truncate(String s, int max) {
    if (s == null) return null;
    return s.length() > max ? s.substring(0, max) : s;
  }
}
