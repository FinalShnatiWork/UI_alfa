package com.brokerui.sim;

import java.time.Instant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "sim_trade")
public class SimTrade {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 32)
  private String symbol;

  @Column(nullable = false)
  private Integer quantity;

  @Column(name = "buyer_label", nullable = false, length = 64)
  private String buyerLabel;

  @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
  private Instant createdAt;

  public Long getId() {
    return id;
  }

  public String getSymbol() {
    return symbol;
  }

  public void setSymbol(String symbol) {
    this.symbol = symbol;
  }

  public Integer getQuantity() {
    return quantity;
  }

  public void setQuantity(Integer quantity) {
    this.quantity = quantity;
  }

  public String getBuyerLabel() {
    return buyerLabel;
  }

  public void setBuyerLabel(String buyerLabel) {
    this.buyerLabel = buyerLabel;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
