package com.brokerui.config;

import com.brokerui.auth.AppUserDetailsService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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

@Configuration
@EnableWebSecurity
public class SecurityConfig {

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOriginPatterns(List.of("*"));
    configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  @Bean
  public DaoAuthenticationProvider daoAuthenticationProvider(
      AppUserDetailsService userDetailsService, PasswordEncoder passwordEncoder) {
    DaoAuthenticationProvider p = new DaoAuthenticationProvider();
    p.setUserDetailsService(userDetailsService);
    p.setPasswordEncoder(passwordEncoder);
    return p;
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http, DaoAuthenticationProvider daoAuthenticationProvider)
      throws Exception {
    CookieCsrfTokenRepository csrfRepo = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfRepo.setCookiePath("/");
    CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
    csrfHandler.setCsrfRequestAttributeName(null);

    AuthenticationSuccessHandler okJson =
        (request, response, authentication) -> {
          response.setStatus(200);
          response.setContentType("application/json;charset=UTF-8");
          response.getWriter().write("{\"ok\":true}");
        };
    AuthenticationFailureHandler denyJson =
        (request, response, exception) -> {
          response.setStatus(401);
          response.setContentType("application/json;charset=UTF-8");
          if (exception instanceof DisabledException) {
            response.getWriter().write("{\"ok\":false,\"error\":\"banned\"}");
          } else {
            response.getWriter().write("{\"ok\":false,\"error\":\"invalid_credentials\"}");
          }
        };

    http.authenticationProvider(daoAuthenticationProvider)
        .cors(cors -> cors.configurationSource(corsConfigurationSource()))
        .csrf(
            csrf ->
                csrf.csrfTokenRepository(csrfRepo)
                    .csrfTokenRequestHandler(csrfHandler)
                    .ignoringRequestMatchers(
                        new AntPathRequestMatcher("/api/auth/login", "POST"),
                        new AntPathRequestMatcher("/api/admin/**")))
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
                    .requestMatchers(HttpMethod.GET, "/api/broker/symbols")
                    .permitAll()
                    .requestMatchers("/api/broker/**")
                    .authenticated()
                    // Admin APIs: LocalhostOnlyFilter restricts this to 127.0.0.1.
                    // We permitAll here so the admin doesn't need to log in when on localhost.
                    .requestMatchers("/api/admin/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/auth/me")
                    .authenticated()
                    .requestMatchers(HttpMethod.POST, "/api/auth/logout")
                    .authenticated()
                    .requestMatchers("/error")
                    .permitAll()
                    .requestMatchers("/ws/**")
                    .permitAll()
                    .requestMatchers("/", "/index.html", "/assets/**", "/*.js", "/*.css", "/*.ico", "/*.png", "/*.svg")
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
