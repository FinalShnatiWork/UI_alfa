package com.brokerui.broker;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BrokerOrderRepository extends JpaRepository<BrokerOrder, Long> {
  List<BrokerOrder> findByTradingAccountIdOrderByCreatedAtDesc(Long tradingAccountId);

  List<BrokerOrder> findByTradingAccountIdAndStatusOrderByFilledAtDesc(Long tradingAccountId, String status);

  List<BrokerOrder> findByTradingAccountIdAndStatusOrderByCreatedAtDesc(Long tradingAccountId, String status);

  List<BrokerOrder> findTop50ByStatusOrderByCreatedAtAsc(String status);
}
