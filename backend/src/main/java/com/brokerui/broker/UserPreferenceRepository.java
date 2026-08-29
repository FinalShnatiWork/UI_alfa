package com.brokerui.broker;

import com.brokerui.user.AppUser;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPreferenceRepository extends JpaRepository<UserPreference, Long> {
  Optional<UserPreference> findByUserAndPrefKey(AppUser user, String prefKey);
  List<UserPreference> findByUser(AppUser user);
}
