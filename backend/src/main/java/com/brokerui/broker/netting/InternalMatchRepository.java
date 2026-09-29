package com.brokerui.broker.netting;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InternalMatchRepository extends JpaRepository<InternalMatch, Long> {
  List<InternalMatch> findByIdGreaterThanOrderByIdAsc(Long id);
  List<InternalMatch> findTop200ByOrderByIdDesc();
}
