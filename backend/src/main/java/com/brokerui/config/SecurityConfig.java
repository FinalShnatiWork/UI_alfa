package com.brokerui.config;

import com.brokerui.auth.AppUserDetailsService;
import com.brokerui.broker.AuditLogService;
import com.brokerui.user.AppUserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.expression.WebExpressionAuthorizationManager;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.authentication.DisabledException;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;
import java.util.Arrays;

/**
 * Configuration class for Spring Security.
 * Defines password encoders, CORS policy, user auth providers, and requests routing rules.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

  // @Lazy prevents circular dependency: SecurityConfig → AuditLogService → AuditLogRepository
  private final AuditLogService auditLogService;
  private final AppUserRepository appUserRepository;

  /**
   * Constructs the SecurityConfig with lazily loaded audit and user repos.
   *
   * @param auditLogService the security audit logging service
   * @param appUserRepository the user accounts database repository
   */
  public SecurityConfig(@Lazy AuditLogService auditLogService,
                        @Lazy AppUserRepository appUserRepository) {
    this.auditLogService = auditLogService;
    this.appUserRepository = appUserRepository;
  }

  /**
   * Defines the standard BCrypt password hashing encoder bean.
   *
   * @return BCrypt password encoder instance
   */
  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  /**
   * Builds the CORS policy allowing credentials and arbitrary origin request patterns.
   *
   * @return the CORS configurations source bean
   */
  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOriginPatterns(List.of("*"));
    configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setExposedHeaders(Arrays.asList("X-Session-Id", "X-Auth-Token", "Set-Cookie"));
    configuration.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  /**
   * Configures the DAO authentication provider utilizing custom details service and BCrypt.
   *
   * @param userDetailsService the database app user details service
   * @param passwordEncoder the BCrypt encoder bean
   * @return the configured DAO authentication provider bean
   */
  @Bean
  public DaoAuthenticationProvider daoAuthenticationProvider(
      AppUserDetailsService userDetailsService, PasswordEncoder passwordEncoder) {
    DaoAuthenticationProvider p = new DaoAuthenticationProvider();
    p.setUserDetailsService(userDetailsService);
    p.setPasswordEncoder(passwordEncoder);
    return p;
  }

  /**
   * Configures the primary HttpSecurity filter chain, including routing, CSRF, login/logout, and exceptions.
   *
   * @param http HttpSecurity configuration builder
   * @param daoAuthenticationProvider configured database user auth provider
   * @param headerSessionFilter filter that binds requests with X-Session-Id to tab-isolated HttpSessions
   * @return the final constructed SecurityFilterChain bean
   * @throws Exception if security building fails
   */
  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http,
                                         DaoAuthenticationProvider daoAuthenticationProvider,
                                         HeaderSessionFilter headerSessionFilter)
      throws Exception {
    CookieCsrfTokenRepository csrfRepo = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfRepo.setCookiePath("/");
    CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
    csrfHandler.setCsrfRequestAttributeName(null);

    AuthenticationSuccessHandler okJson =
        (request, response, authentication) -> {
          // Audit: successful login
          String email = authentication.getName();
          appUserRepository.findByEmailIgnoreCase(email).ifPresent(user ->
              auditLogService.log(user, "LOGIN_SUCCESS", "email=" + email, request));
          jakarta.servlet.http.HttpSession session = request.getSession(false);
          String sid = session != null ? session.getId() : "";
          if (session != null) {
            SessionRegistryService.register(session);
          }
          response.setStatus(200);
          response.setContentType("application/json;charset=UTF-8");
          response.setHeader("X-Session-Id", sid);
          response.getWriter().write("{\"ok\":true,\"sessionId\":\"" + sid + "\"}");
        };
    AuthenticationFailureHandler denyJson =
        (request, response, exception) -> {
          // Audit: failed login attempt
          String username = request.getParameter("username");
          auditLogService.log(null, "LOGIN_FAILURE",
              "username=" + username + ", reason=" + exception.getClass().getSimpleName(), request);
          response.setStatus(401);
          response.setContentType("application/json;charset=UTF-8");
          if (exception instanceof DisabledException) {
            response.getWriter().write("{\"ok\":false,\"error\":\"banned\"}");
          } else {
            response.getWriter().write("{\"ok\":false,\"error\":\"invalid_credentials\"}");
          }
        };

    http.addFilterBefore(headerSessionFilter, org.springframework.security.web.context.SecurityContextHolderFilter.class);

    http.authenticationProvider(daoAuthenticationProvider)
        .cors(cors -> cors.configurationSource(corsConfigurationSource()))
        .csrf(
            csrf ->
                csrf.csrfTokenRepository(csrfRepo)
                    .csrfTokenRequestHandler(csrfHandler)
                    .ignoringRequestMatchers(
                        new AntPathRequestMatcher("/api/auth/login", "POST"),
                        new AntPathRequestMatcher("/api/admin/**"),
                        request -> request.getHeader("X-Session-Id") != null || request.getHeader("X-Auth-Token") != null))
        .sessionManagement(
            sm -> sm.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers("/api/health")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/auth/csrf")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/auth/register")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/auth/login")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/market/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/market/price/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/nn/predict")
                    .authenticated()
                    .requestMatchers(HttpMethod.GET, "/api/broker/symbols")
                    .permitAll()
                    .requestMatchers("/api/broker/**")
                    .authenticated()
                    // LocalhostOnlyFilter still drops remote callers.
                    // On this machine the caller must also be a logged-in ADMIN.
                    .requestMatchers("/api/admin/**")
                    .hasRole("ADMIN")
                    .requestMatchers(HttpMethod.GET, "/api/auth/me")
                    .authenticated()
                    .requestMatchers(HttpMethod.POST, "/api/auth/profile")
                    .authenticated()
                    .requestMatchers(HttpMethod.POST, "/api/auth/password")
                    .authenticated()
                    .requestMatchers(HttpMethod.POST, "/api/auth/logout")
                    .authenticated()
                    .requestMatchers("/error")
                    .permitAll()
                    .requestMatchers("/ws/**")
                    .permitAll()
                    .requestMatchers("/", "/index.html", "/assets/**", "/*.js", "/*.css", "/*.ico", "/*.png", "/*.svg")
                    .permitAll()
                    // HTML5 routes (BrowserRouter): GET /landing, /admin, … must reach index.html
                    .requestMatchers(
                        request ->
                            "GET".equalsIgnoreCase(request.getMethod())
                                && !request.getServletPath().startsWith("/api")
                                && !request.getServletPath().startsWith("/ws"))
                    .permitAll()
                    .anyRequest()
                    .denyAll())
        .formLogin(
            form ->
                form.loginProcessingUrl("/api/auth/login")
                    .usernameParameter("username")
                    .passwordParameter("password")
                    .successHandler(okJson)
                    .failureHandler(denyJson)
                    .permitAll())
        .logout(
            logout ->
                logout.logoutUrl("/api/auth/logout")
                    .logoutSuccessHandler(
                        (request, response, authentication) -> {
                          String sid = request.getHeader("X-Session-Id");
                          if (sid != null) {
                            SessionRegistryService.unregister(sid);
                          }
                          response.setStatus(200);
                          response.setContentType("application/json;charset=UTF-8");
                          response.getWriter().write("{\"ok\":true}");
                        })
                    .deleteCookies("JSESSIONID", "XSRF-TOKEN")
                    .invalidateHttpSession(true)
                    .clearAuthentication(true))
        .exceptionHandling(
            ex ->
                ex.authenticationEntryPoint(
                        (request, response, e) -> {
                          response.setStatus(401);
                          response.setContentType("application/json;charset=UTF-8");
                          response.getWriter().write("{\"ok\":false,\"error\":\"unauthorized\"}");
                        })
                    .accessDeniedHandler(
                        (request, response, e) -> {
                          response.setStatus(403);
                          response.setContentType("application/json;charset=UTF-8");
                          response.getWriter().write("{\"ok\":false,\"error\":\"forbidden\"}");
                        }));

    return http.build();
  }
}
