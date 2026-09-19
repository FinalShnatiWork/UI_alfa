-- V26 had a regex replacement bug that produced "(0.5%/day))" with a double closing paren.
-- This migration fixes any notes that were corrupted by V26.

UPDATE margin_loan_ledger
SET note = REPLACE(note, '%/day))', '%/day)')
WHERE entry_type = 'INTEREST' AND note LIKE '%/day))%';
