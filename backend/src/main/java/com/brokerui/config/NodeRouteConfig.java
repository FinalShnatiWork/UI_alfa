package com.brokerui.config;

import com.brokerui.user.AppUserRepository;
import org.apache.catalina.Engine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Support for running several backend copies behind the Nginx load balancer.
 *
 * Sessions live in the memory of the copy that created them. With {@code broker.node-name=a}
 * Tomcat ends every session id with ".a", and Nginx reads that suffix from the X-Session-Id header
 * to send the user back to the same copy. Without the property ids look exactly as before.
 */
@Configuration
public class NodeRouteConfig {

  @Bean
  public WebServerFactoryCustomizer<TomcatServletWebServerFactory> nodeRouteCustomizer(
      @Value("${broker.node-name:}") String nodeName) {
    return factory -> {
      if (nodeName == null || nodeName.isBlank()) return;
      factory.addContextCustomizers(context -> {
        if (context.getParent() != null && context.getParent().getParent() instanceof Engine engine) {
          engine.setJvmRoute(nodeName.trim());
        }
      });
    };
  }

  /**
   * A ban or deletion ends sessions only on the copy that handled the admin request, so each copy
   * also ends its own sessions of users that are now banned or gone.
   */
  @Bean
  public BannedSessionSweeper bannedSessionSweeper(AppUserRepository users) {
    return new BannedSessionSweeper(users);
  }

  public static class BannedSessionSweeper {
    private final AppUserRepository users;

    BannedSessionSweeper(AppUserRepository users) {
      this.users = users;
    }

    @Scheduled(fixedDelay = 5000, initialDelay = 5000)
    public void sweep() {
      for (String email : SessionRegistryService.signedInEmails()) {
        boolean blocked = users.findByEmailIgnoreCase(email).map(u -> u.isBanned()).orElse(true);
        if (blocked) SessionRegistryService.invalidateUser(email);
      }
    }
  }
}
