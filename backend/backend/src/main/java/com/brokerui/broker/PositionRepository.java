package com.brokerui.broker;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PositionRepository extends JpaRepository<Position, Long> {
  List<Position> findByTradingAccountIdOrderByUpdatedAtDesc(Long tradingAccountId);

  Optional<Position> findByTradingAccountIdAndSymbolCode(Long tradingAccountId, String symbolCode);
}

