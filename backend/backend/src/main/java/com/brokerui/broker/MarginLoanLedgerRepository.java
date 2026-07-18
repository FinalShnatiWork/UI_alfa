package com.brokerui.broker;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarginLoanLedgerRepository extends JpaRepository<MarginLoanLedger, Long> {
  List<MarginLoanLedger> findByTradingAccountIdOrderByCreatedAtDesc(Long tradingAccountId);

  List<MarginLoanLedger> findAllByOrderByCreatedAtDesc();
}
