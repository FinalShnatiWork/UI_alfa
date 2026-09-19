# Margin Credit Line System — Complete Reference Guide
### Project: UI_alfa Broker Platform

---

## Table of Contents

1. [What Is the Margin Credit Line and Why Does It Exist](#section-0)
2. [Quick Reference Card](#quick-ref)
3. [Database Tables](#section-1)
   - 3.1 `trading_account` — live state
   - 3.2 `margin_loan_ledger` — audit history
4. [Account Creation — Default Credit Setup](#section-account-creation)
5. [Cross-Class Usage Map](#section-cross-class)
6. [API Endpoints — What the Client Sees](#section-api)
7. [How Borrowing Works (Opening a Trade)](#section-2)
8. [How Repayment Works (Closing a Trade)](#section-3)
9. [How Interest Works](#section-4)
10. [Margin Level Calculation](#section-5)
11. [Withdrawal Blocking](#section-withdrawal)
12. [Force Liquidation](#section-6)
13. [The Ledger — Write Flow](#section-7)
14. [Full System Flow Diagram](#section-8)

---

## Section 0 — What Is the Margin Credit Line and Why Does It Exist {#section-0}

**Conceptual Background**

In real-world trading, a broker often extends a credit facility to clients so they can open positions larger than their current cash balance. This is the **margin credit line** — a revolving loan the broker provides automatically when a client's cash runs out.

**In this project:**

- Every trading account starts with a **$100,000 demo balance** and a **$10,000 credit limit**
- The credit limit acts like an overdraft: if your balance reaches $0 but you have credit available, the system borrows from the credit line on your behalf
- You do NOT need to apply for credit — it is **automatic and pre-approved** by the system
- The broker charges **0.5% per day** on any outstanding debt
- If the debt grows too large relative to your equity, the system issues a **margin call** (warning), then eventually **force-closes** your positions (liquidation) to recover the loan

**Why is this important for the project?**

Without this system, a client who used all their $100,000 would be unable to open any further positions. The credit line simulates a real-world broker credit facility and adds financial realism to the platform.

---

## Section QR — Quick Reference Card {#quick-ref}

| Question | Answer |
|---|---|
| Where is all credit logic? | `MarginLoanService.java` |
| Where is the audit trail? | DB table `margin_loan_ledger` / entity `MarginLoanLedger.java` |
| Where is credit limit stored? | `trading_account.credit_limit` (default $10,000) |
| Where is outstanding debt stored? | `trading_account.borrowed_balance` |
| Where is interest rate stored? | `trading_account.daily_interest_rate` (default 0.5%/day) |
| Does credit activate automatically? | YES — on first underfunded trade, no user action needed |
| When is interest clock started? | First borrow — `lastInterestAt` set from NULL to NOW |
| What triggers borrowing? | Opening a trade with insufficient cash balance |
| What triggers repayment? | Closing a position, SL/TP trigger, cancelling a pending order |
| What triggers interest? | Scheduler every 1 hour — charges if 24h have passed |
| Margin call warning threshold? | Equity / Debt < 110% |
| Force liquidation threshold? | Equity / Debt < 100%, checked every 10 seconds |
| How many DB tables? | 2: `trading_account` (live), `margin_loan_ledger` (history) |
| Ledger ever deleted/updated? | NEVER — insert-only |
| Is ledger exposed via REST API? | NO — accessible only via admin panel / direct DB |
| Credit offer flow? | API returns `credit_offer_available`, client resends with `acceptLoan=true` |

---

## Section 1 — Database Tables {#section-1}

### 1.1 Table: `trading_account`

**Purpose:** Stores the live financial state of every account, including all credit-related fields. One row per client account.

| Column | Type | Default | Description |
|---|---|---|---|
| `balance` | DECIMAL(18,8) | 100000 | Current cash balance. Decreases when credit is used (can reach 0) |
| `borrowed_balance` | DECIMAL(18,8) | 0 | **Current outstanding debt** to the broker's credit line |
| `credit_limit` | DECIMAL(18,8) | 10000.00 | Maximum total borrowing allowed for this account |
| `daily_interest_rate` | DECIMAL(18,8) | 0.005 | Daily interest rate (0.5% = 0.005) |
| `last_interest_at` | TIMESTAMP | NULL | When interest was last charged. NULL means: never borrowed yet |
| `interest_accrued_total` | DECIMAL(18,8) | 0 | Lifetime sum of all interest ever charged (for reporting/admin) |
| `equity` | DECIMAL(18,8) | 0 | Stored equity snapshot, updated on trade events |

- **Java entity:** `TradingAccount.java`
- **Repository:** `TradingAccountRepository.java`
- **Key method:** `findByIdForUpdate(Long id)` — acquires pessimistic write lock before any credit operation to prevent race conditions

---

### 1.2 Table: `margin_loan_ledger`

**Purpose:** Immutable audit trail. Every single credit event creates exactly one row. Rows are **NEVER** deleted or updated — this is a permanent financial log.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL | Auto-generated primary key |
| `trading_account_id` | BIGINT | Foreign key → `trading_account.id` |
| `entry_type` | VARCHAR(20) | Event type: `BORROW`, `REPAY`, `INTEREST`, `LIQUIDATION` |
| `amount` | DECIMAL(18,8) | Dollar amount involved in this specific event |
| `borrowed_after` | DECIMAL(18,8) | Snapshot: total outstanding debt **after** this event |
| `balance_after` | DECIMAL(18,8) | Snapshot: cash balance **after** this event |
| `note` | VARCHAR(255) | Human-readable description of why this event occurred |
| `created_at` | TIMESTAMP | Exact UTC timestamp, set automatically by `@CreationTimestamp` |

- **Java entity:** `MarginLoanLedger.java`
- **Repository:** `MarginLoanLedgerRepository.java`
  - `findByTradingAccountIdOrderByCreatedAtDesc(Long id)` — full history for one account
  - `findAllByOrderByCreatedAtDesc()` — all accounts ordered by newest first (used by admin dashboard)

---

## Section 2 — Account Creation — Default Credit Setup {#section-account-creation}

**Where this happens:**

```
File:    BrokerApiController.java
Method:  ensurePrimaryAccount(AppUser user)
```

**When it triggers:** Every API call that needs the trading account calls `ensurePrimaryAccount()`. If no account exists for this user yet, one is created automatically — there is no explicit "create account" API call.

**What fields are set explicitly at creation:**

```java
TradingAccount ta = new TradingAccount();
ta.setAccountType("DEMO");
ta.setCurrency("USD");
ta.setLeverage(100);
ta.setStatus("ACTIVE");
ta.setBalance(new BigDecimal("100000"));     // $100,000 starting balance
ta.setEquity(new BigDecimal("100000"));
ta.setMarginUsed(BigDecimal.ZERO);
ta.setFreeMargin(new BigDecimal("100000"));
```

**What credit fields are NOT explicitly set (rely on Java class defaults):**

| Field | Default source | Value |
|---|---|---|
| `creditLimit` | Java field default in `TradingAccount.java` line 66 | `$10,000` |
| `borrowedBalance` | Java field default | `$0` |
| `dailyInterestRate` | Java field default | `0.005` (0.5%/day) |
| `lastInterestAt` | Java field default | `null` (clock not started) |
| `interestAccruedTotal` | Java field default | `$0` |

**Conclusion:** Every new user automatically has a $10,000 credit line available from the moment their account is created. No admin action, no approval. The credit limit and rate are hardcoded in the entity and apply equally to all accounts.

> **Note for future improvement:** If individual credit limits per user are needed, an admin endpoint to update `creditLimit` and `dailyInterestRate` should be added.

---

## Section 3 — Cross-Class Usage Map {#section-cross-class}

How `MarginLoanService` connects to the rest of the system:

| Caller | Method Called on MarginLoanService | When |
|---|---|---|
| `BrokerApiController.placeOrder()` | `tryCoverShortfall(ta, required, u, req)` | User places LONG order — fund or reject |
| `BrokerApiController.placeOrder()` | `tryCoverShortfall(ta, sellRequired, u, req)` | User places SHORT order — fund or reject |
| `BrokerApiController.closePosition()` | `repaySettlementOrBorrow(ta, amount)` | User manually closes a position |
| `BrokerApiController.createTransaction()` | `simulateMarginLevelAfterWithdrawal(ta, amount)` | Withdrawal request — check if it would trigger margin call |
| `BrokerApiController.cancelOrder()` | `repaySettlementOrBorrow(ta, refund)` | User cancels pending order — refund margin |
| `BrokerApiController.overview()` | `computeMarginLevel(ta)` | Dashboard — show current margin level % |
| `OrderExecutionService.executeFilled()` | `tryCoverShortfall(ta, required, u, req)` | Pending order fills automatically — fund it |
| `OrderExecutionService.closePositionDueToSlTp()` | `repaySettlementOrBorrow(ta, amount)` | SL or TP level hit — settle the position |
| `MarginLoanService` (self, scheduler) | `accrueDueInterest()` | Every 1 hour — charge interest if 24h elapsed |
| `MarginLoanService` (self, scheduler) | `liquidateAccount(accountId)` | Every 10 sec — force-close if margin < 100% |

**Who MarginLoanService depends on:**

| Dependency | Used for |
|---|---|
| `TradingAccountRepository` | Load and lock accounts (`findByIdForUpdate`) |
| `PositionRepository` | Load open positions during liquidation |
| `BrokerOrderRepository` | Create trade history records during liquidation |
| `MarginLoanLedgerRepository` | Write immutable audit entries |
| `MarketPriceService` | Fetch live prices during liquidation |
| `NotificationService` | Send liquidation alerts to users |
| `AuditLogRepository` | Write human-readable admin audit log |

---

## Section 4 — API Endpoints — What the Client Sees {#section-api}

> **Important:** There is NO dedicated REST endpoint for the ledger history. The ledger is readable only from the admin panel via direct database access. The client-facing API surfaces only the current credit state.

### 4.1 `GET /api/broker/overview` — Current Credit State

**Who calls it:** Frontend dashboard, every few seconds.

**Credit-related fields in the response:**

| JSON field | Source | Meaning |
|---|---|---|
| `borrowedBalance` | `ta.getBorrowedBalance()` | Current outstanding debt in USD |
| `creditLimit` | `ta.getCreditLimit()` | Maximum borrowing allowed ($10,000) |
| `marginLevelPct` | `marginLoanService.computeMarginLevel(ta) × 100` | Margin level as a percentage, or `null` if no debt |
| `interestAccruedTotal` | `ta.getInterestAccruedTotal()` | Lifetime interest paid (informational) |
| `dailyInterestRate` | `ta.getDailyInterestRate()` | Current rate (0.005 = 0.5%/day) |

---

### 4.2 `POST /api/broker/orders` — The Credit Offer Flow

This is a two-step interaction when the client has insufficient balance:

**Step 1 — Server detects shortfall, `acceptLoan` not set:**

```json
// Response 400
{
  "ok": false,
  "error": "credit_offer_available",
  "shortfall": 3000.00,
  "currentDebt": 4000.00,
  "creditLimit": 10000.00,
  "creditAvailable": 3000.00
}
```

**Step 2 — Frontend shows user a "borrow?" dialog, user confirms, resends with flag:**

```json
// Request body (resend)
{
  "symbol": "BTCUSD",
  "side": "BUY",
  "quantity": 1,
  "acceptLoan": true        // ← this flag triggers credit line usage
}
```

**Step 3 — Server calls `tryCoverShortfall()`, borrows, returns 200 OK.**

If credit limit is exceeded regardless: response is `400 credit_limit_exceeded`.

---

### 4.3 `POST /api/broker/transactions` — Withdrawal Blocking

```json
// Response 400 when withdrawal would cause margin call
{
  "ok": false,
  "error": "withdrawal_would_trigger_margin_call",
  "marginLevelAfterPct": 108.5
}
```

---

## Section 5 — How Borrowing Works (Opening a Trade) {#section-2}

### 5.1 Where in the code this happens

| Trigger | Class | Method |
|---|---|---|
| User places a market/limit/stop order | `BrokerApiController.java` | `placeOrder()` |
| Pending order gets filled by the scheduler | `OrderExecutionService.java` | `executeFilled()` |

Both call: **`MarginLoanService.tryCoverShortfall()`**

---

### 5.2 `tryCoverShortfall()` — Full Logic

```
File:      MarginLoanService.java
Signature: public boolean tryCoverShortfall(TradingAccount ta, BigDecimal required,
                                             AppUser user, HttpServletRequest request)
Returns:   true  = trade approved (funds covered)
           false = credit limit exceeded → trade REJECTED
```

**Step-by-step:**

1. If `required <= 0` → return `true` (nothing to fund)
2. If `balance >= required` → `balance = balance - required` → return `true` (cash only, no debt)
3. Calculate `shortfall = required - balance`
4. If `(currentDebt + shortfall) > creditLimit` → **return `false` — TRADE REJECTED**
5. `balance = 0` (all cash used)
6. `borrowedBalance = currentDebt + shortfall` (debt increases)
7. If `lastInterestAt == null` → `lastInterestAt = now` (start interest clock for first time)
8. Write ledger: `BORROW — "Auto-borrow to cover trade shortfall"`
9. Write audit log: `"Borrowed X USD (debt now Y)"`
10. Return `true` — approved

> **Race condition protection:** The caller MUST first lock the account row via `accountRepo.findByIdForUpdate(id)` before calling this method. Without pessimistic locking, two concurrent orders could both pass the credit check and together exceed the credit limit.

---

### 5.3 Practical Example

```
Account state before trade:
  balance          = $3,000
  borrowedBalance  = $4,000
  creditLimit      = $10,000
  Trade requires   = $6,000

Step 3: shortfall = $6,000 − $3,000 = $3,000
Step 4: $4,000 + $3,000 = $7,000 < $10,000 → APPROVED
Step 5: balance = $0
Step 6: borrowedBalance = $7,000

Account state after:
  balance          = $0
  borrowedBalance  = $7,000
  credit remaining = $3,000
```

---

## Section 6 — How Repayment Works (Closing a Trade) {#section-3}

### 6.1 Where in the code this happens

| Trigger | Class | Method |
|---|---|---|
| User manually closes a position | `BrokerApiController.java` | `closePosition()` |
| SL or TP level is hit | `OrderExecutionService.java` | `closePositionDueToSlTp()` |
| User cancels a pending order | `BrokerApiController.java` | `cancelOrder()` |

All three call: **`MarginLoanService.repaySettlementOrBorrow()`**

---

### 6.2 `repaySettlementOrBorrow()` — Full Logic

```
File:      MarginLoanService.java
Signature: public void repaySettlementOrBorrow(TradingAccount ta, BigDecimal amount)

amount is SIGNED:
  Positive = money coming IN  (margin returned + profit, or just margin on cancel)
  Negative = money going OUT  (net loss after margin)
```

**Case A — Positive amount (profitable or break-even close):**

1. If `debt > 0`:
   - `repay = min(amount, debt)`
   - `borrowedBalance = debt - repay`
   - `balance = balance + (amount - repay)` (remainder after debt repayment)
   - If `repay > 0` → write ledger `REPAY — "Auto-repay from trade settlement"`
2. If `debt == 0` → full amount goes directly to `balance`

**Case B — Negative amount (losing trade where loss exceeds returned margin):**

1. If `balance >= |loss|` → `balance = balance - |loss|`
2. If `balance < |loss|`:
   - `extra = |loss| - balance`
   - `balance = 0`
   - `borrowedBalance = borrowedBalance + extra` ← **DEBT INCREASES**
   - Write ledger: `BORROW — "Loss exceeded cash balance — added to credit line debt"`

> **Note:** This loss-borrow is NOT capped by `creditLimit` — the loss already occurred. The liquidation engine handles excess debt.

---

### 6.3 What `amount` contains when called

```java
// In closePosition() and closePositionDueToSlTp():
BigDecimal amount = marginReturned.add(grossPnl).subtract(commission);
// marginReturned = avgPrice × qty × contractSize / leverage  (always positive)
// grossPnl       = raw profit or loss (can be negative)
// commission     = close-leg fee

// In cancelOrder():
BigDecimal amount = refund;
// refund = reservedPrice × qty × contractSize / leverage
// (no commission — order never filled)
```

---

### 6.4 Partial Close — What Happens?

The system does **not** support partial position closes in the current implementation. `closePosition()` always closes the **entire** position. The `amount` passed to `repaySettlementOrBorrow()` always represents the full position's margin + P/L.

---

## Section 7 — How Interest Works {#section-4}

### 7.1 Scheduler Design

```
File:      MarginLoanService.java
Scheduler: @Scheduled(fixedDelay = 3_600_000)  → runs every 1 HOUR
Method:    accrueDueInterestTick()
             └─ calls self.accrueDueInterest() (via Spring proxy for @Transactional)
```

**Why hourly check instead of a fixed daily time?**
A scheduler firing at a fixed clock time (e.g., midnight) would double-fire or skip on server restarts. The hourly check reads each account's `lastInterestAt` timestamp and only charges when **24 real hours** have elapsed. This is restart-safe.

---

### 7.2 Full Interest Charging Flow

**`accrueDueInterest()` `[@Transactional]`:**

1. Load all accounts where `borrowed_balance > 0`
2. For each: check if `(now − lastInterestAt) >= 24 hours`
   - YES → call `chargeInterest(accountId)`
   - NO → skip

**`chargeInterest(Long accountId)` `[private]`:**

1. Lock account row (`findByIdForUpdate`)
2. `rate = account.dailyInterestRate` (default `0.005` = 0.5%)
3. `interest = borrowedBalance × rate`
4. `borrowedBalance = borrowedBalance + interest` ← **debt grows, cash balance unchanged**
5. `interestAccruedTotal += interest` (lifetime counter, statistics)
6. `lastInterestAt = now`
7. Save account
8. Write ledger: `INTEREST — "Daily interest charge (0.5%/day)"`

> **Critical:** Interest is added to **debt**, NOT deducted from cash. The client's usable balance does not change when interest fires.

---

### 7.3 Practical Example

```
Before:
  borrowedBalance   = $7,000
  dailyInterestRate = 0.005 (0.5%)
  lastInterestAt    = 2024-01-01 10:00:00

Scheduler runs at 2024-01-02 11:00:00 (25 hours elapsed):
  interest = $7,000 × 0.005 = $35.00

After:
  borrowedBalance        = $7,035.00
  interestAccruedTotal  += $35.00
  lastInterestAt         = 2024-01-02 11:00:00

Ledger entry:
  entryType     = "INTEREST"
  amount        = 35.00
  borrowedAfter = 7035.00
  note          = "Daily interest charge (0.5%/day)"
```

---

## Section 8 — Margin Level Calculation {#section-5}

### 8.1 What is Margin Level?

```
Margin Level = liveEquity / borrowedBalance

Examples:
  equity $11,000 / debt $10,000 = 1.10 = 110%  ← warning threshold
  equity $10,000 / debt $10,000 = 1.00 = 100%  ← liquidation threshold
  equity  $9,000 / debt $10,000 = 0.90 =  90%  ← past liquidation point
```

| Level | Zone | System Action |
|---|---|---|
| >= 110% | Safe | No action |
| 100% – 110% | Margin Call | Warning shown in UI, withdrawals blocked |
| < 100% | Liquidation | Force-close positions (checked every 10 sec) |

---

### 8.2 Two Equity Calculations — Critical Distinction

| Method | Formula | Purpose |
|---|---|---|
| `BrokerApiController.recalcEquity()` | `balance + unrealizedPnl` | Dashboard display only |
| `MarginLoanService.liveEquity()` | `balance + marginLocked + unrealizedPnl` | Margin level calculations only |

**Why the difference?**

In the prepaid-margin model, when a position opens, its margin is deducted from `balance` upfront. If margin level used only `balance + unrealizedPnl`, the subtracted margin would make it look like the account has less collateral than it really does — every leveraged position would falsely appear to be approaching a margin call.

`liveEquity()` adds back the locked margin to show what the account would truly be worth **if all positions closed right now**. This is the correct collateral measure for risk purposes.

```
liveEquity() per open position:
  marginLocked = avgPrice × qty × contractSize / leverage
  pnl          = (livePrice − avgPrice) × qty × contractSize (LONG)
              or (avgPrice − livePrice) × qty × contractSize (SHORT)

Total liveEquity = balance + Σ(marginLocked + pnl)
```

---

### 8.3 Methods

**`computeMarginLevel(TradingAccount ta)`**
- Returns: ratio (e.g. `1.25` = 125%), or `null` if `borrowedBalance == 0`
- Formula: `liveEquity(ta) / borrowedBalance`
- Called by: `checkLiquidationsTick()`, `overview()` API endpoint, withdrawal check

**`simulateMarginLevelAfterWithdrawal(TradingAccount ta, BigDecimal cashAmount)`**
- Returns: what margin level **would be** after a withdrawal, or `null` if no debt
- Formula: `(liveEquity − cashAmount) / borrowedBalance`
- Called by: `BrokerApiController.createTransaction()` — blocks withdrawals that would move the margin level below 110%

---

## Section 9 — Withdrawal Blocking {#section-withdrawal}

### 9.1 The Problem

If a client has outstanding debt, they could withdraw cash, lowering their collateral below the margin call threshold. The system must prevent this.

### 9.2 Full Logic in `createTransaction()`

```
File:    BrokerApiController.java
Method:  createTransaction()
```

**Steps:**

1. User requests withdrawal of `amount` USD
2. If `ta.getBalance() < amount` → reject: `insufficient_balance`
3. Call `simulateMarginLevelAfterWithdrawal(ta, amount)`
   - Returns `null` → no debt → **withdrawal allowed** (proceed)
   - Returns a ratio:
     - If `ratio >= MARGIN_CALL_LEVEL (1.10)` → **withdrawal allowed** (collateral remains sufficient)
     - If `ratio < 1.10` → **reject 400** with `withdrawal_would_trigger_margin_call` + the projected `marginLevelAfterPct`

### 9.3 Example

```
Account state:
  balance = $5,000
  debt    = $8,000
  liveEquity = $9,000
  Current margin level = 9,000 / 8,000 = 112.5% (safe)

User requests withdrawal of $1,500:
  simulatedEquity = $9,000 − $1,500 = $7,500
  simulatedLevel  = $7,500 / $8,000 = 93.75%  < 110%
  → REJECTED: "withdrawal_would_trigger_margin_call"
  → marginLevelAfterPct returned = 93.75
```

---

## Section 10 — Force Liquidation {#section-6}

### 10.1 Trigger

```
File:      MarginLoanService.java
Scheduler: @Scheduled(fixedDelay = 10_000)  → runs every 10 SECONDS
Method:    checkLiquidationsTick()
             └─ for each account with debt:
                  computeMarginLevel(ta)
                  if level < 1.00 → liquidateAccount(accountId)
```

---

### 10.2 `liquidateAccount()` — Full Step-by-Step

**Step 1:** Lock account (`findByIdForUpdate`). If `borrowedBalance == 0` → return early.

**Step 2:** Load all open positions. Sort by `unrealizedPnl` **ascending** (worst losses first).

**Step 3 — Closing loop:** For each position:

- **3a:** Re-check `computeMarginLevel(ta)`. If `>= 1.10` → set `recovered = true`, **break loop**
- **3b:** Fetch live price from `MarketPriceService`. If unavailable → `continue` (skip this position)
- **3c:** Calculate `marginReturned` and direction-aware `pnl` (LONG vs SHORT)
- **3d:** `positionRepo.delete(pos)` — position is closed
- **3e:** `repaySettlementOrBorrow(ta, marginReturned + pnl)` — proceeds repay debt
- **3f:** Create `BrokerOrder` record with `status = FILLED`, `realizedPnl = pnl`
- **3g:** Send `LIQUIDATION` notification to user

**Step 4 — Debt resolution decision:**

| Condition | Action |
|---|---|
| `debt > 0` AND `!recovered` AND no positions remain | Write off debt → `borrowedBalance = 0`, ledger: `"residual debt written off"` |
| `closedCount > 0` AND `recovered` | Keep remaining debt, ledger: `"margin level recovered"` |
| `closedCount > 0` AND positions still remain (some skipped) | Keep debt, ledger: `"incomplete, debt kept"` |

**Step 5:** Recalculate equity, save account, write audit log.

---

### 10.3 Why Worst Loss First?

```java
positions.sort((a, b) -> unrealizedPnlOf(a).compareTo(unrealizedPnlOf(b)));
// ascending = most negative pnl first
```

Closing the most negative positions first maximises cash recovered per closure. This minimises the number of positions that need to be closed to restore the margin level — and it mirrors real exchange liquidation behaviour.

---

### 10.4 Why Write Off Residual Debt?

If after closing **all** positions the debt is still positive, the client has effectively zero collateral. Continuing to charge interest on an unrecoverable debt serves no purpose. The write-off sets `borrowedBalance = 0` and records the event in the ledger. This is the final resolution of the liquidation cycle.

---

## Section 11 — The Ledger — Write Flow {#section-7}

### 11.1 Private `writeLedger()` Method

```java
// File: MarginLoanService.java
private void writeLedger(TradingAccount ta, String type, BigDecimal amount, String note) {
    MarginLoanLedger entry = new MarginLoanLedger();
    entry.setTradingAccount(ta);
    entry.setEntryType(type);               // BORROW / REPAY / INTEREST / LIQUIDATION
    entry.setAmount(amount);
    entry.setBorrowedAfter(ta.getBorrowedBalance());  // snapshot AFTER event
    entry.setBalanceAfter(ta.getBalance());           // snapshot AFTER event
    entry.setNote(note);
    ledgerRepo.save(entry);                 // INSERT only — rows are never modified
}
```

> Both `borrowedAfter` and `balanceAfter` are set **after** all financial mutations. The ledger always stores the post-event state so you can reconstruct account history from top to bottom.

---

### 11.2 When Each Entry Type is Written

| Entry Type | Written when | Example note |
|---|---|---|
| `BORROW` | `tryCoverShortfall()` — shortfall covered from credit | `"Auto-borrow to cover trade shortfall"` |
| `BORROW` | `repaySettlementOrBorrow()` — loss exceeds available cash | `"Loss exceeded cash balance — added to credit line debt"` |
| `REPAY` | `repaySettlementOrBorrow()` — closing proceeds repay debt | `"Auto-repay from trade settlement"` |
| `INTEREST` | `chargeInterest()` — 24h timer fires | `"Daily interest charge (0.5%/day)"` |
| `LIQUIDATION` | `liquidateAccount()` — all positions closed, debt written off | `"Liquidation complete — 3 position(s) closed; residual debt written off"` |
| `LIQUIDATION` | `liquidateAccount()` — margin level recovered early | `"Liquidation complete — 2 position(s) closed; margin level recovered"` |
| `LIQUIDATION` | `liquidateAccount()` — prices unavailable, incomplete close | `"Liquidation incomplete — 1 position(s) closed, 2 remain; debt kept"` |

---

## Section 12 — Full System Flow Diagram {#section-8}

```
══════════════════════════════════════════════════════════════
 EVENT: User opens a trade
══════════════════════════════════════════════════════════════

  BrokerApiController.placeOrder()   or   OrderExecutionService.executeFilled()
    ↓
  accountRepo.findByIdForUpdate(id)           ← PESSIMISTIC LOCK
    ↓
  tryCoverShortfall(ta, required)
    ├── balance sufficient            → balance -= required              → ✅ proceed
    ├── shortfall fits credit limit   → balance=0, debt+=shortfall       → ✅ proceed
    │                                    + BORROW ledger entry
    └── exceeds credit limit          → return false → 400 REJECTED

══════════════════════════════════════════════════════════════
 EVENT: Trade closes / SL or TP fires
══════════════════════════════════════════════════════════════

  BrokerApiController.closePosition()   or   OrderExecutionService.closePositionDueToSlTp()
    ↓
  amount = marginReturned + grossPnl − commission
    ↓
  repaySettlementOrBorrow(ta, amount)
    ├── amount > 0, debt exists   → repay debt, rest to balance   → REPAY ledger
    ├── amount > 0, no debt       → full amount to balance
    └── amount < 0 (net loss)
          ├── balance covers loss   → balance -= loss
          └── balance < loss        → balance=0, debt+=extra        → BORROW ledger

══════════════════════════════════════════════════════════════
 EVENT: User withdraws cash
══════════════════════════════════════════════════════════════

  BrokerApiController.createTransaction()
    ↓
  simulateMarginLevelAfterWithdrawal(ta, amount)
    ├── null (no debt)           → withdrawal allowed
    ├── ratio >= 1.10            → withdrawal allowed
    └── ratio < 1.10             → 400 REJECTED: withdrawal_would_trigger_margin_call

══════════════════════════════════════════════════════════════
 SCHEDULER: Every 1 hour
══════════════════════════════════════════════════════════════

  accrueDueInterestTick()
    ↓
  For each account with debt > 0:
    If (now − lastInterestAt) >= 24h:
      borrowedBalance += borrowedBalance × dailyInterestRate
      + INTEREST ledger entry

══════════════════════════════════════════════════════════════
 SCHEDULER: Every 10 seconds
══════════════════════════════════════════════════════════════

  checkLiquidationsTick()
    ↓
  For each account with debt > 0:
    marginLevel = liveEquity / borrowedBalance
    ├── >= 1.10   → safe, no action
    ├── 1.00–1.10 → margin call warning shown in UI
    └── < 1.00    → liquidateAccount()
                     Sort open positions: worst loss first
                     Close each → repaySettlementOrBorrow()
                     Stop if margin level recovers to >= 1.10
                     Write off residual debt if all positions closed
                     + LIQUIDATION ledger entry
```

---
---
---

# מערכת מסגרת האשראי — מדריך עיון מקיף
### פרויקט: UI_alfa Broker Platform

---

## תוכן העניינים

1. מהי מסגרת האשראי ולמה היא קיימת
2. כרטיס עזר מהיר
3. טבלאות בסיס הנתונים
4. יצירת חשבון — הגדרות אשראי ברירת מחדל
5. מפת שימוש בין-מחלקתי
6. נקודות קצה של API — מה הלקוח רואה
7. איך עובדת ההלוואה (פתיחת עסקה)
8. איך עובד ההחזר (סגירת עסקה)
9. איך עובדת הריבית
10. חישוב רמת המרג'ין
11. חסימת משיכות
12. הנזלה כפויה
13. הגרוסבוך — זרימת כתיבה
14. תרשים זרימה מלא

---

## סעיף 0 — מהי מסגרת האשראי ולמה היא קיימת

**רקע מושגי**

במסחר בעולם האמיתי, ברוקר לרוב מעניק ללקוחות מסגרת אשראי כדי שיוכלו לפתוח פוזיציות גדולות יותר מיתרת המזומן שלהם. זוהי **מסגרת האשראי של המרג'ין** — הלוואה מתחדשת שהברוקר מספק אוטומטית כאשר מזומן הלקוח אוזל.

**בפרויקט זה:**

- כל חשבון מסחר מתחיל עם **יתרת דמו של $100,000** ו**מסגרת אשראי של $10,000**
- מסגרת האשראי פועלת כמו אוברדראפט: אם יתרתך מגיעה ל-$0 אבל יש לך אשראי זמין, המערכת לווה ממסגרת האשראי בשמך אוטומטית
- **אין צורך להגיש בקשה לאשראי** — הוא אוטומטי ומאושר מראש על ידי המערכת
- הברוקר גובה **0.5% ליום** על כל חוב פתוח
- אם החוב גדל יותר מדי ביחס להון העצמי, המערכת מנפיקה **אזהרת Margin Call**, ולאחר מכן **סוגרת כפויה פוזיציות** (הנזלה) כדי לגבות את ההלוואה

**מדוע זה חשוב לפרויקט?**

ללא מערכת זו, לקוח שהשתמש בכל $100,000 שלו לא יוכל לפתוח פוזיציות נוספות. מסגרת האשראי מדמה מתקן אשראי אמיתי של ברוקר ומוסיפה ריאליזם פיננסי לפלטפורמה.

---

## כרטיס עזר מהיר

| שאלה | תשובה |
|---|---|
| איפה כל לוגיקת האשראי? | `MarginLoanService.java` |
| איפה נתיב הביקורת? | טבלת DB `margin_loan_ledger` / יישות `MarginLoanLedger.java` |
| איפה מאוחסנת מגבלת האשראי? | `trading_account.credit_limit` (ברירת מחדל $10,000) |
| איפה מאוחסן החוב הפתוח? | `trading_account.borrowed_balance` |
| איפה מאוחסן שיעור הריבית? | `trading_account.daily_interest_rate` (ברירת מחדל 0.5%/יום) |
| האם האשראי מופעל אוטומטית? | כן — בעסקה הראשונה עם מחסור, ללא פעולת משתמש |
| מתי מתחיל שעון הריבית? | הלוואה ראשונה — `lastInterestAt` עובר מ-NULL לעכשיו |
| מה מפעיל הלוואה? | פתיחת עסקה עם יתרת מזומן לא מספיקה |
| מה מפעיל החזר? | סגירת פוזיציה, הפעלת SL/TP, ביטול הזמנה ממתינה |
| מה מפעיל ריבית? | מתזמן כל שעה — גובה אם עברו 24 שעות |
| סף אזהרת Margin Call? | הון עצמי / חוב < 110% |
| סף הנזלה כפויה? | הון עצמי / חוב < 100%, נבדק כל 10 שניות |
| כמה טבלות DB? | 2: `trading_account` (חי), `margin_loan_ledger` (היסטוריה) |
| הגרוסבוך נמחק/מתעדכן? | לעולם לא — הכנסה בלבד |
| הגרוסבוך נחשף ב-REST API? | לא — נגיש רק דרך לוח הניהול / DB ישיר |
| זרימת הצעת אשראי? | API מחזיר `credit_offer_available`, הלקוח שולח מחדש עם `acceptLoan=true` |

---

## סעיף 1 — טבלאות בסיס הנתונים

### 1.1 טבלה: `trading_account`

**מטרה:** מאחסנת את המצב הפיננסי החי של כל חשבון, כולל כל השדות הקשורים לאשראי. שורה אחת לכל חשבון לקוח.

| עמודה | סוג | ברירת מחדל | תיאור |
|---|---|---|---|
| `balance` | DECIMAL(18,8) | 100000 | יתרת מזומן נוכחית. יורדת כשאשראי משמש (יכולה להגיע ל-0) |
| `borrowed_balance` | DECIMAL(18,8) | 0 | **חוב פתוח נוכחי** למסגרת האשראי של הברוקר |
| `credit_limit` | DECIMAL(18,8) | 10000.00 | מקסימום הלוואה כוללת מותרת לחשבון זה |
| `daily_interest_rate` | DECIMAL(18,8) | 0.005 | שיעור ריבית יומי (0.5% = 0.005) |
| `last_interest_at` | TIMESTAMP | NULL | מתי חויבה ריבית לאחרונה. NULL = מעולם לא לווה |
| `interest_accrued_total` | DECIMAL(18,8) | 0 | סכום כל הריבית שנגבתה לכל החיים (לדיווח/ניהול) |
| `equity` | DECIMAL(18,8) | 0 | תמונת מצב הון עצמי מאוחסנת, מתעדכנת באירועי עסקה |

- **יישות Java:** `TradingAccount.java`
- **Repository:** `TradingAccountRepository.java`
- **מתודה מרכזית:** `findByIdForUpdate(Long id)` — רוכשת נעילת כתיבה פסימיסטית לפני כל פעולת אשראי

---

### 1.2 טבלה: `margin_loan_ledger`

**מטרה:** נתיב ביקורת בלתי ניתן לשינוי. כל אירוע אשראי יוצר שורה אחת בדיוק כאן. שורות **לא נמחקות ולא מתעדכנות לעולם** — זהו יומן פיננסי קבוע.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | BIGSERIAL | מפתח ראשי אוטומטי |
| `trading_account_id` | BIGINT | מפתח זר → `trading_account.id` |
| `entry_type` | VARCHAR(20) | סוג האירוע: `BORROW`, `REPAY`, `INTEREST`, `LIQUIDATION` |
| `amount` | DECIMAL(18,8) | סכום דולרי המעורב באירוע הספציפי הזה |
| `borrowed_after` | DECIMAL(18,8) | תמונת מצב: סך החוב הפתוח **אחרי** האירוע |
| `balance_after` | DECIMAL(18,8) | תמונת מצב: יתרת מזומן **אחרי** האירוע |
| `note` | VARCHAR(255) | תיאור קריא לאנוש של סיבת האירוע |
| `created_at` | TIMESTAMP | חותמת זמן UTC מדויקת, אוטומטית ע"י `@CreationTimestamp` |

- **יישות Java:** `MarginLoanLedger.java`
- **Repository:** `MarginLoanLedgerRepository.java`
  - `findByTradingAccountIdOrderByCreatedAtDesc(Long id)` — היסטוריה מלאה לחשבון אחד
  - `findAllByOrderByCreatedAtDesc()` — כל החשבונות לפי חדש ביותר ראשון (לוח ניהול)

---

## סעיף 2 — יצירת חשבון — הגדרות אשראי ברירת מחדל

**איפה זה קורה:**

```
קובץ:    BrokerApiController.java
מתודה:   ensurePrimaryAccount(AppUser user)
```

**מתי מופעל:** כל קריאת API הזקוקה לחשבון המסחר קוראת ל-`ensurePrimaryAccount()`. אם עדיין לא קיים חשבון למשתמש זה, אחד נוצר אוטומטית — אין קריאת API מפורשת לייצור חשבון.

**שדות הנקבעים במפורש בייצור:**

```java
ta.setAccountType("DEMO");
ta.setCurrency("USD");
ta.setLeverage(100);
ta.setStatus("ACTIVE");
ta.setBalance(new BigDecimal("100000"));   // $100,000 יתרה התחלתית
ta.setEquity(new BigDecimal("100000"));
```

**שדות אשראי שאינם נקבעים (מסתמכים על ברירות מחדל של Java):**

| שדה | מקור ברירת מחדל | ערך |
|---|---|---|
| `creditLimit` | ברירת מחדל שדה Java ב-`TradingAccount.java` | `$10,000` |
| `borrowedBalance` | ברירת מחדל שדה | `$0` |
| `dailyInterestRate` | ברירת מחדל שדה | `0.005` (0.5%/יום) |
| `lastInterestAt` | ברירת מחדל שדה | `null` (שעון לא התחיל) |
| `interestAccruedTotal` | ברירת מחדל שדה | `$0` |

**מסקנה:** לכל משתמש חדש יש מסגרת אשראי של $10,000 זמינה מרגע שנוצר חשבונו. ללא פעולת מנהל, ללא אישור. מגבלת האשראי והריבית מוקשחות ביישות וחלות שווה על כל החשבונות.

---

## סעיף 3 — מפת שימוש בין-מחלקתי

כיצד `MarginLoanService` מתחבר לשאר המערכת:

| קורא | מתודה הנקראת על MarginLoanService | מתי |
|---|---|---|
| `BrokerApiController.placeOrder()` | `tryCoverShortfall(ta, required, u, req)` | משתמש מציב הזמנת LONG — מימון או דחייה |
| `BrokerApiController.placeOrder()` | `tryCoverShortfall(ta, sellRequired, u, req)` | משתמש מציב הזמנת SHORT — מימון או דחייה |
| `BrokerApiController.closePosition()` | `repaySettlementOrBorrow(ta, amount)` | משתמש סוגר פוזיציה ידנית |
| `BrokerApiController.createTransaction()` | `simulateMarginLevelAfterWithdrawal(ta, amount)` | בקשת משיכה — בדיקה אם תפעיל Margin Call |
| `BrokerApiController.cancelOrder()` | `repaySettlementOrBorrow(ta, refund)` | משתמש מבטל הזמנה ממתינה — החזר מרג'ין |
| `BrokerApiController.overview()` | `computeMarginLevel(ta)` | לוח מחוונים — הצגת אחוז רמת מרג'ין נוכחי |
| `OrderExecutionService.executeFilled()` | `tryCoverShortfall(ta, required, u, req)` | הזמנה ממתינה מבוצעת — מממן אותה |
| `OrderExecutionService.closePositionDueToSlTp()` | `repaySettlementOrBorrow(ta, amount)` | רמת SL או TP נפגעת — סילוק הפוזיציה |
| `MarginLoanService` (עצמי, מתזמן) | `accrueDueInterest()` | כל שעה — גובה ריבית אם עברו 24 שעות |
| `MarginLoanService` (עצמי, מתזמן) | `liquidateAccount(accountId)` | כל 10 שניות — סגירה כפויה אם מרג'ין < 100% |

**על מה MarginLoanService תלוי:**

| תלות | שימוש |
|---|---|
| `TradingAccountRepository` | טעינה ונעילת חשבונות (`findByIdForUpdate`) |
| `PositionRepository` | טעינת פוזיציות פתוחות בהנזלה |
| `BrokerOrderRepository` | יצירת רשומות היסטוריית עסקאות בהנזלה |
| `MarginLoanLedgerRepository` | כתיבת רשומות ביקורת בלתי ניתנות לשינוי |
| `MarketPriceService` | שליפת מחירים חיים בהנזלה |
| `NotificationService` | שליחת התראות הנזלה למשתמשים |
| `AuditLogRepository` | כתיבת יומן ביקורת קריא לניהול |

---

## סעיף 4 — נקודות קצה של API — מה הלקוח רואה

> **חשוב:** אין נקודת קצה REST ייעודית להיסטוריית הגרוסבוך. הגרוסבוך קריא רק מלוח הניהול דרך גישת DB ישירה. ה-API הפונה ללקוח מציג רק את מצב האשראי הנוכחי.

### 4.1 `GET /api/broker/overview` — מצב אשראי נוכחי

**מי קורא:** לוח המחוונים של הפרונטאנד, כל כמה שניות.

| שדה JSON | מקור | משמעות |
|---|---|---|
| `borrowedBalance` | `ta.getBorrowedBalance()` | חוב פתוח נוכחי בדולר |
| `creditLimit` | `ta.getCreditLimit()` | מקסימום הלוואה מותרת ($10,000) |
| `marginLevelPct` | `computeMarginLevel(ta) × 100` | רמת מרג'ין באחוזים, או `null` אם אין חוב |
| `interestAccruedTotal` | `ta.getInterestAccruedTotal()` | ריבית כוללת ששולמה לכל החיים (אינפורמטיבי) |
| `dailyInterestRate` | `ta.getDailyInterestRate()` | שיעור נוכחי (0.005 = 0.5%/יום) |

---

### 4.2 `POST /api/broker/orders` — זרימת הצעת האשראי

זהו תהליך דו-שלבי כאשר ליתרת הלקוח יש מחסור:

**שלב 1 — שרת מזהה מחסור, `acceptLoan` לא מוגדר:**

```json
// תגובה 400
{
  "ok": false,
  "error": "credit_offer_available",
  "shortfall": 3000.00,
  "currentDebt": 4000.00,
  "creditLimit": 10000.00,
  "creditAvailable": 3000.00
}
```

**שלב 2 — פרונטאנד מציג דיאלוג "ללוות?", משתמש מאשר, שולח מחדש עם דגל:**

```json
{
  "acceptLoan": true
}
```

**שלב 3 — שרת קורא ל-`tryCoverShortfall()`, לווה, מחזיר 200 OK.**

---

### 4.3 `POST /api/broker/transactions` — חסימת משיכות

```json
// תגובה 400 כאשר משיכה תגרום ל-Margin Call
{
  "ok": false,
  "error": "withdrawal_would_trigger_margin_call",
  "marginLevelAfterPct": 108.5
}
```

---

## סעיף 5 — איך עובדת ההלוואה (פתיחת עסקה)

### 5.1 איפה בקוד זה קורה

| טריגר | מחלקה | מתודה |
|---|---|---|
| משתמש מציב הזמנת שוק/מגבלה/עצירה | `BrokerApiController.java` | `placeOrder()` |
| הזמנה ממתינה מבוצעת ע"י המתזמן | `OrderExecutionService.java` | `executeFilled()` |

שניהם קוראים ל: **`MarginLoanService.tryCoverShortfall()`**

---

### 5.2 `tryCoverShortfall()` — לוגיקה מלאה

```
מחזיר: true  = עסקה אושרה
        false = מגבלת אשראי חרגה → עסקה נדחית
```

שלבים:

1. אם `required <= 0` → החזר `true` מיידית
2. אם `balance >= required` → `balance -= required` → החזר `true` (מזומן בלבד)
3. חשב `shortfall = required - balance`
4. אם `(currentDebt + shortfall) > creditLimit` → **החזר `false` — נדחה**
5. `balance = 0`
6. `borrowedBalance = currentDebt + shortfall`
7. אם `lastInterestAt == null` → `lastInterestAt = now` (הפעלת שעון ריבית)
8. כתוב גרוסבוך: `BORROW`
9. כתוב יומן ביקורת
10. החזר `true` — אושר

> **הגנה מפני מצב גזע:** הקורא חייב לנעול את שורת החשבון (`findByIdForUpdate`) לפני הקריאה למתודה זו.

---

### 5.3 דוגמה מעשית

```
לפני: balance=$3,000, debt=$4,000, limit=$10,000, נדרש=$6,000
שלב 3: shortfall = $3,000
שלב 4: $4,000 + $3,000 = $7,000 < $10,000 → אושר
לאחר: balance=$0, debt=$7,000, אשראי זמין=$3,000
```

---

## סעיף 6 — איך עובד ההחזר (סגירת עסקה)

### 6.1 איפה בקוד זה קורה

| טריגר | מחלקה | מתודה |
|---|---|---|
| משתמש סוגר פוזיציה ידנית | `BrokerApiController.java` | `closePosition()` |
| רמת SL או TP נפגעת | `OrderExecutionService.java` | `closePositionDueToSlTp()` |
| משתמש מבטל הזמנה ממתינה | `BrokerApiController.java` | `cancelOrder()` |

כולם קוראים ל: **`MarginLoanService.repaySettlementOrBorrow()`**

---

### 6.2 `repaySettlementOrBorrow()` — לוגיקה מלאה

```
amount מסומן:
  חיובי = כספים שהתקבלו (מרג'ין מוחזר + רווח)
  שלילי = כספים שיצאו  (הפסד נטו)
```

**מקרה א — חיובי:**
- יש חוב: `repay = min(amount, debt)` → הפחת חוב → שאר ליתרה → כתוב `REPAY`
- אין חוב: כל הסכום ישירות ל-`balance`

**מקרה ב — שלילי (הפסד):**
- `balance >= |loss|` → `balance -= loss`
- `balance < |loss|` → `balance=0`, `debt += extra` → כתוב `BORROW`

---

### 6.3 ערך ה-`amount`

```java
// סגירה ידנית / SL/TP:
amount = marginReturned + grossPnl - commission;

// ביטול הזמנה:
amount = refund;  // ללא עמלה
```

---

### 6.4 סגירה חלקית

המערכת **אינה תומכת** בסגירות חלקיות בגרסה הנוכחית. `closePosition()` תמיד סוגרת את **הפוזיציה כולה**.

---

## סעיף 7 — איך עובדת הריבית

### 7.1 עיצוב המתזמן

```
@Scheduled(fixedDelay = 3_600_000) → רץ כל שעה 1
```

**למה בדיקה שעתית?** מתזמן יומי בזמן קבוע יפעל לא אמין עם הפעלות מחדש של שרת. הבדיקה השעתית קוראת `lastInterestAt` וגובה רק כאשר עברו 24 שעות אמיתיות.

---

### 7.2 זרימה מלאה

1. טען חשבונות עם `borrowed_balance > 0`
2. לכל חשבון: `(now - lastInterestAt) >= 24 שעות`?
   - כן → נעל שורה → `interest = debt × rate` → `debt += interest` → כתוב `INTEREST`
   - לא → דלג

> **חשוב:** ריבית מתווספת ל**חוב**, לא מנוכית ממזומן.

---

### 7.3 דוגמה מעשית

```
לפני: debt=$7,000, rate=0.005, lastInterestAt=2024-01-01 10:00
25 שעות אחר כך:
  interest = $7,000 × 0.005 = $35.00
לאחר: debt=$7,035, interestAccruedTotal+=35
```

---

## סעיף 8 — חישוב רמת המרג'ין

### 8.1 מהי רמת המרג'ין?

```
רמת מרג'ין = liveEquity / borrowedBalance
```

| רמה | אזור | פעולת המערכת |
|---|---|---|
| >= 110% | בטוח | אין פעולה |
| 100% – 110% | Margin Call | אזהרה בממשק, משיכות חסומות |
| < 100% | הנזלה | סגירה כפויה (נבדק כל 10 שניות) |

---

### 8.2 שני חישובי הון עצמי — הבחנה קריטית

| מתודה | נוסחה | מטרה |
|---|---|---|
| `BrokerApiController.recalcEquity()` | `balance + unrealizedPnl` | הצגת לוח מחוונים בלבד |
| `MarginLoanService.liveEquity()` | `balance + marginLocked + unrealizedPnl` | חישובי רמת מרג'ין בלבד |

**למה ההבדל?** במודל מרג'ין משולם מראש, המרג'ין מנוכה מ-`balance` בפתיחת פוזיציה. שימוש ב-`balance + unrealizedPnl` לרמת מרג'ין היה מייצג כל פוזיציה ממונפת כ-Margin Call מיידי שגוי. `liveEquity()` מוסיפה בחזרה את המרג'ין הנעול להצגת ערך הביטחונות האמיתי.

---

### 8.3 מתודות

**`computeMarginLevel(ta)`** — מחזיר יחס (1.25 = 125%), או `null` אם אין חוב

**`simulateMarginLevelAfterWithdrawal(ta, cashAmount)`** — מחזיר מה תהיה רמת המרג'ין לאחר משיכה

---

## סעיף 9 — חסימת משיכות

### 9.1 הבעיה

אם ללקוח יש חוב פתוח, הוא עלול למשוך מזומן ולהוריד את ביטחונותיו מתחת לסף ה-Margin Call.

### 9.2 לוגיקה מלאה

1. משתמש מבקש למשוך `amount` דולר
2. אם `balance < amount` → דחה: `insufficient_balance`
3. קרא ל-`simulateMarginLevelAfterWithdrawal(ta, amount)`
   - מחזיר `null` (אין חוב) → **המשיכה מותרת**
   - `ratio >= 1.10` → **המשיכה מותרת**
   - `ratio < 1.10` → **דחה 400**: `withdrawal_would_trigger_margin_call`

### 9.3 דוגמה

```
balance=$5,000, debt=$8,000, liveEquity=$9,000
רמה נוכחית = 9,000/8,000 = 112.5% (בטוח)

בקשת משיכה $1,500:
  הון עצמי מדומה = $9,000 - $1,500 = $7,500
  רמה מדומה = 7,500/8,000 = 93.75% < 110%
→ נדחה: "withdrawal_would_trigger_margin_call"
```

---

## סעיף 10 — הנזלה כפויה

### 10.1 טריגר

```
@Scheduled(fixedDelay = 10_000) → כל 10 שניות
  לכל חשבון עם חוב: אם level < 1.00 → liquidateAccount()
```

---

### 10.2 `liquidateAccount()` — שלב אחר שלב

1. נעל חשבון. אם אין חוב → החזר.
2. טען פוזיציות פתוחות, מיין לפי `unrealizedPnl` עולה (הפסדים גרועים ביותר תחילה)
3. לכל פוזיציה:
   - אם `marginLevel >= 1.10` → `recovered=true`, **עצור**
   - שלוף מחיר חי. לא זמין → דלג
   - חשב `marginReturned` ו-`pnl`
   - מחק פוזיציה
   - `repaySettlementOrBorrow()` → תמורות מחזירות חוב
   - צור רשומת `BrokerOrder`, שלח התראה
4. **החלטת חוב:**
   - כל הפוזיציות נסגרו + לא התאושש → **מחיקת חוב**
   - התאושש מוקדם → שמור חוב שנותר
   - פוזיציות נותרות → שמור חוב
5. חשב מחדש הון עצמי, שמור, כתוב ביקורת

**למה הגרועים ביותר ראשון?** סגירת ההפסדים הגדולים ביותר ממקסמת את המזומן שנגבה בכל סגירה — מינימום פוזיציות שנסגרות.

---

## סעיף 11 — הגרוסבוך — זרימת כתיבה

### 11.1 `writeLedger()` פרטית

```java
entry.setEntryType(type);              // BORROW / REPAY / INTEREST / LIQUIDATION
entry.setAmount(amount);
entry.setBorrowedAfter(ta.getBorrowedBalance());  // אחרי האירוע
entry.setBalanceAfter(ta.getBalance());           // אחרי האירוע
entry.setNote(note);
ledgerRepo.save(entry);                // INSERT בלבד
```

---

### 11.2 מתי כל סוג רשומה נכתב

| סוג | נכתב מתי |
|---|---|
| `BORROW` | `tryCoverShortfall()` — מחסור מכוסה מאשראי |
| `BORROW` | `repaySettlementOrBorrow()` — הפסד עולה על מזומן |
| `REPAY` | `repaySettlementOrBorrow()` — תמורת סגירה מחזירה חוב |
| `INTEREST` | `chargeInterest()` — 24 שעות עברו |
| `LIQUIDATION` | `liquidateAccount()` — לפי תוצאה |

---

## סעיף 12 — תרשים זרימה מלא

```
══════════════════════════════════════════════════════════════
 אירוע: פתיחת עסקה
══════════════════════════════════════════════════════════════

  placeOrder()  /  executeFilled()
    ↓
  findByIdForUpdate(id)  ← נעילה פסימיסטית
    ↓
  tryCoverShortfall(ta, required)
    ├── יתרה מספיקה        → balance -= required          → ✅ המשך
    ├── מחסור בתוך מסגרת   → balance=0, debt+=shortfall  → ✅ BORROW
    └── חורג ממסגרת        → ❌ 400 נדחה

══════════════════════════════════════════════════════════════
 אירוע: סגירת עסקה / SL-TP
══════════════════════════════════════════════════════════════

  closePosition() / closePositionDueToSlTp()
    ↓
  amount = marginReturned + grossPnl - commission
    ↓
  repaySettlementOrBorrow(ta, amount)
    ├── amount > 0, יש חוב  → החזר חוב, שאר ליתרה → REPAY
    ├── amount > 0, אין חוב → ישירות ליתרה
    └── amount < 0
          ├── יתרה מכסה → balance -= loss
          └── יתרה < הפסד → balance=0, debt+=extra → BORROW

══════════════════════════════════════════════════════════════
 אירוע: משיכת מזומן
══════════════════════════════════════════════════════════════

  createTransaction()
    ↓
  simulateMarginLevelAfterWithdrawal(ta, amount)
    ├── null (אין חוב)  → מותר
    ├── ratio >= 1.10   → מותר
    └── ratio < 1.10    → ❌ נדחה: withdrawal_would_trigger_margin_call

══════════════════════════════════════════════════════════════
 מתזמן: כל שעה
══════════════════════════════════════════════════════════════

  accrueDueInterestTick()
    ↓
  לכל חשבון עם חוב:
    אם 24 שעות עברו → debt += debt × rate → INTEREST

══════════════════════════════════════════════════════════════
 מתזמן: כל 10 שניות
══════════════════════════════════════════════════════════════

  checkLiquidationsTick()
    ↓
  לכל חשבון עם חוב:
    level = liveEquity / debt
    ├── >= 1.10   → בטוח
    ├── 1.00-1.10 → אזהרת Margin Call
    └── < 1.00    → liquidateAccount()
                     הגרועים ביותר ראשון
                     סגור → תמורות → החזר חוב
                     התאושש? עצור מוקדם
                     מחיקת חוב שיורי אם הכל נסגר
                     → LIQUIDATION
```

---
---
---

# Система кредитной линии маржи — Полный справочник
### Проект: UI_alfa Broker Platform

---

## Содержание

1. Что такое кредитная линия маржи и зачем она нужна
2. Карточка быстрого поиска
3. Таблицы базы данных
4. Создание аккаунта — настройки кредита по умолчанию
5. Карта использования между классами
6. API-эндпоинты — что видит клиент
7. Как работает заимствование (открытие сделки)
8. Как работает погашение (закрытие сделки)
9. Как работают проценты
10. Расчёт уровня маржи
11. Блокировка вывода средств
12. Принудительная ликвидация
13. Гроссбух — поток записей
14. Полная схема потоков системы

---

## Раздел 0 — Что такое кредитная линия маржи и зачем она нужна

**Концептуальный фон**

В реальной торговле брокер часто предоставляет клиентам кредитную линию, чтобы они могли открывать позиции большего размера, чем их текущий остаток наличных. Это и есть **кредитная линия маржи** — возобновляемый кредит, который брокер выдаёт автоматически, когда наличные клиента заканчиваются.

**В данном проекте:**

- Каждый торговый счёт начинается с **демо-баланса $100,000** и **кредитным лимитом $10,000**
- Кредитный лимит работает как овердрафт: если баланс достигает $0, но есть доступный кредит, система автоматически берёт займ от имени клиента
- **Подавать заявку на кредит не нужно** — он активируется автоматически и предварительно одобрен системой
- Брокер начисляет **0.5% в день** на любую непогашенную задолженность
- Если долг вырастает слишком сильно по отношению к капиталу, система выдаёт предупреждение **Margin Call**, а затем **принудительно закрывает** позиции (ликвидация) для погашения кредита

**Почему это важно для проекта?**

Без этой системы клиент, израсходовавший все $100,000, не смог бы открывать новые позиции. Кредитная линия имитирует реальный кредитный инструмент брокера и придаёт платформе финансовый реализм.

---

## Карточка быстрого поиска

| Вопрос | Ответ |
|---|---|
| Где вся логика кредита? | `MarginLoanService.java` |
| Где хранится история аудита? | Таблица DB `margin_loan_ledger` / сущность `MarginLoanLedger.java` |
| Где хранится кредитный лимит? | `trading_account.credit_limit` (по умолчанию $10,000) |
| Где хранится непогашенный долг? | `trading_account.borrowed_balance` |
| Где хранится процентная ставка? | `trading_account.daily_interest_rate` (по умолчанию 0.5%/день) |
| Кредит активируется автоматически? | ДА — при первой недофинансированной сделке, без участия пользователя |
| Когда запускается таймер процентов? | Первый займ — `lastInterestAt` меняется с NULL на NOW |
| Что запускает заимствование? | Открытие сделки при недостаточном остатке наличных |
| Что запускает погашение? | Закрытие позиции, срабатывание SL/TP, отмена отложенного ордера |
| Что запускает проценты? | Планировщик каждый час — начисляет, если прошло 24 часа |
| Порог предупреждения Margin Call? | Капитал / Долг < 110% |
| Порог принудительной ликвидации? | Капитал / Долг < 100%, проверяется каждые 10 секунд |
| Сколько таблиц DB? | 2: `trading_account` (живые данные), `margin_loan_ledger` (история) |
| Гроссбух когда-либо удаляется/обновляется? | НИКОГДА — только вставка |
| Гроссбух доступен через REST API? | НЕТ — только через панель администратора / прямой доступ к DB |
| Поток предложения кредита? | API возвращает `credit_offer_available`, клиент повторно отправляет с `acceptLoan=true` |

---

## Раздел 1 — Таблицы базы данных

### 1.1 Таблица: `trading_account`

**Назначение:** Хранит живое финансовое состояние каждого аккаунта, включая все поля, связанные с кредитом. Одна строка на каждый клиентский счёт.

| Столбец | Тип | По умолчанию | Описание |
|---|---|---|---|
| `balance` | DECIMAL(18,8) | 100000 | Текущий остаток наличных. Уменьшается при использовании кредита (может достигать 0) |
| `borrowed_balance` | DECIMAL(18,8) | 0 | **Текущая непогашенная задолженность** перед кредитной линией брокера |
| `credit_limit` | DECIMAL(18,8) | 10000.00 | Максимальный разрешённый суммарный займ для данного аккаунта |
| `daily_interest_rate` | DECIMAL(18,8) | 0.005 | Дневная процентная ставка (0.5% = 0.005) |
| `last_interest_at` | TIMESTAMP | NULL | Когда последний раз начислялись проценты. NULL = ещё никогда не занимал |
| `interest_accrued_total` | DECIMAL(18,8) | 0 | Суммарные проценты за всё время (для отчётности/администратора) |
| `equity` | DECIMAL(18,8) | 0 | Сохранённый снимок капитала, обновляется при торговых событиях |

- **Java-сущность:** `TradingAccount.java`
- **Repository:** `TradingAccountRepository.java`
- **Ключевой метод:** `findByIdForUpdate(Long id)` — захватывает пессимистическую блокировку записи перед любой кредитной операцией

---

### 1.2 Таблица: `margin_loan_ledger`

**Назначение:** Неизменяемый журнал аудита. Каждое кредитное событие создаёт ровно одну строку. Строки **НИКОГДА не удаляются и не обновляются** — это постоянный финансовый журнал.

| Столбец | Тип | Описание |
|---|---|---|
| `id` | BIGSERIAL | Автогенерируемый первичный ключ |
| `trading_account_id` | BIGINT | Внешний ключ → `trading_account.id` |
| `entry_type` | VARCHAR(20) | Тип события: `BORROW`, `REPAY`, `INTEREST`, `LIQUIDATION` |
| `amount` | DECIMAL(18,8) | Сумма в долларах, задействованная в данном конкретном событии |
| `borrowed_after` | DECIMAL(18,8) | Снимок: суммарный долг **после** события |
| `balance_after` | DECIMAL(18,8) | Снимок: остаток наличных **после** события |
| `note` | VARCHAR(255) | Читаемое описание причины события |
| `created_at` | TIMESTAMP | Точная UTC-метка времени, устанавливается автоматически `@CreationTimestamp` |

- **Java-сущность:** `MarginLoanLedger.java`
- **Repository:** `MarginLoanLedgerRepository.java`
  - `findByTradingAccountIdOrderByCreatedAtDesc(Long id)` — полная история одного аккаунта
  - `findAllByOrderByCreatedAtDesc()` — все аккаунты, сначала самые новые (панель администратора)

---

## Раздел 2 — Создание аккаунта — настройки кредита по умолчанию

**Где это происходит:**

```
Файл:    BrokerApiController.java
Метод:   ensurePrimaryAccount(AppUser user)
```

**Когда срабатывает:** Каждый API-вызов, которому нужен торговый счёт, вызывает `ensurePrimaryAccount()`. Если аккаунт для этого пользователя ещё не существует, он создаётся автоматически — отдельного API-вызова для создания аккаунта нет.

**Поля, устанавливаемые явно при создании:**

```java
ta.setAccountType("DEMO");
ta.setCurrency("USD");
ta.setLeverage(100);
ta.setStatus("ACTIVE");
ta.setBalance(new BigDecimal("100000"));   // $100,000 стартовый баланс
ta.setEquity(new BigDecimal("100000"));
```

**Кредитные поля, НЕ устанавливаемые явно (берутся из Java-дефолтов класса):**

| Поле | Источник дефолта | Значение |
|---|---|---|
| `creditLimit` | Java-дефолт поля в `TradingAccount.java` строка 66 | `$10,000` |
| `borrowedBalance` | Java-дефолт поля | `$0` |
| `dailyInterestRate` | Java-дефолт поля | `0.005` (0.5%/день) |
| `lastInterestAt` | Java-дефолт поля | `null` (таймер не запущен) |
| `interestAccruedTotal` | Java-дефолт поля | `$0` |

**Вывод:** У каждого нового пользователя с момента создания аккаунта автоматически есть кредитная линия на $10,000. Без действий администратора, без одобрения. Кредитный лимит и ставка жёстко прописаны в сущности и применяются одинаково ко всем аккаунтам.

> **Замечание для будущего улучшения:** Если нужны индивидуальные кредитные лимиты на каждого пользователя, следует добавить административный эндпоинт для обновления `creditLimit` и `dailyInterestRate`.

---

## Раздел 3 — Карта использования между классами

Как `MarginLoanService` связан с остальной системой:

| Вызывающий | Вызываемый метод MarginLoanService | Когда |
|---|---|---|
| `BrokerApiController.placeOrder()` | `tryCoverShortfall(ta, required, u, req)` | Пользователь ставит LONG — профинансировать или отклонить |
| `BrokerApiController.placeOrder()` | `tryCoverShortfall(ta, sellRequired, u, req)` | Пользователь ставит SHORT — профинансировать или отклонить |
| `BrokerApiController.closePosition()` | `repaySettlementOrBorrow(ta, amount)` | Пользователь закрывает позицию вручную |
| `BrokerApiController.createTransaction()` | `simulateMarginLevelAfterWithdrawal(ta, amount)` | Запрос вывода — проверить, не вызовет ли Margin Call |
| `BrokerApiController.cancelOrder()` | `repaySettlementOrBorrow(ta, refund)` | Отмена отложенного ордера — возврат маржи |
| `BrokerApiController.overview()` | `computeMarginLevel(ta)` | Дашборд — показать текущий уровень маржи в % |
| `OrderExecutionService.executeFilled()` | `tryCoverShortfall(ta, required, u, req)` | Автоматическое исполнение отложенного ордера |
| `OrderExecutionService.closePositionDueToSlTp()` | `repaySettlementOrBorrow(ta, amount)` | Срабатывание SL или TP — расчёт позиции |
| `MarginLoanService` (сам себя, планировщик) | `accrueDueInterest()` | Каждый час — начислить проценты если прошло 24 часа |
| `MarginLoanService` (сам себя, планировщик) | `liquidateAccount(accountId)` | Каждые 10 сек — принудительное закрытие если маржа < 100% |

**От чего зависит MarginLoanService:**

| Зависимость | Для чего используется |
|---|---|
| `TradingAccountRepository` | Загрузка и блокировка аккаунтов (`findByIdForUpdate`) |
| `PositionRepository` | Загрузка открытых позиций при ликвидации |
| `BrokerOrderRepository` | Создание записей истории сделок при ликвидации |
| `MarginLoanLedgerRepository` | Запись неизменяемых записей аудита |
| `MarketPriceService` | Получение живых цен при ликвидации |
| `NotificationService` | Отправка уведомлений о ликвидации пользователям |
| `AuditLogRepository` | Запись читаемого административного журнала аудита |

---

## Раздел 4 — API-эндпоинты — что видит клиент

> **Важно:** Выделенного REST-эндпоинта для истории гроссбуха **нет**. Гроссбух доступен только через панель администратора или прямой доступ к БД. Клиентский API отображает только текущее состояние кредита.

### 4.1 `GET /api/broker/overview` — текущее состояние кредита

**Кто вызывает:** Фронтенд-дашборд, каждые несколько секунд.

| JSON-поле | Источник | Значение |
|---|---|---|
| `borrowedBalance` | `ta.getBorrowedBalance()` | Текущий непогашенный долг в USD |
| `creditLimit` | `ta.getCreditLimit()` | Максимально допустимый займ ($10,000) |
| `marginLevelPct` | `computeMarginLevel(ta) × 100` | Уровень маржи в процентах или `null` если нет долга |
| `interestAccruedTotal` | `ta.getInterestAccruedTotal()` | Суммарные проценты за всё время (информационно) |
| `dailyInterestRate` | `ta.getDailyInterestRate()` | Текущая ставка (0.005 = 0.5%/день) |

---

### 4.2 `POST /api/broker/orders` — поток предложения кредита

Двухшаговое взаимодействие при недостатке баланса:

**Шаг 1 — сервер обнаруживает нехватку, `acceptLoan` не установлен:**

```json
// Ответ 400
{
  "ok": false,
  "error": "credit_offer_available",
  "shortfall": 3000.00,
  "currentDebt": 4000.00,
  "creditLimit": 10000.00,
  "creditAvailable": 3000.00
}
```

**Шаг 2 — фронтенд показывает диалог "занять?", пользователь подтверждает, повторно отправляет с флагом:**

```json
{
  "symbol": "BTCUSD",
  "side": "BUY",
  "quantity": 1,
  "acceptLoan": true
}
```

**Шаг 3 — сервер вызывает `tryCoverShortfall()`, занимает, возвращает 200 OK.**

Если лимит превышен в любом случае: ответ `400 credit_limit_exceeded`.

---

### 4.3 `POST /api/broker/transactions` — блокировка вывода

```json
// Ответ 400 когда вывод вызвал бы Margin Call
{
  "ok": false,
  "error": "withdrawal_would_trigger_margin_call",
  "marginLevelAfterPct": 108.5
}
```

---

## Раздел 5 — Как работает заимствование (открытие сделки)

### 5.1 Где в коде это происходит

| Триггер | Класс | Метод |
|---|---|---|
| Пользователь ставит рыночный/лимитный/стоп-ордер | `BrokerApiController.java` | `placeOrder()` |
| Отложенный ордер исполняется планировщиком | `OrderExecutionService.java` | `executeFilled()` |

Оба вызывают: **`MarginLoanService.tryCoverShortfall()`**

---

### 5.2 `tryCoverShortfall()` — полная логика

```
Файл:      MarginLoanService.java
Сигнатура: public boolean tryCoverShortfall(TradingAccount ta, BigDecimal required,
                                             AppUser user, HttpServletRequest request)
Возвращает: true  = сделка одобрена
            false = превышен кредитный лимит → сделка ОТКЛОНЕНА
```

**Пошагово:**

1. Если `required <= 0` → вернуть `true` (финансирование не нужно)
2. Если `balance >= required` → `balance -= required` → вернуть `true` (только наличные, без долга)
3. Вычислить `shortfall = required - balance`
4. Если `(currentDebt + shortfall) > creditLimit` → **вернуть `false` — ОТКЛОНЕНО**
5. `balance = 0` (все наличные использованы)
6. `borrowedBalance = currentDebt + shortfall` (долг увеличивается)
7. Если `lastInterestAt == null` → `lastInterestAt = now` (запуск таймера процентов)
8. Запись в гроссбух: `BORROW — "Auto-borrow to cover trade shortfall"`
9. Запись в журнал аудита: `"Borrowed X USD (debt now Y)"`
10. Вернуть `true` — одобрено

> **Защита от гонки потоков:** Вызывающий ОБЯЗАН сначала захватить пессимистическую блокировку строки аккаунта через `accountRepo.findByIdForUpdate(id)` перед вызовом этого метода. Без неё два параллельных ордера могут оба пройти проверку лимита и вместе превысить его.

---

### 5.3 Практический пример

```
Состояние аккаунта до сделки:
  balance          = $3,000
  borrowedBalance  = $4,000
  creditLimit      = $10,000
  Требуется        = $6,000

Шаг 3: shortfall = $6,000 − $3,000 = $3,000
Шаг 4: $4,000 + $3,000 = $7,000 < $10,000 → ОДОБРЕНО
Шаг 5: balance = $0
Шаг 6: borrowedBalance = $7,000

Состояние после:
  balance          = $0
  borrowedBalance  = $7,000
  доступный кредит = $3,000
```

---

## Раздел 6 — Как работает погашение (закрытие сделки)

### 6.1 Где в коде это происходит

| Триггер | Класс | Метод |
|---|---|---|
| Пользователь вручную закрывает позицию | `BrokerApiController.java` | `closePosition()` |
| Срабатывает уровень SL или TP | `OrderExecutionService.java` | `closePositionDueToSlTp()` |
| Пользователь отменяет отложенный ордер | `BrokerApiController.java` | `cancelOrder()` |

Все три вызывают: **`MarginLoanService.repaySettlementOrBorrow()`**

---

### 6.2 `repaySettlementOrBorrow()` — полная логика

```
Файл:      MarginLoanService.java
amount — со знаком:
  Положительный = деньги приходят (возврат маржи + прибыль)
  Отрицательный = деньги уходят   (чистый убыток)
```

**Случай А — положительная сумма (прибыльное или безубыточное закрытие):**

1. Если `debt > 0`:
   - `repay = min(amount, debt)`
   - `borrowedBalance = debt - repay`
   - `balance = balance + (amount - repay)` (остаток после погашения долга)
   - Если `repay > 0` → запись в гроссбух `REPAY`
2. Если долга нет → полная сумма идёт в `balance`

**Случай Б — отрицательная сумма (убыточная сделка):**

1. Если `balance >= |убыток|` → `balance -= |убыток|`
2. Если `balance < |убыток|`:
   - `extra = |убыток| - balance`
   - `balance = 0`
   - `borrowedBalance += extra` ← **ДОЛГ УВЕЛИЧИВАЕТСЯ**
   - Запись: `BORROW — "Loss exceeded cash balance — added to credit line debt"`

> **Примечание:** Этот займ-из-убытка НЕ ограничен `creditLimit` — убыток уже произошёл. Механизм ликвидации справляется с избыточным долгом.

---

### 6.3 Что содержит `amount` при вызове

```java
// В closePosition() и closePositionDueToSlTp():
amount = marginReturned + grossPnl - commission;
// marginReturned = avgPrice × qty × contractSize / leverage (всегда положительный)
// grossPnl       = сырая прибыль или убыток (может быть отрицательным)
// commission     = комиссия при закрытии

// В cancelOrder():
amount = refund;
// refund = зарезервированная маржа (без комиссии — ордер не исполнялся)
```

---

### 6.4 Частичное закрытие — что происходит?

Система **не поддерживает** частичное закрытие позиций в текущей реализации. `closePosition()` всегда закрывает **позицию целиком**. `amount`, передаваемый в `repaySettlementOrBorrow()`, всегда представляет полную маржу + P/L позиции.

---

## Раздел 7 — Как работают проценты

### 7.1 Устройство планировщика

```
Файл:      MarginLoanService.java
Планировщик: @Scheduled(fixedDelay = 3_600_000) → запускается каждый 1 ЧАС
Метод:     accrueDueInterestTick()
             └─ вызывает self.accrueDueInterest() (через Spring proxy для @Transactional)
```

**Почему почасовая проверка, а не фиксированное ежедневное время?**
Планировщик, привязанный к конкретному времени суток (например, полночь), будет ненадёжным при перезапусках сервера. Почасовая проверка читает метку `lastInterestAt` каждого аккаунта и начисляет только тогда, когда прошло **24 реальных часа**. Это устойчиво к перезапускам.

---

### 7.2 Полный поток начисления процентов

**`accrueDueInterest()` `[@Transactional]`:**

1. Загрузить все аккаунты где `borrowed_balance > 0`
2. Для каждого: проверить `(now − lastInterestAt) >= 24 часа`
   - ДА → вызвать `chargeInterest(accountId)`
   - НЕТ → пропустить

**`chargeInterest(Long accountId)` `[private]`:**

1. Заблокировать строку аккаунта (`findByIdForUpdate`)
2. `rate = account.dailyInterestRate` (по умолчанию `0.005` = 0.5%)
3. `interest = borrowedBalance × rate`
4. `borrowedBalance = borrowedBalance + interest` ← **долг растёт, наличные не меняются**
5. `interestAccruedTotal += interest` (счётчик за всё время, статистика)
6. `lastInterestAt = now`
7. Сохранить аккаунт
8. Запись в гроссбух: `INTEREST — "Daily interest charge (0.5%/day)"`

> **Критично:** Проценты добавляются к **долгу**, а НЕ вычитаются из наличных. Доступный баланс клиента не изменяется при начислении процентов.

---

### 7.3 Практический пример

```
До:
  borrowedBalance   = $7,000
  dailyInterestRate = 0.005 (0.5%)
  lastInterestAt    = 2024-01-01 10:00:00

Планировщик запускается 2024-01-02 11:00:00 (прошло 25 часов):
  interest = $7,000 × 0.005 = $35.00

После:
  borrowedBalance        = $7,035.00
  interestAccruedTotal  += $35.00
  lastInterestAt         = 2024-01-02 11:00:00

Запись в гроссбух:
  entryType     = "INTEREST"
  amount        = 35.00
  borrowedAfter = 7035.00
  note          = "Daily interest charge (0.5%/day)"
```

---

## Раздел 8 — Расчёт уровня маржи

### 8.1 Что такое уровень маржи?

```
Уровень маржи = liveEquity / borrowedBalance

Примеры:
  $11,000 / $10,000 = 1.10 = 110%  ← порог предупреждения
  $10,000 / $10,000 = 1.00 = 100%  ← порог ликвидации
   $9,000 / $10,000 = 0.90 =  90%  ← за порогом ликвидации
```

| Уровень | Зона | Действие системы |
|---|---|---|
| >= 110% | Безопасно | Никаких действий |
| 100% – 110% | Margin Call | Предупреждение в UI, вывод заблокирован |
| < 100% | Ликвидация | Принудительное закрытие (проверяется каждые 10 сек) |

---

### 8.2 Два расчёта капитала — критическое различие

| Метод | Формула | Назначение |
|---|---|---|
| `BrokerApiController.recalcEquity()` | `balance + unrealizedPnl` | Только отображение дашборда |
| `MarginLoanService.liveEquity()` | `balance + marginLocked + unrealizedPnl` | Только расчёты уровня маржи |

**Почему разница?**

В модели предоплаченной маржи при открытии позиции маржа заранее вычитается из `balance`. Если бы уровень маржи использовал только `balance + unrealizedPnl`, каждая позиция с плечом ложно выглядела бы как немедленный Margin Call. `liveEquity()` добавляет обратно заблокированную маржу, чтобы показать реальную стоимость обеспечения.

```
Расчёт liveEquity() на каждую открытую позицию:
  marginLocked = avgPrice × qty × contractSize / leverage
  pnl          = (livePrice − avgPrice) × qty × contractSize (LONG)
              или (avgPrice − livePrice) × qty × contractSize (SHORT)

Итоговый liveEquity = balance + Σ(marginLocked + pnl)
```

---

### 8.3 Методы

**`computeMarginLevel(TradingAccount ta)`**
- Возвращает: коэффициент (например `1.25` = 125%), или `null` если `borrowedBalance == 0`
- Формула: `liveEquity(ta) / borrowedBalance`
- Вызывается: `checkLiquidationsTick()`, эндпоинт API `overview()`, проверка вывода

**`simulateMarginLevelAfterWithdrawal(TradingAccount ta, BigDecimal cashAmount)`**
- Возвращает: каким был бы уровень маржи **после** вывода, или `null` если нет долга
- Формула: `(liveEquity − cashAmount) / borrowedBalance`
- Вызывается: `BrokerApiController.createTransaction()` — блокирует вывод, который опустит уровень ниже 110%

---

## Раздел 9 — Блокировка вывода средств

### 9.1 Проблема

Если у клиента есть непогашенный долг, он может вывести наличные, опустив обеспечение ниже порога Margin Call. Система должна этому препятствовать.

### 9.2 Полная логика в `createTransaction()`

**Шаги:**

1. Пользователь запрашивает вывод суммы `amount` USD
2. Если `ta.getBalance() < amount` → отклонить: `insufficient_balance`
3. Вызвать `simulateMarginLevelAfterWithdrawal(ta, amount)`:
   - Возвращает `null` → нет долга → **вывод разрешён**
   - Возвращает коэффициент:
     - `ratio >= 1.10` → **вывод разрешён** (обеспечение остаётся достаточным)
     - `ratio < 1.10` → **отклонить 400** + `withdrawal_would_trigger_margin_call` + прогнозируемый `marginLevelAfterPct`

### 9.3 Пример

```
Состояние аккаунта:
  balance    = $5,000
  debt       = $8,000
  liveEquity = $9,000
  Текущий уровень = 9,000 / 8,000 = 112.5% (безопасно)

Пользователь запрашивает вывод $1,500:
  смоделированный капитал = $9,000 − $1,500 = $7,500
  смоделированный уровень = $7,500 / $8,000 = 93.75% < 110%
  → ОТКЛОНЕНО: "withdrawal_would_trigger_margin_call"
  → marginLevelAfterPct = 93.75
```

---

## Раздел 10 — Принудительная ликвидация

### 10.1 Триггер

```
Файл:        MarginLoanService.java
Планировщик: @Scheduled(fixedDelay = 10_000) → каждые 10 СЕКУНД
Метод:       checkLiquidationsTick()
               └─ для каждого аккаунта с долгом:
                    computeMarginLevel(ta)
                    если level < 1.00 → liquidateAccount(accountId)
```

---

### 10.2 `liquidateAccount()` — пошагово

**Шаг 1:** Заблокировать аккаунт (`findByIdForUpdate`). Если `borrowedBalance == 0` → выйти.

**Шаг 2:** Загрузить все открытые позиции. Отсортировать по `unrealizedPnl` **по возрастанию** (наибольшие убытки первыми).

**Шаг 3 — Цикл закрытия:** Для каждой позиции:

- **3а:** Пересчитать `computeMarginLevel(ta)`. Если `>= 1.10` → `recovered = true`, **выйти из цикла**
- **3б:** Получить живую цену от `MarketPriceService`. Недоступна → `continue` (пропустить)
- **3в:** Вычислить `marginReturned` и `pnl` с учётом направления (LONG / SHORT)
- **3г:** `positionRepo.delete(pos)` — позиция закрыта
- **3д:** `repaySettlementOrBorrow(ta, marginReturned + pnl)` — выручка погашает долг
- **3е:** Создать запись `BrokerOrder` со статусом `FILLED`, `realizedPnl = pnl`
- **3ж:** Отправить уведомление `LIQUIDATION` пользователю

**Шаг 4 — Решение по долгу:**

| Условие | Действие |
|---|---|
| `debt > 0` + `!recovered` + позиций не осталось | Списать долг → `borrowedBalance = 0`, гроссбух: `"residual debt written off"` |
| `closedCount > 0` + `recovered` | Сохранить оставшийся долг, гроссбух: `"margin level recovered"` |
| `closedCount > 0` + позиции ещё есть (некоторые пропущены) | Сохранить долг, гроссбух: `"incomplete, debt kept"` |

**Шаг 5:** Пересчитать капитал, сохранить аккаунт, записать в журнал аудита.

---

### 10.3 Почему наибольшие убытки первыми?

```java
positions.sort((a, b) -> unrealizedPnlOf(a).compareTo(unrealizedPnlOf(b)));
// по возрастанию = наиболее отрицательный P/L первым
```

Закрытие наиболее убыточных позиций первыми максимизирует полученные наличные за каждое закрытие. Это минимизирует общее количество позиций, которые нужно закрыть для восстановления уровня маржи — и воспроизводит поведение реальных бирж при ликвидации.

---

### 10.4 Почему списывается остаточный долг?

Если после закрытия **всех** позиций долг всё ещё положительный, у клиента фактически нет обеспечения. Продолжать начислять проценты на безнадёжный долг нецелесообразно. Списание устанавливает `borrowedBalance = 0` и фиксирует событие в гроссбухе. Это финальное разрешение цикла ликвидации.

---

## Раздел 11 — Гроссбух — поток записей

### 11.1 Приватный метод `writeLedger()`

```java
// Файл: MarginLoanService.java
private void writeLedger(TradingAccount ta, String type, BigDecimal amount, String note) {
    MarginLoanLedger entry = new MarginLoanLedger();
    entry.setTradingAccount(ta);
    entry.setEntryType(type);               // BORROW / REPAY / INTEREST / LIQUIDATION
    entry.setAmount(amount);
    entry.setBorrowedAfter(ta.getBorrowedBalance());  // снимок ПОСЛЕ события
    entry.setBalanceAfter(ta.getBalance());           // снимок ПОСЛЕ события
    entry.setNote(note);
    ledgerRepo.save(entry);                 // только INSERT — строки никогда не изменяются
}
```

> `borrowedAfter` и `balanceAfter` устанавливаются **после** всех финансовых изменений. Гроссбух всегда хранит состояние после события, чтобы можно было восстановить историю аккаунта сверху вниз.

---

### 11.2 Когда записывается каждый тип записи

| Тип записи | Когда записывается | Пример примечания |
|---|---|---|
| `BORROW` | `tryCoverShortfall()` — нехватка покрывается кредитом | `"Auto-borrow to cover trade shortfall"` |
| `BORROW` | `repaySettlementOrBorrow()` — убыток превышает наличные | `"Loss exceeded cash balance — added to credit line debt"` |
| `REPAY` | `repaySettlementOrBorrow()` — выручка от закрытия погашает долг | `"Auto-repay from trade settlement"` |
| `INTEREST` | `chargeInterest()` — таймер 24 часа сработал | `"Daily interest charge (0.5%/day)"` |
| `LIQUIDATION` | `liquidateAccount()` — все позиции закрыты, долг списан | `"Liquidation complete — 3 position(s) closed; residual debt written off"` |
| `LIQUIDATION` | `liquidateAccount()` — уровень маржи восстановился досрочно | `"Liquidation complete — margin level recovered"` |
| `LIQUIDATION` | `liquidateAccount()` — неполное закрытие | `"Liquidation incomplete — debt kept"` |

---

## Раздел 12 — Полная схема потоков системы

```
══════════════════════════════════════════════════════════════
 СОБЫТИЕ: Пользователь открывает сделку
══════════════════════════════════════════════════════════════

  BrokerApiController.placeOrder()  или  OrderExecutionService.executeFilled()
    ↓
  accountRepo.findByIdForUpdate(id)           ← ПЕССИМИСТИЧЕСКАЯ БЛОКИРОВКА
    ↓
  tryCoverShortfall(ta, required)
    ├── баланса достаточно         → balance -= required              → ✅ продолжить
    ├── нехватка в пределах лимита → balance=0, debt+=shortfall       → ✅ продолжить
    │                                 + запись BORROW в гроссбух
    └── превышает кредитный лимит  → вернуть false → 400 ОТКЛОНЕНО

══════════════════════════════════════════════════════════════
 СОБЫТИЕ: Сделка закрывается / срабатывает SL или TP
══════════════════════════════════════════════════════════════

  BrokerApiController.closePosition()  или  OrderExecutionService.closePositionDueToSlTp()
    ↓
  amount = marginReturned + grossPnl − commission
    ↓
  repaySettlementOrBorrow(ta, amount)
    ├── amount > 0, долг есть   → погасить долг, остаток в баланс → REPAY
    ├── amount > 0, долга нет   → вся сумма в баланс
    └── amount < 0 (убыток)
          ├── баланс покрывает → balance -= убыток
          └── баланс < убытка  → balance=0, debt+=остаток         → BORROW

══════════════════════════════════════════════════════════════
 СОБЫТИЕ: Пользователь выводит наличные
══════════════════════════════════════════════════════════════

  BrokerApiController.createTransaction()
    ↓
  simulateMarginLevelAfterWithdrawal(ta, amount)
    ├── null (нет долга)   → вывод разрешён
    ├── ratio >= 1.10      → вывод разрешён
    └── ratio < 1.10       → 400 ОТКЛОНЕНО: withdrawal_would_trigger_margin_call

══════════════════════════════════════════════════════════════
 ПЛАНИРОВЩИК: Каждый час
══════════════════════════════════════════════════════════════

  accrueDueInterestTick()
    ↓
  Для каждого аккаунта с долгом > 0:
    Если (now − lastInterestAt) >= 24 часа:
      borrowedBalance += borrowedBalance × dailyInterestRate
      + запись INTEREST в гроссбух

══════════════════════════════════════════════════════════════
 ПЛАНИРОВЩИК: Каждые 10 секунд
══════════════════════════════════════════════════════════════

  checkLiquidationsTick()
    ↓
  Для каждого аккаунта с долгом > 0:
    marginLevel = liveEquity / borrowedBalance
    ├── >= 1.10    → безопасно, нет действий
    ├── 1.00–1.10  → предупреждение Margin Call в UI
    └── < 1.00     → liquidateAccount()
                      Сортировать: наибольшие убытки первыми
                      Закрыть каждую → repaySettlementOrBorrow()
                      Если маржа восстановилась до >= 1.10 — остановить
                      Списать остаточный долг если все позиции закрыты
                      + запись LIQUIDATION в гроссбух
```
