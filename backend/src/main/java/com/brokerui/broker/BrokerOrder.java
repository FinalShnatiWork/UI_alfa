package com.brokerui.broker;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "broker_order")
public class BrokerOrder {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @JsonIgnore
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "trading_account_id", nullable = false)
  private TradingAccount tradingAccount;

  @Column(name = "symbol_code", nullable = false, length = 32)
  private String symbolCode;

  @Column(nullable = false, length = 8)
  private String side;

  @Column(name = "order_type", nullable = false, length = 16)
  private String orderType;

  @Column(nullable = false, length = 24)
  private String status = "NEW";

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal quantity;

  @Column(name = "limit_price", precision = 18, scale = 8)
  private BigDecimal limitPrice;

  @Column(name = "stop_price", precision = 18, scale = 8)
  private BigDecimal stopPrice;

  @Column(name = "take_profit", precision = 18, scale = 8)
  private BigDecimal takeProfit;

  @Column(name = "stop_loss", precision = 18, scale = 8)
  private BigDecimal stopLoss;

  @Column(name = "client_tag", length = 64)
  private String clientTag;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "filled_at")
  private Instant filledAt;

  @Column(name = "entry_price", precision = 18, scale = 8)
  private BigDecimal entryPrice;

  @Column(name = "realized_pnl", precision = 18, scale = 8)
  private BigDecimal realizedPnl;

  @Column(name = "nn_route_recommendation", length = 20)
  private String nnRouteRecommendation;

  @Column(name = "nn_match_prob")
  private Double nnMatchProb;

  @Column(name = "nn_expected_savings", precision = 18, scale = 4)
  private BigDecimal nnExpectedSavings;

  @Column(name = "open_price", precision = 18, scale = 8)
  private BigDecimal openPrice;

  @Column(name = "opened_at")
  private Instant openedAt;

  // Commission actually charged to the client for this fill (open or close). Real money.
  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal commission = BigDecimal.ZERO;

  // ─── Netting (V32) ─────────────────────────────────────────────────────────
  @Column(name = "filled_qty", nullable = false, precision = 18, scale = 8)
  private BigDecimal filledQty = BigDecimal.ZERO;

  @Column(name = "internal_qty", nullable = false, precision = 18, scale = 8)
  private BigDecimal internalQty = BigDecimal.ZERO;

  @Column(name = "external_qty", nullable = false, precision = 18, scale = 8)
  private BigDecimal externalQty = BigDecimal.ZERO;

  /** Cash still reserved for the unfilled part (null for orders created before V32). */
  @Column(name = "reserve_remaining", precision = 18, scale = 8)
  private BigDecimal reserveRemaining;

  /** INTERNAL | EXTERNAL | SPLIT | LEGACY (null while nothing has been filled). */
  @Column(name = "routing", length = 16)
  private String routing;

  /** When a marketable LIMIT stops waiting for an internal counterparty (status PENDING_NET). */
  @Column(name = "net_deadline")
  private Instant netDeadline;

  /** Open position this order reduces. Null for a normal order that opens a new position. */
  @Column(name = "closes_position_id")
  private Long closesPositionId;

  /** NN advisor (shadow mode) agreed with what the engine actually did. */
  @Column(name = "nn_shadow_correct")
  private Boolean nnShadowCorrect;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public TradingAccount getTradingAccount() {
    return tradingAccount;
  }

  public void setTradingAccount(TradingAccount tradingAccount) {
    this.tradingAccount = tradingAccount;
  }

  public String getSymbolCode() {
    return symbolCode;
  }

  public void setSymbolCode(String symbolCode) {
    this.symbolCode = symbolCode;
  }

  public String getSide() {
    return side;
  }

  public void setSide(String side) {
    this.side = side;
  }

  public String getOrderType() {
    return orderType;
  }

  public void setOrderType(String orderType) {
    this.orderType = orderType;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }

  public void setQuantity(BigDecimal quantity) {
    this.quantity = quantity;
  }

  public BigDecimal getLimitPrice() {
    return limitPrice;
  }

  public void setLimitPrice(BigDecimal limitPrice) {
    this.limitPrice = limitPrice;
  }

  public BigDecimal getStopPrice() {
    return stopPrice;
  }

  public void setStopPrice(BigDecimal stopPrice) {
    this.stopPrice = stopPrice;
  }

  public BigDecimal getTakeProfit() {
    return takeProfit;
  }

  public void setTakeProfit(BigDecimal takeProfit) {
    this.takeProfit = takeProfit;
  }

  public BigDecimal getStopLoss() {
    return stopLoss;
  }

  public void setStopLoss(BigDecimal stopLoss) {
    this.stopLoss = stopLoss;
  }

  public String getClientTag() {
    return clientTag;
  }

  public void setClientTag(String clientTag) {
    this.clientTag = clientTag;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public Instant getFilledAt() {
    return filledAt;
  }

  public void setFilledAt(Instant filledAt) {
    this.filledAt = filledAt;
  }

  public BigDecimal getEntryPrice() {
    return entryPrice;
  }

  public void setEntryPrice(BigDecimal entryPrice) {
    this.entryPrice = entryPrice;
  }

  public BigDecimal getRealizedPnl() {
    return realizedPnl;
  }

  public void setRealizedPnl(BigDecimal realizedPnl) {
    this.realizedPnl = realizedPnl;
  }

  public String getNnRouteRecommendation() {
    return nnRouteRecommendation;
  }

  public void setNnRouteRecommendation(String nnRouteRecommendation) {
    this.nnRouteRecommendation = nnRouteRecommendation;
  }

  public Double getNnMatchProb() {
    return nnMatchProb;
  }

  public void setNnMatchProb(Double nnMatchProb) {
    this.nnMatchProb = nnMatchProb;
  }

  public BigDecimal getNnExpectedSavings() {
    return nnExpectedSavings;
  }

  public void setNnExpectedSavings(BigDecimal nnExpectedSavings) {
    this.nnExpectedSavings = nnExpectedSavings;
  }

  public BigDecimal getOpenPrice() {
    return openPrice;
  }

  public void setOpenPrice(BigDecimal openPrice) {
    this.openPrice = openPrice;
  }

  public Instant getOpenedAt() {
    return openedAt;
  }

  public void setOpenedAt(Instant openedAt) {
    this.openedAt = openedAt;
  }

  public BigDecimal getCommission() {
    return commission;
  }

  public void setCommission(BigDecimal commission) {
    this.commission = commission;
  }

  public BigDecimal getFilledQty() { return filledQty; }
  public void setFilledQty(BigDecimal filledQty) { this.filledQty = filledQty; }
  public BigDecimal getInternalQty() { return internalQty; }
  public void setInternalQty(BigDecimal internalQty) { this.internalQty = internalQty; }
  public BigDecimal getExternalQty() { return externalQty; }
  public void setExternalQty(BigDecimal externalQty) { this.externalQty = externalQty; }
  public BigDecimal getReserveRemaining() { return reserveRemaining; }
  public void setReserveRemaining(BigDecimal reserveRemaining) { this.reserveRemaining = reserveRemaining; }
  public String getRouting() { return routing; }
  public void setRouting(String routing) { this.routing = routing; }
  public Instant getNetDeadline() { return netDeadline; }
  public void setNetDeadline(Instant netDeadline) { this.netDeadline = netDeadline; }
  public Long getClosesPositionId() { return closesPositionId; }
  public void setClosesPositionId(Long closesPositionId) { this.closesPositionId = closesPositionId; }
  public Boolean getNnShadowCorrect() { return nnShadowCorrect; }
  public void setNnShadowCorrect(Boolean nnShadowCorrect) { this.nnShadowCorrect = nnShadowCorrect; }

  /** Quantity not yet filled (never negative). */
  public BigDecimal remainingQty() {
    BigDecimal q = quantity == null ? BigDecimal.ZERO : quantity;
    BigDecimal f = filledQty == null ? BigDecimal.ZERO : filledQty;
    BigDecimal r = q.subtract(f);
    return r.signum() < 0 ? BigDecimal.ZERO : r;
  }
}
