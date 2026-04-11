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

@Entity
@Table(name = "trade_fill")
public class TradeFill {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "order_id", nullable = false)
  private BrokerOrder order;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal price;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal quantity;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal fee = BigDecimal.ZERO;

  @Column(length = 8)
  private String liquidity;

  @CreationTimestamp
  @Column(name = "executed_at", nullable = false, updatable = false)
  private Instant executedAt;

  public Long getId() {
    return id;
  }

  public BrokerOrder getOrder() {
    return order;
  }

  public void setOrder(BrokerOrder order) {
    this.order = order;
  }

  public BigDecimal getPrice() {
    return price;
  }

  public void setPrice(BigDecimal price) {
    this.price = price;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }

  public void setQuantity(BigDecimal quantity) {
    this.quantity = quantity;
  }

  public BigDecimal getFee() {
    return fee;
  }

  public void setFee(BigDecimal fee) {
    this.fee = fee;
  }

  public String getLiquidity() {
    return liquidity;
  }

  public void setLiquidity(String liquidity) {
    this.liquidity = liquidity;
  }

  public Instant getExecutedAt() {
    return executedAt;
  }
}

