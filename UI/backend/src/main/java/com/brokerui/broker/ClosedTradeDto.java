package com.brokerui.broker;

import java.math.BigDecimal;
import java.time.Instant;

public record ClosedTradeDto(
    Long id,
    String symbolCode,
    String side,
    String orderType,
    BigDecimal quantity,
    BigDecimal entryPrice,
    BigDecimal realizedPnl,
    Instant openedAt,
    Instant closedAt) {}
