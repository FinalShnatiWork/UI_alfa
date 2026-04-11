package com.brokerui.broker;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SymbolRepository extends JpaRepository<Symbol, Long> {
  List<Symbol> findByEnabledTrueOrderByKindAscCodeAsc();

  Optional<Symbol> findByCode(String code);
}

