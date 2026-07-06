package com.brokerui.sim;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository interface for managing SimTrade database records.
 */
public interface SimTradeRepository extends JpaRepository<SimTrade, Long> {
  /**
   * Retrieves the top 200 simulation trades sorted by ID in descending order.
   * The goal of this method is to load recent simulation history for monitoring.
   *
   * @return list of recent simulation trades
   */
  List<SimTrade> findTop200ByOrderByIdDesc();
}
