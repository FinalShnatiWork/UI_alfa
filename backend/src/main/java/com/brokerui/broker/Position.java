package com.brokerui.broker;

import com.fasterxml.jackson.annotation.JsonIgnore;
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
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "position")
public class Position {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @JsonIgnore
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "trading_account_id", nullable = false)
  private TradingAccount tradingAccount;

  @Column(name = "symbol_code", nullable = false, length = 32)
  private String symbolCode;

  @Column(nullable = false, length = 8, columnDefinition = "VARCHAR(8) DEFAULT 'LONG'")
  private String side = "LONG";

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal quantity = BigDecimal.ZERO;

  @Column(name = "avg_price", precision = 18, scale = 8)
  private BigDecimal avgPrice;

  @Column(name = "realized_pnl", nullable = false, precision = 18, scale = 8)
  private BigDecimal realizedPnl = BigDecimal.ZERO;

  @Column(name = "unrealized_pnl", nullable = false, precision = 18, scale = 8)
  private BigDecimal unrealizedPnl = BigDecimal.ZERO;

  @Column(name = "opened_at")
  private Instant openedAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "take_profit", precision = 18, scale = 8)
  private BigDecimal takeProfit;

  @Column(name = "stop_loss", precision = 18, scale = 8)
  private BigDecimal stopLoss;

  public Long getId() {
    return id;
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

  public BigDecimal getQuantity() {
    return quantity;
  }

  public void setQuantity(BigDecimal quantity) {
    this.quantity = quantity;
  }

  public BigDecimal getAvgPrice() {
    return avgPrice;
  }

  public void setAvgPrice(BigDecimal avgPrice) {
    this.avgPrice = avgPrice;
  }

  public BigDecimal getRealizedPnl() {
    return realizedPnl;
  }

  public void setRealizedPnl(BigDecimal realizedPnl) {
    this.realizedPnl = realizedPnl;
  }

  public BigDecimal getUnrealizedPnl() {
    return unrealizedPnl;
  }

  public void setUnrealizedPnl(BigDecimal unrealizedPnl) {
    this.unrealizedPnl = unrealizedPnl;
  }

  public Instant getOpenedAt() {
    return openedAt;
  }

  public void setOpenedAt(Instant openedAt) {
    this.openedAt = openedAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
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
}
