package com.brokerui;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * Dedicated pool for the four broker schedulers (order tick, SL/TP, liquidation, interest).
 * The default Spring pool size is 1, so a slow price sweep blocked liquidation checks.
 */
@Configuration
public class SchedulingConfig {

  @Bean
  public TaskScheduler taskScheduler() {
    ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(4);
    scheduler.setThreadNamePrefix("broker-sched-");
    scheduler.setRemoveOnCancelPolicy(true);
    scheduler.setWaitForTasksToCompleteOnShutdown(true);
    scheduler.setAwaitTerminationSeconds(5);
    scheduler.initialize();
    return scheduler;
  }
}
