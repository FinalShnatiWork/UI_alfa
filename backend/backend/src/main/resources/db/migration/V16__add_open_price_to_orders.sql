ALTER TABLE broker_order ADD COLUMN open_price NUMERIC(18, 8);
ALTER TABLE broker_order ADD COLUMN opened_at TIMESTAMP;
