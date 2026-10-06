package com.brokerui.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

/**
 * Filter that enables concurrent, tab-isolated multi-user sessions on the same machine.
 * Intercepts 'X-Session-Id' (or 'X-Auth-Token') headers and binds the request
 * to the corresponding tracked HttpSession, bypassing the single-cookie browser limitation.
 */
@Component
@Order(-102) // Runs before Spring Security's SecurityContextHolderFilter
public class HeaderSessionFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(HeaderSessionFilter.class);

  public static final String SESSION_HEADER = "X-Session-Id";
  public static final String AUTH_TOKEN_HEADER = "X-Auth-Token";

  @Override
  protected void doFilterInternal(HttpServletRequest request,
                                  HttpServletResponse response,
                                  FilterChain filterChain)
          throws ServletException, IOException {

    String path = request.getRequestURI();

    // 1. Isolate login requests: Ensure /api/auth/login creates a FRESH session
    // and never destroys or overwrites an active session from another tab.
    if (path.endsWith("/api/auth/login")) {
      HttpServletRequest loginWrapper = new FreshLoginRequestWrapper(request);
      filterChain.doFilter(loginWrapper, response);

      HttpSession newSession = loginWrapper.getSession(false);
      if (newSession != null) {
        SessionRegistryService.register(newSession);
        if (!response.isCommitted()) {
          response.setHeader(SESSION_HEADER, newSession.getId());
        }
      }
      return;
    }

    // 2. Extract Session ID from headers only. A ?sessionId= query parameter would end up in
    // browser history, proxy logs and Referer headers, so it is deliberately not accepted.
    String requestedSessionId = request.getHeader(SESSION_HEADER);
    if (requestedSessionId == null || requestedSessionId.isBlank()) {
      requestedSessionId = request.getHeader(AUTH_TOKEN_HEADER);
    }
    if (requestedSessionId == null || requestedSessionId.isBlank()) {
      String auth = request.getHeader("Authorization");
      if (auth != null && auth.startsWith("Bearer ")) {
        requestedSessionId = auth.substring(7).trim();
      }
    }

    HttpServletRequest requestToUse = request;

    // 3. If an explicit Session ID is provided, bind the request to that tab's session.
    // If NO Session ID is provided on /api/** requests, strip the shared browser JSESSIONID cookie
    // so new tabs start completely fresh and isolated instead of inheriting another tab's identity.
    if (requestedSessionId != null && !requestedSessionId.isBlank()) {
      HttpSession trackedSession = SessionRegistryService.getSession(requestedSessionId);
      if (trackedSession != null) {
        requestToUse = new HeaderSessionRequestWrapper(request, trackedSession, requestedSessionId);
      } else {
        log.debug("Session ID {} not found in registry (may be expired)", requestedSessionId);
        if (path.startsWith("/api/")) {
          requestToUse = new FreshLoginRequestWrapper(request);
        }
      }
    } else if (path.startsWith("/api/")) {
      // New tab without tab-session: isolate from shared cookie jar
      requestToUse = new FreshLoginRequestWrapper(request);
    }

    filterChain.doFilter(requestToUse, response);

    // 4. Register whatever active session is attached
    HttpSession session = requestToUse.getSession(false);
    if (session != null) {
      SessionRegistryService.register(session);
      if (!response.isCommitted()) {
        response.setHeader(SESSION_HEADER, session.getId());
      }
    }
  }

  /**
   * Request wrapper that supplies a specific tab's tracked session.
   */
  private static class HeaderSessionRequestWrapper extends HttpServletRequestWrapper {
    private final HttpSession customSession;
    private final String customSessionId;

    public HeaderSessionRequestWrapper(HttpServletRequest request,
                                       HttpSession session,
                                       String sessionId) {
      super(request);
      this.customSession = session;
      this.customSessionId = sessionId;
    }

    @Override
    public HttpSession getSession(boolean create) {
      if (customSession != null) {
        try {
          customSession.getLastAccessedTime();
          return customSession;
        } catch (IllegalStateException e) {
          SessionRegistryService.unregister(customSessionId);
        }
      }
      return super.getSession(create);
    }

    @Override
    public HttpSession getSession() {
      return getSession(true);
    }

    @Override
    public String getRequestedSessionId() {
      return customSessionId != null ? customSessionId : super.getRequestedSessionId();
    }

    @Override
    public boolean isRequestedSessionIdValid() {
      if (customSession != null) {
        try {
          customSession.getLastAccessedTime();
          return true;
        } catch (IllegalStateException e) {
          return false;
        }
      }
      return super.isRequestedSessionIdValid();
    }

    @Override
    public boolean isRequestedSessionIdFromCookie() {
      return false;
    }

    @Override
    public boolean isRequestedSessionIdFromURL() {
      return false;
    }
  }

  /**
   * Request wrapper that strips JSESSIONID cookies during login
   * to guarantee that a new login allocates an isolated session without affecting other tabs.
   */
  private static class FreshLoginRequestWrapper extends HttpServletRequestWrapper {
    private HttpSession createdSession = null;

    public FreshLoginRequestWrapper(HttpServletRequest request) {
      super(request);
    }

    @Override
    public HttpSession getSession(boolean create) {
      if (createdSession != null) {
        try {
          createdSession.getLastAccessedTime();
          return createdSession;
        } catch (IllegalStateException e) {
          createdSession = null;
        }
      }
      if (!create) {
        return null;
      }
      createdSession = super.getSession(true);
      return createdSession;
    }

    @Override
    public HttpSession getSession() {
      return getSession(true);
    }

    @Override
    public String getRequestedSessionId() {
      return null;
    }

    @Override
    public boolean isRequestedSessionIdValid() {
      return false;
    }

    @Override
    public Cookie[] getCookies() {
      Cookie[] cookies = super.getCookies();
      if (cookies == null || cookies.length == 0) return cookies;
      List<Cookie> filtered = new ArrayList<>();
      for (Cookie c : cookies) {
        if (!"JSESSIONID".equalsIgnoreCase(c.getName())) {
          filtered.add(c);
        }
      }
      return filtered.toArray(new Cookie[0]);
    }

    @Override
    public String getHeader(String name) {
      if ("cookie".equalsIgnoreCase(name)) {
        String val = super.getHeader(name);
        return stripJSessionId(val);
      }
      return super.getHeader(name);
    }

    @Override
    public Enumeration<String> getHeaders(String name) {
      if ("cookie".equalsIgnoreCase(name)) {
        Enumeration<String> headers = super.getHeaders(name);
        List<String> list = new ArrayList<>();
        while (headers.hasMoreElements()) {
          String stripped = stripJSessionId(headers.nextElement());
          if (stripped != null && !stripped.isBlank()) {
            list.add(stripped);
          }
        }
        return Collections.enumeration(list);
      }
      return super.getHeaders(name);
    }

    private String stripJSessionId(String cookieHeader) {
      if (cookieHeader == null) return null;
      // Strip JSESSIONID=...; from cookie string
      return cookieHeader.replaceAll("(?i)(^|;\\s*)JSESSIONID=[^;]*", "").replaceFirst("^;\\s*", "");
    }
  }
}
