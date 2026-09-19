-- Fix notes in margin_loan_ledger that were written with raw BigDecimal toString
-- which produces excessive trailing zeros e.g. "(0.50000000%/day)".
-- After this migration new notes are written with stripTrailingZeros() in Java.

UPDATE margin_loan_ledger
SET note = REGEXP_REPLACE(note, '\(0\.([0-9]*[1-9])0+(%/day\))', '(0.\1\2)')
WHERE note LIKE '%(0.%0%/day)%' AND entry_type = 'INTEREST';
