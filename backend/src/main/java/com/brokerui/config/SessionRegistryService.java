package com.brokerui.config;

import com.brokerui.SchedulerLeader;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;

/**
 * Ends signed-in sessions. Sessions are rows in the spring_session table shared by every backend
 * copy, so ending one here signs the user out on all copies at once.
 */
@Service
public class SessionRegistryService {

  private static final Logger log = LoggerFactory.getLogger(SessionRegistryService.class);

  private final FindByIndexNameSessionRepository<? extends Session> sessions;
  private final JdbcTemplate jdbc;

  @Autowired(required = false)
  private SchedulerLeader schedulerLeader;

  public SessionRegistryService(
      FindByIndexNameSessionRepository<? extends Session> sessions, JdbcTemplate jdbc) {
    this.sessions = sessions;
    this.jdbc = jdbc;
  }

  /**
   * Ends every session signed in as {@code email}, so a ban or deletion takes effect at once
   * instead of when the session times out.
   *
   * @return how many sessions were ended
   */
  public int invalidateUser(String email) {
    return invalidateUserExcept(email, null);
  }

  /**
   * Ends sessions signed in as {@code email}, except the one that just changed the password.
   *
   * @param keepSessionId session that stays signed in, or null to end every session of that user
   * @return how many sessions were ended
   */
  public int invalidateUserExcept(String email, String keepSessionId) {
    if (email == null || email.isBlank()) return 0;
    Map<String, ? extends Session> found = sessions.findByPrincipalName(email);
    int ended = 0;
    for (String id : found.keySet()) {
      if (id.equals(keepSessionId)) continue;
      sessions.deleteById(id);
      ended++;
    }
    if (ended > 0) log.info("Ended {} session(s) for {}", ended, email);
    return ended;
  }

  /**
   * Safety net for a login that finished while an admin was banning the same user, and for
   * sessions whose email no longer exists: such sessions are removed within a few seconds.
   */
  @Scheduled(fixedDelay = 5000, initialDelay = 5000)
  public void endSessionsOfBannedOrMissingUsers() {
    if (schedulerLeader != null && !schedulerLeader.isLeader()) return;
    int ended = jdbc.update(
        "DELETE FROM spring_session s WHERE s.principal_name IS NOT NULL AND NOT EXISTS ("
            + " SELECT 1 FROM app_user u WHERE lower(u.email) = lower(s.principal_name)"
            + " AND u.banned = false)");
    if (ended > 0) log.info("Ended {} session(s) of banned or deleted users", ended);
  }
}
