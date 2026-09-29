package com.brokerui.broker;

import com.brokerui.user.AppUser;
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
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "trading_account")
public class TradingAccount {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @JsonIgnore
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "account_type", nullable = false, length = 16)
  private String accountType = "DEMO";

  @Column(nullable = false, length = 8)
  private String currency = "USD";

  @Column(nullable = false)
  private int leverage = 100;

  @Column(nullable = false, length = 16)
  private String status = "ACTIVE";

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal balance = BigDecimal.ZERO;

  @Column(nullable = false, precision = 18, scale = 8)
  private BigDecimal equity = BigDecimal.ZERO;

  @Column(name = "margin_used", nullable = false, precision = 18, scale = 8)
  private BigDecimal marginUsed = BigDecimal.ZERO;

  @Column(name = "free_margin", nullable = false, precision = 18, scale = 8)
  private BigDecimal freeMargin = BigDecimal.ZERO;

  // Amount currently borrowed from the broker's credit line (margin loan).
  @Column(name = "borrowed_balance", nullable = false, precision = 18, scale = 8)
  private BigDecimal borrowedBalance = BigDecimal.ZERO;

  // Lifetime sum of interest charged on the credit line, for statistics/history.
  @Column(name = "interest_accrued_total", nullable = false, precision = 18, scale = 8)
  private BigDecimal interestAccruedTotal = BigDecimal.ZERO;

  @Column(name = "last_interest_at")
  private Instant lastInterestAt;

  // Per-account credit line limit (defaults to $10,000).
  @Column(name = "credit_limit", precision = 18, scale = 8)
  private BigDecimal creditLimit = new BigDecimal("10000.00");

  // Per-account daily interest rate (defaults to 0.005 = 0.5%/day).
  @Column(name = "daily_interest_rate", precision = 18, scale = 8)
  private BigDecimal dailyInterestRate = new BigDecimal("0.005");

  // Lifetime sum of real commission charged to this account, for statistics/history.
  @Column(name = "commission_paid_total", nullable = false, precision = 18, scale = 8)
  private BigDecimal commissionPaidTotal = BigDecimal.ZERO;

  /** Simulated "computer" counterparty account (House Liquidity Simulator), V32. */
  @Column(name = "is_simulated", nullable = false)
  private boolean simulated = false;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public AppUser getUser() {
    return user;
  }

  public void setUser(AppUser user) {
    this.user = user;
  }

  public String getAccountType() {
    return accountType;
  }

  public void setAccountType(String accountType) {
    this.accountType = accountType;
  }

  public String getCurrency() {
    return currency;
  }

  public void setCurrency(String currency) {
    this.currency = currency;
  }

  public int getLeverage() {
    return leverage;
  }

  public void setLeverage(int leverage) {
    this.leverage = leverage;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public BigDecimal getBalance() {
    return balance;
  }

  public void setBalance(BigDecimal balance) {
    this.balance = balance;
  }

  public BigDecimal getEquity() {
    return equity;
  }

  public void setEquity(BigDecimal equity) {
    this.equity = equity;
  }

  public BigDecimal getMarginUsed() {
    return marginUsed;
  }

  public void setMarginUsed(BigDecimal marginUsed) {
    this.marginUsed = marginUsed;
  }

  public BigDecimal getFreeMargin() {
    return freeMargin;
  }

  public void setFreeMargin(BigDecimal freeMargin) {
    this.freeMargin = freeMargin;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public BigDecimal getBorrowedBalance() {
    return borrowedBalance;
  }

  public void setBorrowedBalance(BigDecimal borrowedBalance) {
    this.borrowedBalance = borrowedBalance;
  }

  public BigDecimal getInterestAccruedTotal() {
    return interestAccruedTotal;
  }

  public void setInterestAccruedTotal(BigDecimal interestAccruedTotal) {
    this.interestAccruedTotal = interestAccruedTotal;
  }

  public Instant getLastInterestAt() {
    return lastInterestAt;
  }

  public void setLastInterestAt(Instant lastInterestAt) {
    this.lastInterestAt = lastInterestAt;
  }

  public BigDecimal getCommissionPaidTotal() {
    return commissionPaidTotal;
  }

  public void setCommissionPaidTotal(BigDecimal commissionPaidTotal) {
    this.commissionPaidTotal = commissionPaidTotal;
  }

  public BigDecimal getCreditLimit() {
    return creditLimit == null ? new BigDecimal("10000.00") : creditLimit;
  }

  public void setCreditLimit(BigDecimal creditLimit) {
    this.creditLimit = creditLimit;
  }

  public BigDecimal getDailyInterestRate() {
    return dailyInterestRate == null ? new BigDecimal("0.005") : dailyInterestRate;
  }

  public void setDailyInterestRate(BigDecimal dailyInterestRate) {
    this.dailyInterestRate = dailyInterestRate;
  }

  public boolean isSimulated() { return simulated; }
  public void setSimulated(boolean simulated) { this.simulated = simulated; }
}
