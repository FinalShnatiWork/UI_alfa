package com.brokerui.market;

/**
 * Data transfer record representing a single historical candlestick bar.
 * Holds open, high, low, close, and timestamp.
 */
public record CandleBar(long time, double open, double high, double low, double close) {}
