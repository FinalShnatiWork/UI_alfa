-- At most one working close order per position. Older duplicates, if any, keep the oldest one.
UPDATE broker_order b
SET status = 'CANCELLED', net_deadline = NULL
WHERE b.order_type = 'CLOSE'
  AND b.closes_position_id IS NOT NULL
  AND b.status IN ('NEW', 'PARTIALLY_FILLED', 'PENDING_NET')
  AND EXISTS (
    SELECT 1 FROM broker_order o
    WHERE o.closes_position_id = b.closes_position_id
      AND o.order_type = 'CLOSE'
      AND o.status IN ('NEW', 'PARTIALLY_FILLED', 'PENDING_NET')
      AND o.id < b.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_broker_order_one_open_close
  ON broker_order (closes_position_id)
  WHERE order_type = 'CLOSE' AND status IN ('NEW', 'PARTIALLY_FILLED', 'PENDING_NET');
