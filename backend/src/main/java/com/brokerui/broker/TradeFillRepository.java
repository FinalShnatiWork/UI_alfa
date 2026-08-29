package com.brokerui.broker;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TradeFillRepository extends JpaRepository<TradeFill, Long> {
  List<TradeFill> findByOrderId(Long orderId);
  List<TradeFill> findByOrderIdOrderByExecutedAtDesc(Long orderId);
}
