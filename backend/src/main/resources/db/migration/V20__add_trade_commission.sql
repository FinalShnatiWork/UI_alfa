-- V20: Real per-trade commission charged to the client, tying the netting-broker
-- AI routing model (nn_route_recommendation) to actual platform revenue.

ALTER TABLE broker_order ADD COLUMN commission NUMERIC(18, 8) NOT NULL DEFAULT 0;
ALTER TABLE trading_account ADD COLUMN commission_paid_total NUMERIC(18, 8) NOT NULL DEFAULT 0;
