package com.brokerui.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Security filter that restricts ALL /api/admin/** endpoints to localhost only.
 * Any request originating from outside 127.0.0.1 / ::1 is rejected with HTTP 403.
 *
 * This runs BEFORE Spring Security so no token, session, or role can bypass it
 * from a remote machine – the connection is dropped at the filter level.
 */
@Component
@Order(1) // Run before everything else
public class LocalhostOnlyFilter extends OncePerRequestFilter {

    private static final Set<String> LOCALHOST_ADDRESSES = Set.of(
            "127.0.0.1",
            "::1",
            "0:0:0:0:0:0:0:1"   // IPv6 loopback long form
    );

    /**
     * Inspects incoming HTTP requests. If the request is for an admin resource,
     * verifies that the remote address is a localhost IP (127.0.0.1 or IPv6 loopback).
     * If not, blocks the request and returns HTTP 403 Forbidden.
     *
     * @param request the servlet request
     * @param response the servlet response
     * @param filterChain the servlet filter chain
     * @throws ServletException if a servlet exception occurs
     * @throws IOException if an I/O exception occurs
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Restrict both ADMIN API and the ADMIN HTML page to localhost
        if (path.startsWith("/api/admin") || path.endsWith("/admin.html") || path.contains("/pages/admin")) {
            String remoteAddr = request.getRemoteAddr();

            if (!LOCALHOST_ADDRESSES.contains(remoteAddr)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write(
                    "{\"ok\":false,\"error\":\"admin access is restricted to localhost only (from this machine only)\"}"
                );
                return; // DROP the request – do not continue the filter chain
            }
        }

        filterChain.doFilter(request, response);
    }
}
