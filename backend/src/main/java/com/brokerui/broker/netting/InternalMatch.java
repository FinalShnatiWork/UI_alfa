package com.brokerui.broker.netting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;

/**
 * One internal cross between a buyer and a seller at the mid price (V32 {@code internal_match}).
 * Plain id columns on purpose: this is an append-only audit row and must never lazy-load.
 */
@Entity
@Table(name = "internal_match")
public class InternalMatch {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "symbol_code", nullable = false, length = 32)
  private String symbolCode;

  @Column(name = "buy_order_id", nullable = false)
  private Long buyOrderId;

  @Column(name = "sell_order_id", nullable = false)
  private Long sellOrderId;

  @Column(name = "buy_account_id", nullable = false)
  private Long buyAccountId;

  @Column(name = "sell_account_id", nullable = false)
  private Long sellAccountId;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal quantity;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal bid;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal mid;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal ask;

  @Column(name = "buyer_improvement", nullable = false, precision = 18, scale = 8)
  private BigDecimal buyerImprovement;

  @Column(name = "seller_improvement", nullable = false, precision = 18, scale = 8)
  private BigDecimal sellerImprovement;

  @Column(name = "external_fee_saved", nullable = false, precision = 18, scale = 8)
  private BigDecimal externalFeeSaved;

  @Column(name = "buyer_simulated", nullable = false)
  private boolean buyerSimulated;

  @Column(name = "seller_simulated", nullable = false)
  private boolean sellerSimulated;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public String getSymbolCode() { return symbolCode; }
  public void setSymbolCode(String symbolCode) { this.symbolCode = symbolCode; }
  public Long getBuyOrderId() { return buyOrderId; }
  public void setBuyOrderId(Long buyOrderId) { this.buyOrderId = buyOrderId; }
  public Long getSellOrderId() { return sellOrderId; }
  public void setSellOrderId(Long sellOrderId) { this.sellOrderId = sellOrderId; }
  public Long getBuyAccountId() { return buyAccountId; }
  public void setBuyAccountId(Long buyAccountId) { this.buyAccountId = buyAccountId; }
  public Long getSellAccountId() { return sellAccountId; }
  public void setSellAccountId(Long sellAccountId) { this.sellAccountId = sellAccountId; }
  public BigDecimal getQuantity() { return quantity; }
  public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }
  public BigDecimal getBid() { return bid; }
  public void setBid(BigDecimal bid) { this.bid = bid; }
  public BigDecimal getMid() { return mid; }
  public void setMid(BigDecimal mid) { this.mid = mid; }
  public BigDecimal getAsk() { return ask; }
  public void setAsk(BigDecimal ask) { this.ask = ask; }
  public BigDecimal getBuyerImprovement() { return buyerImprovement; }
  public void setBuyerImprovement(BigDecimal v) { this.buyerImprovement = v; }
  public BigDecimal getSellerImprovement() { return sellerImprovement; }
  public void setSellerImprovement(BigDecimal v) { this.sellerImprovement = v; }
  public BigDecimal getExternalFeeSaved() { return externalFeeSaved; }
  public void setExternalFeeSaved(BigDecimal v) { this.externalFeeSaved = v; }
  public boolean isBuyerSimulated() { return buyerSimulated; }
  public void setBuyerSimulated(boolean v) { this.buyerSimulated = v; }
  public boolean isSellerSimulated() { return sellerSimulated; }
  public void setSellerSimulated(boolean v) { this.sellerSimulated = v; }
  public Instant getCreatedAt() { return createdAt; }
}
