package com.brokerui.broker.netting;

import java.math.BigDecimal;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Netting settings from application.yml ({@code broker.netting.*}), plus runtime test toggles. */
@Component
public class NettingProperties {

  /** What the broker would pay an external venue per routed leg (same as TradingFees.COMMISSION_PER_TRADE). */
  @Value("${broker.netting.external-fee-per-trade:1.50}")
  private BigDecimal externalFeePerTrade;

  /** Call the NN after commit and store its opinion. It never decides. */
  @Value("${broker.netting.nn-shadow:true}")
  private boolean nnShadow;

  /** How long a marketable LIMIT waits for an internal counterparty before going external. 0 = never wait. */
  @Value("${broker.netting.limit-wait-ms:8000}")
  private long limitWaitMs;

  /** Enables /api/admin/netting/test/** and sim inject endpoints (localhost-only anyway). */
  @Value("${broker.netting.test-endpoints.enabled:true}")
  private boolean testEndpointsEnabled;

  @Value("${broker.netting.test-endpoints.freeze-ttl-minutes:10}")
  private long freezeTtlMinutes;

  /** Runtime switch used by the V13 scenario: behave as if the NN server were down. */
  private final AtomicBoolean nnOffline = new AtomicBoolean(false);

  public BigDecimal getExternalFeePerTrade() { return externalFeePerTrade; }
  public boolean isNnShadow() { return nnShadow; }
  public long getLimitWaitMs() { return limitWaitMs; }
  public void setLimitWaitMs(long ms) { this.limitWaitMs = Math.max(0, ms); }
  public boolean isTestEndpointsEnabled() { return testEndpointsEnabled; }
  public long getFreezeTtlMinutes() { return freezeTtlMinutes; }
  public boolean isNnOffline() { return nnOffline.get(); }
  public void setNnOffline(boolean on) { nnOffline.set(on); }
}
