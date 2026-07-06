package com.brokerui.broker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Service that manages active/inactive status flag of the MT5 bridge connection.
 * Supports administration connection control.
 */
@Service
public class MT5ConnectionManager {

    private final MT5IntegrationService mt5Service;
    private boolean isConnected;

    /**
     * Constructs the MT5ConnectionManager.
     *
     * @param mt5Service MetaTrader 5 service integration
     * @param autoConnect initial connection status flag
     */
    public MT5ConnectionManager(
            MT5IntegrationService mt5Service,
            @Value("${broker.mt5.auto-connect:false}") boolean autoConnect) {
        this.mt5Service = mt5Service;
        this.isConnected = autoConnect;
    }

    /**
     * Checks if the MT5 bridge connection is toggled active.
     *
     * @return true if connected, false otherwise
     */
    public boolean isConnected() {
        // Optionally: you could perform a real-time check here too, 
        // but for UI stability, we use the isConnected flag which is toggled by Admin.
        return isConnected;
    }

    /**
     * Attempts to connect to MT5 by verifying the bridge.
     * The goal of this method is to ping the bridge health and update the connected flag.
     *
     * @return true if bridge is reachable and flag is updated, false otherwise
     */
    public boolean attemptConnect() {
        if (mt5Service.checkHealth()) {
            this.isConnected = true;
            return true;
        }
        this.isConnected = false;
        return false;
    }

    /**
     * Programmatically sets the connected state flag.
     *
     * @param connected targeted state flag
     */
    public void setConnected(boolean connected) {
        this.isConnected = connected;
    }

    /**
     * Returns the underlying MT5 integration service.
     *
     * @return MT5IntegrationService instance
     */
    public MT5IntegrationService getMt5Service() {
        return mt5Service;
    }
}
