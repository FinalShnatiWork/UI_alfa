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

  public AuditLogService(AuditLogRepository auditLogRepo) {
    this.auditLogRepo = auditLogRepo;
  }

  /**
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

  private String extractIp(HttpServletRequest req) {
    String forwarded = req.getHeader("X-Forwarded-For");
    if (forwarded != null && !forwarded.isBlank()) {
      return truncate(forwarded.split(",")[0].trim(), 64);
    }
    return req.getRemoteAddr();
  }

  private String truncate(String s, int max) {
    if (s == null) return null;
    return s.length() > max ? s.substring(0, max) : s;
  }
}
