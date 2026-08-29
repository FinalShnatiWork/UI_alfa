package com.brokerui;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * The main application launcher class for the Spring Boot application.
 */
@SpringBootApplication
@EnableScheduling
public class BackendApplication {
  /**
   * The entry point of the Spring Boot JVM application.
   *
   * @param args command line arguments
   */
  public static void main(String[] args) {
    SpringApplication.run(BackendApplication.class, args);
  }
}

