package com.brokerui.api;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controller providing system health check endpoint.
 */
@RestController
public class HealthController {
  
  /**
   * Endpoint returning system health check status and current timestamp.
   * Used by frontend polling to confirm server availability.
   *
   * @return a map indicating status and timestamp
   */
  @GetMapping("/api/health")
  public Map<String, Object> health() {
    return Map.of("ok", true, "ts", Instant.now().toString());
  }
}

