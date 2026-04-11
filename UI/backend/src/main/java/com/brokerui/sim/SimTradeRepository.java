package com.brokerui.sim;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimTradeRepository extends JpaRepository<SimTrade, Long> {
  List<SimTrade> findTop200ByOrderByIdDesc();
}
