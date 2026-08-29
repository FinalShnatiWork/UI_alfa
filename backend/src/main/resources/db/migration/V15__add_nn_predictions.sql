ALTER TABLE broker_order ADD COLUMN nn_route_recommendation VARCHAR(20);
ALTER TABLE broker_order ADD COLUMN nn_match_prob DOUBLE PRECISION;
ALTER TABLE broker_order ADD COLUMN nn_expected_savings NUMERIC(18, 4);
