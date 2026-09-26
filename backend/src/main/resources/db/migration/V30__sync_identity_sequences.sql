-- V29 inserted rows with explicit primary keys and never advanced the BIGSERIAL
-- sequences. PostgreSQL does not bump a sequence on an INSERT that names `id`,
-- so a fresh install would hand the next JPA insert an id that already exists
-- (duplicate-key on app_user / trading_account / position / margin_loan_ledger /
-- broker_order). This migration is idempotent: it only moves a sequence forward
-- to at least MAX(id), and never rewinds a live database that is already ahead.

SELECT setval('app_user_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM app_user), 1), (SELECT last_value FROM app_user_id_seq)));
SELECT setval('trading_account_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM trading_account), 1), (SELECT last_value FROM trading_account_id_seq)));
SELECT setval('position_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM position), 1), (SELECT last_value FROM position_id_seq)));
SELECT setval('broker_order_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM broker_order), 1), (SELECT last_value FROM broker_order_id_seq)));
SELECT setval('margin_loan_ledger_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM margin_loan_ledger), 1), (SELECT last_value FROM margin_loan_ledger_id_seq)));
SELECT setval('account_transaction_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM account_transaction), 1), (SELECT last_value FROM account_transaction_id_seq)));
SELECT setval('user_preference_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM user_preference), 1), (SELECT last_value FROM user_preference_id_seq)));
SELECT setval('notification_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM notification), 1), (SELECT last_value FROM notification_id_seq)));
SELECT setval('audit_log_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM audit_log), 1), (SELECT last_value FROM audit_log_id_seq)));
SELECT setval('kyc_case_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM kyc_case), 1), (SELECT last_value FROM kyc_case_id_seq)));
SELECT setval('symbol_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM symbol), 1), (SELECT last_value FROM symbol_id_seq)));
