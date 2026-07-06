package com.brokerui.broker;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PositionRepository extends JpaRepository<Position, Long> {

  List<Position> findByTradingAccountIdOrderByUpdatedAtDesc(Long tradingAccountId);

  Optional<Position> findByTradingAccountIdAndSymbolCode(Long tradingAccountId, String symbolCode);

  Optional<Position> findByTradingAccountIdAndSymbolCodeAndSide(
      Long tradingAccountId, String symbolCode, String side);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT p FROM Position p WHERE p.tradingAccount.id = :accountId AND p.symbolCode = :symbolCode AND p.side = :side")
  Optional<Position> findByTradingAccountIdAndSymbolCodeAndSideForUpdate(
      @Param("accountId") Long accountId, @Param("symbolCode") String symbolCode, @Param("side") String side);

  /**
   * Pessimistic write lock on a single position – used when placing a SELL order
   * or executing order matching where side isn't explicitly known.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT p FROM Position p WHERE p.tradingAccount.id = :accountId AND p.symbolCode = :symbolCode")
  Optional<Position> findByTradingAccountIdAndSymbolCodeForUpdate(
      @Param("accountId") Long accountId, @Param("symbolCode") String symbolCode);

  /**
   * Pessimistic write lock by position id – used when closing a position.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT p FROM Position p WHERE p.id = :id")
  Optional<Position> findByIdForUpdate(@Param("id") Long id);
}
