package com.brokerui;

import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Lets only one copy of the backend run the broker schedulers (order tick, SL/TP, liquidation,
 * interest, simulator, MT5 sync) when several copies share one database behind the load balancer.
 *
 * The leader holds a PostgreSQL session advisory lock on a connection it keeps open. If that copy
 * stops or crashes, the connection closes, Postgres releases the lock, and the next tick of another
 * copy takes it over. On a database without advisory locks (H2 in tests) every copy is the leader.
 */
@Component
public class SchedulerLeader {

  private static final Logger log = LoggerFactory.getLogger(SchedulerLeader.class);
  private static final long LOCK_KEY = 0x42524f4b45524cL; // "BROKERL"

  private final DataSource dataSource;
  private Connection lockConnection;
  private Boolean postgres;

  public SchedulerLeader(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  /** True when this copy should run the schedulers on this tick. */
  public synchronized boolean isLeader() {
    try {
      if (postgres == null) {
        try (Connection c = dataSource.getConnection()) {
          postgres = c.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        }
      }
      if (!postgres) return true;
      if (lockConnection != null) {
        if (lockConnection.isValid(2)) return true;
        log.warn("[Scheduler] Lost the leader connection; trying to take the lock again");
        evictQuietly();
      }
      Connection c = dataSource.getConnection();
      boolean got;
      try (PreparedStatement ps = c.prepareStatement("select pg_try_advisory_lock(?)")) {
        ps.setLong(1, LOCK_KEY);
        try (ResultSet rs = ps.executeQuery()) {
          got = rs.next() && rs.getBoolean(1);
        }
      }
      if (!got) {
        c.close();
        return false;
      }
      lockConnection = c;
      log.info("[Scheduler] This copy now runs the broker schedulers");
      return true;
    } catch (Exception e) {
      log.warn("[Scheduler] Leader check failed: {}", e.getMessage());
      evictQuietly();
      return false;
    }
  }

  /** Closing a pooled connection only returns it to the pool, so the lock is released explicitly. */
  @PreDestroy
  public synchronized void release() {
    if (lockConnection == null) return;
    try (PreparedStatement ps = lockConnection.prepareStatement("select pg_advisory_unlock(?)")) {
      ps.setLong(1, LOCK_KEY);
      ps.execute();
    } catch (Exception e) {
      log.warn("[Scheduler] Could not release the leader lock: {}", e.getMessage());
    }
    closeQuietly();
  }

  private void closeQuietly() {
    if (lockConnection == null) return;
    try {
      lockConnection.close();
    } catch (Exception ignored) {
    }
    lockConnection = null;
  }

  /** A broken leader connection must not go back to the pool still holding the lock. */
  private void evictQuietly() {
    if (lockConnection == null) return;
    try {
      dataSource.unwrap(HikariDataSource.class).evictConnection(lockConnection);
      lockConnection = null;
    } catch (Exception e) {
      closeQuietly();
    }
  }
}
