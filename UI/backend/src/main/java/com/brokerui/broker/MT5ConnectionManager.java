package com.brokerui.broker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class MT5ConnectionManager {

    private final MT5IntegrationService mt5Service;
    private boolean isConnected;

    public MT5ConnectionManager(
            MT5IntegrationService mt5Service,
            @Value("${broker.mt5.auto-connect:false}") boolean autoConnect) {
        this.mt5Service = mt5Service;
        this.isConnected = autoConnect;
    }

    public boolean isConnected() {
        // Optionally: you could perform a real-time check here too, 
        // but for UI stability, we use the isConnected flag which is toggled by Admin.
        return isConnected;
    }

    /**
     * Attempts to connect to MT5 by verifying the bridge.
     * @return true if bridge is physically reachable.
     */
    public boolean attemptConnect() {
        if (mt5Service.checkHealth()) {
            this.isConnected = true;
            return true;
        }
        this.isConnected = false;
        return false;
    }

    public void setConnected(boolean connected) {
        this.isConnected = connected;
    }
}
