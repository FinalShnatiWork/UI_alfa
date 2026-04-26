-- Align symbol catalog with UI lists (FX / METALS / CRYPTO).
-- Keep the table reusable across runs: upsert desired, disable others.

-- Desired codes (as used by UI + orders + positions)
-- FX: EURUSD, GBPUSD, USDCAD, EURNOK, GBPJPY, USDJPY, NZDUSD, CADJPY
-- METALS: XAGUSD, XAUUSD
-- CRYPTO: SOLUSD, BTCUSD, ETHUSD, XRPUSD

-- Disable any existing symbols that are not in the allowed catalog
UPDATE symbol
SET enabled = FALSE
WHERE code NOT IN (
  'EURUSD','GBPUSD','USDCAD','EURNOK','GBPJPY','USDJPY','NZDUSD','CADJPY',
  'XAGUSD','XAUUSD',
  'SOLUSD','BTCUSD','ETHUSD','XRPUSD'
);

-- Upsert helpers: insert if missing, otherwise ensure enabled/kind/decimals are correct.
INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'EURUSD','FX','EUR','USD',5,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='EURUSD');
UPDATE symbol SET kind='FX', base_currency='EUR', quote_currency='USD', price_decimals=5, enabled=TRUE WHERE code='EURUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'GBPUSD','FX','GBP','USD',5,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='GBPUSD');
UPDATE symbol SET kind='FX', base_currency='GBP', quote_currency='USD', price_decimals=5, enabled=TRUE WHERE code='GBPUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'USDCAD','FX','USD','CAD',5,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='USDCAD');
UPDATE symbol SET kind='FX', base_currency='USD', quote_currency='CAD', price_decimals=5, enabled=TRUE WHERE code='USDCAD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'EURNOK','FX','EUR','NOK',5,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='EURNOK');
UPDATE symbol SET kind='FX', base_currency='EUR', quote_currency='NOK', price_decimals=5, enabled=TRUE WHERE code='EURNOK';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'GBPJPY','FX','GBP','JPY',3,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='GBPJPY');
UPDATE symbol SET kind='FX', base_currency='GBP', quote_currency='JPY', price_decimals=3, enabled=TRUE WHERE code='GBPJPY';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'USDJPY','FX','USD','JPY',3,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='USDJPY');
UPDATE symbol SET kind='FX', base_currency='USD', quote_currency='JPY', price_decimals=3, enabled=TRUE WHERE code='USDJPY';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'NZDUSD','FX','NZD','USD',5,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='NZDUSD');
UPDATE symbol SET kind='FX', base_currency='NZD', quote_currency='USD', price_decimals=5, enabled=TRUE WHERE code='NZDUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'CADJPY','FX','CAD','JPY',3,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='CADJPY');
UPDATE symbol SET kind='FX', base_currency='CAD', quote_currency='JPY', price_decimals=3, enabled=TRUE WHERE code='CADJPY';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'XAGUSD','METALS','XAG','USD',2,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='XAGUSD');
UPDATE symbol SET kind='METALS', base_currency='XAG', quote_currency='USD', price_decimals=2, enabled=TRUE WHERE code='XAGUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'XAUUSD','METALS','XAU','USD',2,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='XAUUSD');
UPDATE symbol SET kind='METALS', base_currency='XAU', quote_currency='USD', price_decimals=2, enabled=TRUE WHERE code='XAUUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'SOLUSD','CRYPTO','SOL','USD',4,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='SOLUSD');
UPDATE symbol SET kind='CRYPTO', base_currency='SOL', quote_currency='USD', price_decimals=4, enabled=TRUE WHERE code='SOLUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'BTCUSD','CRYPTO','BTC','USD',2,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='BTCUSD');
UPDATE symbol SET kind='CRYPTO', base_currency='BTC', quote_currency='USD', price_decimals=2, enabled=TRUE WHERE code='BTCUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'ETHUSD','CRYPTO','ETH','USD',2,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='ETHUSD');
UPDATE symbol SET kind='CRYPTO', base_currency='ETH', quote_currency='USD', price_decimals=2, enabled=TRUE WHERE code='ETHUSD';

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals, enabled)
SELECT 'XRPUSD','CRYPTO','XRP','USD',4,TRUE
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code='XRPUSD');
UPDATE symbol SET kind='CRYPTO', base_currency='XRP', quote_currency='USD', price_decimals=4, enabled=TRUE WHERE code='XRPUSD';

