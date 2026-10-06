package com.brokerui.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

class SessionRegistryInvalidateUserTest {

  private static MockHttpSession signedIn(String email) {
    MockHttpSession s = new MockHttpSession();
    s.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
        new SecurityContextImpl(new UsernamePasswordAuthenticationToken(email, "x")));
    SessionRegistryService.register(s);
    return s;
  }

  @Test
  void endsEveryTabOfThatUser_andLeavesOthersSignedIn() {
    MockHttpSession tab1 = signedIn("banned@test.local");
    MockHttpSession tab2 = signedIn("Banned@Test.local");
    MockHttpSession other = signedIn("other@test.local");

    int ended = SessionRegistryService.invalidateUser("banned@test.local");

    assertEquals(2, ended);
    assertTrue(tab1.isInvalid());
    assertTrue(tab2.isInvalid());
    assertNull(SessionRegistryService.getSession(tab1.getId()));
    assertFalse(other.isInvalid());
    assertNotNull(SessionRegistryService.getSession(other.getId()));
    SessionRegistryService.unregister(other.getId());
  }
}
