package com.brokerui.broker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class MT5ConnectionManager {

    private boolean isConnected;

    public MT5ConnectionManager(@Value("${broker.mt5.auto-connect:false}") boolean autoConnect) {
        this.isConnected = autoConnect;
    }

    public boolean isConnected() {
        return isConnected;
    }

    public void setConnected(boolean connected) {
        this.isConnected = connected;
    }
}
