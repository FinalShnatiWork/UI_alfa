package com.brokerui.broker;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BrokerOrderRepository extends JpaRepository<BrokerOrder, Long> {
  List<BrokerOrder> findByTradingAccountIdOrderByCreatedAtDesc(Long tradingAccountId);

  List<BrokerOrder> findByTradingAccountIdAndStatusOrderByFilledAtDesc(Long tradingAccountId, String status);

  List<BrokerOrder> findByTradingAccountIdAndStatusOrderByCreatedAtDesc(Long tradingAccountId, String status);

  List<BrokerOrder> findTop50ByStatusOrderByCreatedAtAsc(String status);

  long countBySymbolCodeAndSideAndStatus(String symbolCode, String side, String status);

  /**
   * Pessimistic write lock on the order row. Use inside {@code @Transactional} methods that
   * either fill or cancel a pending order so the two paths cannot both observe status=NEW
   * and both settle the reserved margin.
   * <p>
   * Lock order across cancel/fill: always lock the <em>order</em> first, then the trading
   * account, to avoid deadlocks between the two code paths.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT o FROM BrokerOrder o WHERE o.id = :id")
  Optional<BrokerOrder> findByIdForUpdate(@Param("id") Long id);
}

