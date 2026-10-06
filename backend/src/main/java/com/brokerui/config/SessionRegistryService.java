package com.brokerui.config;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionIdListener;
import jakarta.servlet.http.HttpSessionListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Global Session Registry that tracks active HttpSessions by their ID.
 * Enables tab-isolated multi-user sessions on the same machine/browser.
 */
@Component
public class SessionRegistryService implements HttpSessionListener, HttpSessionIdListener {

  private static final Logger log = LoggerFactory.getLogger(SessionRegistryService.class);
  private static final Map<String, HttpSession> SESSIONS = new ConcurrentHashMap<>();

  @Override
  public void sessionCreated(HttpSessionEvent se) {
    HttpSession session = se.getSession();
    if (session != null) {
      SESSIONS.put(session.getId(), session);
      log.debug("Session created and registered: {}", session.getId());
    }
  }

  @Override
  public void sessionDestroyed(HttpSessionEvent se) {
    HttpSession session = se.getSession();
    if (session != null) {
      SESSIONS.remove(session.getId());
      log.debug("Session destroyed and removed: {}", session.getId());
    }
  }

  @Override
  public void sessionIdChanged(HttpSessionEvent event, String oldSessionId) {
    if (oldSessionId != null) {
      SESSIONS.remove(oldSessionId);
    }
    HttpSession session = event.getSession();
    if (session != null) {
      SESSIONS.put(session.getId(), session);
      log.debug("Session ID changed from {} to {}", oldSessionId, session.getId());
    }
  }

  /**
   * Manually registers an active session into the registry.
   */
  public static void register(HttpSession session) {
    if (session != null) {
      try {
        SESSIONS.put(session.getId(), session);
      } catch (Exception ignored) {
      }
    }
  }

  /**
   * Removes a session from the registry.
   */
  public static void unregister(String sessionId) {
    if (sessionId != null) {
      SESSIONS.remove(sessionId);
    }
  }

  /**
   * Retrieves an active HttpSession by its ID if it exists and is not expired/invalidated.
   *
   * @param sessionId the session identifier
   * @return active HttpSession or null
   */
  public static HttpSession getSession(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return null;
    }
    HttpSession session = SESSIONS.get(sessionId);
    if (session != null) {
      try {
        session.getLastAccessedTime(); // Will throw IllegalStateException if already invalidated
        return session;
      } catch (IllegalStateException e) {
        SESSIONS.remove(sessionId);
        return null;
      }
    }
    return null;
  }

  /**
   * Ends every live session signed in as {@code email}, so a ban or deletion takes effect at
   * once instead of when the session times out.
   *
   * @return how many sessions were ended
   */
  public static int invalidateUser(String email) {
    if (email == null || email.isBlank()) return 0;
    int ended = 0;
    for (Map.Entry<String, HttpSession> e : SESSIONS.entrySet()) {
      HttpSession s = e.getValue();
      try {
        Object ctx = s.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        if (ctx instanceof SecurityContext sc && sc.getAuthentication() != null
            && email.equalsIgnoreCase(sc.getAuthentication().getName())) {
          s.invalidate();
          SESSIONS.remove(e.getKey());
          ended++;
        }
      } catch (IllegalStateException alreadyInvalid) {
        SESSIONS.remove(e.getKey());
      }
    }
    if (ended > 0) log.info("Ended {} session(s) for {}", ended, email);
    return ended;
  }

  /**
   * Returns current active session count.
   */
  public static int getActiveCount() {
    return SESSIONS.size();
  }
}
