package com.brokerui.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.session.web.http.HttpSessionIdResolver;
import org.springframework.stereotype.Component;

/**
 * Each browser tab keeps its own session id in sessionStorage and sends it as {@code X-Session-Id},
 * so two people can be signed in side by side in one browser. The shared cookie jar is never used
 * for the session. A login always starts a fresh session and never touches another tab's one.
 */
@Component
public class HeaderSessionIdResolver implements HttpSessionIdResolver {

  public static final String SESSION_HEADER = "X-Session-Id";
  public static final String AUTH_TOKEN_HEADER = "X-Auth-Token";

  private static final Pattern SESSION_ID =
      Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

  @Override
  public List<String> resolveSessionIds(HttpServletRequest request) {
    if (request.getRequestURI().endsWith("/api/auth/login")) return List.of();
    String id = request.getHeader(SESSION_HEADER);
    if (id == null || id.isBlank()) id = request.getHeader(AUTH_TOKEN_HEADER);
    if (id == null || id.isBlank()) {
      String auth = request.getHeader("Authorization");
      if (auth != null && auth.startsWith("Bearer ")) id = auth.substring(7);
    }
    if (id == null) return List.of();
    id = id.trim();
    return SESSION_ID.matcher(id).matches() ? List.of(id) : List.of();
  }

  @Override
  public void setSessionId(HttpServletRequest request, HttpServletResponse response, String sessionId) {
    response.setHeader(SESSION_HEADER, sessionId);
  }

  @Override
  public void expireSession(HttpServletRequest request, HttpServletResponse response) {
    response.setHeader(SESSION_HEADER, "");
  }
}
