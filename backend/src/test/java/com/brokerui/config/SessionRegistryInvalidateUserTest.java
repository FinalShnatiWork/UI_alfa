package com.brokerui.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.MapSession;

class SessionRegistryInvalidateUserTest {

  @SuppressWarnings("unchecked")
  private final FindByIndexNameSessionRepository<MapSession> sessions =
      mock(FindByIndexNameSessionRepository.class);
  private final SessionRegistryService registry =
      new SessionRegistryService(sessions, mock(JdbcTemplate.class));

  @Test
  void endsEveryTabOfThatUser() {
    when(sessions.findByPrincipalName("banned@test.local"))
        .thenReturn(Map.of("tab1", new MapSession("tab1"), "tab2", new MapSession("tab2")));

    int ended = registry.invalidateUser("banned@test.local");

    assertEquals(2, ended);
    verify(sessions).deleteById("tab1");
    verify(sessions).deleteById("tab2");
  }

  @Test
  void passwordChangeKeepsTheTabThatChangedIt() {
    when(sessions.findByPrincipalName("week1-check@test.local"))
        .thenReturn(Map.of("here", new MapSession("here"), "other", new MapSession("other")));

    int ended = registry.invalidateUserExcept("week1-check@test.local", "here");

    assertEquals(1, ended);
    verify(sessions).deleteById("other");
    verify(sessions, never()).deleteById("here");
  }

  @Test
  void blankEmailEndsNothing() {
    assertEquals(0, registry.invalidateUser(" "));
    verify(sessions, never()).findByPrincipalName(" ");
  }
}
