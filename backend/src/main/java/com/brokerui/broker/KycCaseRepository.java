package com.brokerui.broker;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface KycCaseRepository extends JpaRepository<KycCase, Long> {
  Optional<KycCase> findByUserId(Long userId);
}

