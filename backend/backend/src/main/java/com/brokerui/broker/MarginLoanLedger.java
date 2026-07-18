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

/**
 * A single entry in the margin credit line ledger: a borrow, a repayment,
 * an interest charge, or a forced liquidation event on a trading account.
 */
@Entity
@Table(name = "margin_loan_ledger")
public class MarginLoanLedger {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "trading_account_id", nullable = false)
  private TradingAccount tradingAccount;

  @Column(name = "entry_type", nullable = false, length = 20)
  private String entryType; // BORROW, REPAY, INTEREST, LIQUIDATION

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal amount;

  @Column(name = "borrowed_after", nullable = false, precision = 18, scale = 8)
  private BigDecimal borrowedAfter;

  @Column(name = "balance_after", nullable = false, precision = 18, scale = 8)
  private BigDecimal balanceAfter;

  @Column(length = 255)
  private String note;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public Long getId() {
    return id;
  }

  public TradingAccount getTradingAccount() {
    return tradingAccount;
  }

  public void setTradingAccount(TradingAccount tradingAccount) {
    this.tradingAccount = tradingAccount;
  }

  public String getEntryType() {
    return entryType;
  }

  public void setEntryType(String entryType) {
    this.entryType = entryType;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  public BigDecimal getBorrowedAfter() {
    return borrowedAfter;
  }

  public void setBorrowedAfter(BigDecimal borrowedAfter) {
    this.borrowedAfter = borrowedAfter;
  }

  public BigDecimal getBalanceAfter() {
    return balanceAfter;
  }

  public void setBalanceAfter(BigDecimal balanceAfter) {
    this.balanceAfter = balanceAfter;
  }

  public String getNote() {
    return note;
  }

  public void setNote(String note) {
    this.note = note;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
