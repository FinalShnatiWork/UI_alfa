package com.brokerui.broker;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.domain.Pageable;
import java.util.Collection;
import java.time.Instant;
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

  // ─── Netting (V32) ─────────────────────────────────────────────────────────

  /** Orders the scheduler should look at: excludes simulator LIQUIDITY orders so they can never starve user orders. */
  @Query("SELECT o FROM BrokerOrder o WHERE o.status IN :statuses AND o.orderType <> 'LIQUIDITY' ORDER BY o.createdAt ASC")
  List<BrokerOrder> findExecutable(@Param("statuses") Collection<String> statuses, Pageable page);

  /** Resting orders on one side of the internal book (no lock — the service locks the ones it will use). */
  @Query("SELECT o FROM BrokerOrder o WHERE o.symbolCode = :symbol AND o.side = :side AND o.status IN :statuses "
      + "AND o.orderType IN :types AND o.limitPrice IS NOT NULL AND o.id <> :excludeId")
  List<BrokerOrder> findResting(@Param("symbol") String symbol, @Param("side") String side,
      @Param("statuses") Collection<String> statuses, @Param("types") Collection<String> types,
      @Param("excludeId") Long excludeId);

  /** Lock a set of orders, silently skipping rows another transaction is working on (never waits → no deadlock). */
  @Query(value = "SELECT * FROM broker_order WHERE id IN (:ids) ORDER BY id FOR UPDATE SKIP LOCKED", nativeQuery = true)
  List<BrokerOrder> lockSkipLocked(@Param("ids") Collection<Long> ids);

  List<BrokerOrder> findBySymbolCodeAndStatusInAndOrderTypeIn(String symbolCode, Collection<String> statuses, Collection<String> types);

  List<BrokerOrder> findByStatusInAndOrderType(Collection<String> statuses, String orderType);

  List<BrokerOrder> findByTradingAccountIdAndStatusInOrderByCreatedAtDesc(Long tradingAccountId, Collection<String> statuses);

  /** Share of recently filled netting-era quantity that crossed internally: [internal, filled]. */
  @Query("SELECT COALESCE(SUM(o.internalQty), 0), COALESCE(SUM(o.filledQty), 0) FROM BrokerOrder o "
      + "WHERE o.routing IN ('INTERNAL', 'EXTERNAL', 'SPLIT') AND o.filledAt > :since")
  List<Object[]> internalShareSince(@Param("since") Instant since);

  /** NN shadow result — targeted update so it can never overwrite fill fields written meanwhile. */
  @Modifying
  @Query("UPDATE BrokerOrder o SET o.nnMatchProb = :prob, o.nnExpectedSavings = :savings, "
      + "o.nnRouteRecommendation = :route, o.nnShadowCorrect = :correct WHERE o.id = :id")
  int updateNnShadow(@Param("id") Long id, @Param("prob") Double prob, @Param("savings") java.math.BigDecimal savings,
      @Param("route") String route, @Param("correct") Boolean correct);
}
