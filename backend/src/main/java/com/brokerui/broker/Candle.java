package com.brokerui.broker;

public class Candle {
    public final double open, high, low, close;
    public final long timestamp;

    public Candle(double open, double high, double low, double close, long timestamp) {
        this.open = open;
        this.high = high;
        this.low = low;
        this.close = close;
        this.timestamp = timestamp;
    }

    @Override
    public String toString() {
        return String.format("Candle[open=%.5f, high=%.5f, low=%.5f, close=%.5f, time=%d]", 
                             open, high, low, close, timestamp);
    }


}
