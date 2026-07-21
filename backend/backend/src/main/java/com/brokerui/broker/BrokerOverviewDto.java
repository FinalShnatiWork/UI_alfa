package com.brokerui.broker;

import java.math.BigDecimal;

public record BrokerOverviewDto(
    long tradingAccountId,
    String accountType,
    String currency,
    int leverage,
    BigDecimal balance,
    BigDecimal equity,
    BigDecimal marginUsed,
    BigDecimal freeMargin,
    BigDecimal borrowedBalance,
    BigDecimal creditLimit,
    BigDecimal marginLevelPct,
    BigDecimal interestAccruedTotal,
    BigDecimal commissionPaidTotal,
    BigDecimal dailyInterestRate) {}


