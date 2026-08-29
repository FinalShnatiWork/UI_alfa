package com.brokerui.broker;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountTransactionRepository extends JpaRepository<AccountTransaction, Long> {
  List<AccountTransaction> findByTradingAccountIdOrderByCreatedAtDesc(Long tradingAccountId);
}

