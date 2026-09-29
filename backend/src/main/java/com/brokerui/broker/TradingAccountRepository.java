package com.brokerui.broker;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TradingAccountRepository extends JpaRepository<TradingAccount, Long> {

  List<TradingAccount> findByUserIdOrderByIdAsc(Long userId);

  Optional<TradingAccount> findFirstByUserIdOrderByIdAsc(Long userId);

  /**
   * Pessimistic write lock – use inside @Transactional methods that modify balance
   * to prevent lost-update race conditions when multiple requests hit the same account.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT ta FROM TradingAccount ta WHERE ta.id = :id")
  Optional<TradingAccount> findByIdForUpdate(@Param("id") Long id);

  /** Accounts that currently owe money on the margin credit line. */
  List<TradingAccount> findByBorrowedBalanceGreaterThan(BigDecimal threshold);

  /** Ids of the simulated "computer" accounts (V32). */
  @Query("SELECT ta.id FROM TradingAccount ta WHERE ta.simulated = true ORDER BY ta.id")
  List<Long> findSimulatedIds();
}
