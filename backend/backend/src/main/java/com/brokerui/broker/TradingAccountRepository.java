package com.brokerui.broker;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TradingAccountRepository extends JpaRepository<TradingAccount, Long> {
  List<TradingAccount> findByUserIdOrderByIdAsc(Long userId);

  Optional<TradingAccount> findFirstByUserIdOrderByIdAsc(Long userId);
}

