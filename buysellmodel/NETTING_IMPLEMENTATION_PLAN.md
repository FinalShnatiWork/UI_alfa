# Netting Implementation Plan — Client vs. Computer (Demo)

**Goal:** turn the "AI routing" in UI_alfa into real netting. A client order is crossed **internally at the mid price** against an opposite order. Only the unmatched remainder goes to the external market. The broker earns commissions plus the exchange fees it saved, and **never takes a market position itself**.

**Demo constraint:** there are too few real users to produce matches. The counterparty is therefore a **computer**: a *House Liquidity Simulator* (HLS) that runs simulated client accounts. They post and take orders exactly like a real client would. Every run ends with a **test script** that checks the model and the netting engine and prints a pass/fail report. A **two-client live visualizer** (section 9.5) plays Trader A and Trader B through every situation the model can hit, on screen.

Based on branch `develop` @ `e8c3c94`.

---

## 0. Implementation status (v3) — built and verified

Steps 1–8 are **implemented**. Step 9 (NN retraining) waits for real outcome data.

**Verified in a sandbox** (the full Spring Boot app running on PostgreSQL 16 with every migration V1–V32, using David's own Maven cache):

| Check | Result |
|---|---|
| Existing JUnit tests (before and after the change) | 17/17 → still 17/17 |
| New Java tests (engine scenarios, NBBO, feature parity) | 11/11 (28/28 total) |
| `model_check.js` (JS engine parity, golden features, NN regression gate) | 50/50 |
| Live scenarios V01–V16 against the real backend (`netting_e2e.js`) | 16/16 + invariants I1–I7 |
| The same scenarios `--offline` | 16/16 |
| Concurrency stress: 4 users + computer, 330 parallel orders | 0 errors, 0 deadlocks, invariants pass |
| Regressions: UI LIMIT, LIMIT→STOP re-classification, TP close, credit-offer / acceptLoan | unchanged |
| React UI type check (`tsc --noEmit`) | clean |

**Where the implementation differs from v2 (on purpose):**
- **Explicit LIMIT (R2):** the React UI *relies* on the LIMIT→STOP re-classification to create stop orders, so honouring every explicit LIMIT would break it. An explicit LIMIT is kept only when the request carries `strictLimit: true`; the UI never sends it, so its behaviour is unchanged.
- **Config key:** `broker.netting.limit-wait-ms` (8000), not `wait-ms`. MARKET orders never wait.
- **Test users:** `netting.a@broker.local` / `netting.b@broker.local` (password `Netting123!`), auto-registered. The demo user's password in the seeded data is unknown, and the test should not touch David's accounts.
- **Column types:** `NUMERIC(18,8)`, the same as the existing quantity/price columns.
- **Pure core:** a `PriceSpread` class was also extracted; `TradingFees.applySpread` delegates to it with identical numbers. The core compiles with plain `javac` and no classpath.
- **H2:** the H2 profile was already broken before this work (V11 uses a PostgreSQL `DO $$` block), so PostgreSQL is the supported database.
- **Pre-existing bug fixed:** a brand-new user's first GET (e.g. `/overview`) failed with "cannot execute INSERT in a read-only transaction", caused by the recent `@Transactional(readOnly=true)` commit. The account is now created in its own short transaction.
- **Invariants as implemented:**
  - I6 = every netting-era filled order paid commission.
  - I7 = Σ match qty = Σ BUY internal qty = Σ SELL internal qty, so every internal unit has a real counterparty.
- **NN shadow:** judged per execution (would this execution cross internally?). A LIMIT that waited and was matched later can show "NN EXTERNAL / correct" for its first execution.
- **Economics insight:** with the fixed $1.50 external fee and 2.5 bps commission (minimum $0.10), a small order routed external costs the broker more than it earns. Netting is what makes small orders profitable.

---

## 1. Why the current code does not do netting

| # | Problem | Where |
|---|---------|-------|
| 1 | The model decides **after** the fill: the position is already open, so "INTERNAL" matches nobody. The broker silently becomes the counterparty (B-Book). | `OrderExecutionService.executeFilled()`, `BrokerApiController.placeOrder()` |
| 2 | `sellQtyNorm` defaults to `0.45` when no sellers exist, inventing a counterparty. | `OrderExecutionService` ~L270, `BrokerApiController.applyNnRouting()` ~L286 |
| 3 | `imbalance` is sent in `[-1, 1]`, but the model was trained on `(imb+1)/2` in `[0, 1]`. | same two places |
| 4 | SELL orders are treated as BUY: the code looks for sellers instead of buyers. | same two places |
| 5 | Order **counts** are sent instead of **quantities**. Values are not clamped. The spread is 10–100× smaller than the training range. `historicalMatchRate` is hard-coded to `0.72`. | same two places |
| 6 | The feature builder is **duplicated** in two classes. | `applyNnRouting()` and `executeFilled()` |
| 7 | The NN label is a deterministic rule: `sellQty > 0 && matchQty/buyQty > 0.1`. A network adds nothing over an `if`. | `nn_core.js → generateLabels()` |
| 8 | Measured result: 5,000 realistic orders with **no** opposite side, **100 %** routed INTERNAL. | `buysellmodel` scenario run |

**Decision:** routing becomes **deterministic** (a matching engine with an NBBO check). The NN stays as an **advisor in shadow mode**. Its prediction is stored and compared with the real outcome, but it never decides.

---

## 1.5 Plan review (v2): issues found in v1 and how they are fixed

Every item below was checked against the code on `develop` @ `e8c3c94`.

| # | Issue in v1 | Evidence | Fix (applied in the sections below) |
|---|-------------|----------|-------------------------------------|
| R1 | **Deadlock risk.** `placeOrder` locks the client's account first; netting then locks *other* clients' orders and accounts. Two opposite market orders can each hold one account and wait for the other. | `BrokerApiController.placeOrder()` → `accountRepo.findByIdForUpdate` at the top | **Two-phase execution:** tx 1 validates, reserves and saves the order as `NEW`, then commits. Tx 2, `NettingService.execute(orderId)`, runs in its own transaction (through the `self` proxy, `REQUIRES_NEW`) and takes **all** locks in one global order: orders by id asc, then accounts by id asc. It retries up to 3× on `PessimisticLockingFailureException` / `CannotAcquireLockException`. |
| R2 | **Client-vs-client can never happen.** A "resting" order that crosses the mid does not exist. `placeOrder` turns a BUY above / SELL below the price into a **STOP**, and `tick()` fills any marketable LIMIT externally within 2 s. | `placeOrder` L400–416; `shouldFillLimit` | **(a)** Respect the client's explicit `orderType: LIMIT`; the React UI already sends it (`api.ts` L328). Re-classify to STOP only when the type is missing. **(b)** Add a **netting window**, `broker.netting.wait-ms`: a marketable order with no internal counterparty becomes `PENDING_NET` and stays visible to the engine for up to `wait-ms` before going external. Demo default 8000 ms; 0 disables it. |
| R3 | **Tick starvation.** `findTop50ByStatusOrderByCreatedAtAsc("NEW")` would fill up with simulator LIQUIDITY orders, so user orders would never be processed. | `OrderExecutionService.tick()` | New repository query that excludes `order_type = 'LIQUIDITY'` and picks up `NEW`, `PARTIALLY_FILLED` and `PENDING_NET` (expired window → external). |
| R4 | **Frozen quote only half-frozen.** Freezing inside the netting code alone would leave equity, SL/TP and the UI on live prices, so the numbers would disagree. | `MarketPriceService.getLivePrice` is used everywhere | The freeze lives **inside `MarketPriceService`**: an override map checked first in `getLivePrice`. It has a TTL (auto-unfreeze after 10 min) so a crashed script never leaves prices frozen. |
| R5 | **Sim accounts with fixed ids** would collide on teammates' databases, which get different data through V29/V31. | V30 had to resync sequences for exactly this reason | Insert by **email** with `WHERE NOT EXISTS`, without fixed ids. Look up ids by email at runtime. |
| R6 | **`ddl-auto: validate`.** Any mismatch between V32 and the entities stops the app from starting. | `application.yml` | Add an `InternalMatch` entity and the new `BrokerOrder` fields with column types exactly matching V32. Step 1 is done only when the app starts on **both** H2 and Postgres. |
| R7 | **Fake revenue.** Commissions paid by simulated accounts are demo money, not broker income. | — | The admin panel splits revenue into **real clients** and **simulated**. KPIs use real clients only. |
| R8 | **Admin routing column** reads `nn_route_recommendation` and defaults to `EXTERNAL`. | `AdminTradeController` L132 | `TradeDto.executionRouting` comes from the new `routing` column. |
| R9 | **No JSON library for the shared scenario file in JUnit** was specified. | `pom.xml` already has `org.json` | Use `org.json`. **No new dependencies.** |
| R10 | **V09 was wrong in v1.** A resting BUY below mid can never pass NBBO. | NBBO rule `buyLimit ≥ mid` | Rewritten: first reject, then the price drops and the order matches. |
| R11 | **Migration number.** | Checked every remote branch: no V32+ exists | `V32__netting.sql` is free. |
| R12 | **The pure core cannot be compiled or tested on its own.** `TradingFees` calls `BrokerApiController.getContractSize()`, which drags in Spring. Maven Central is unreachable from the dev sandbox, so only dependency-free classes can be compiled and tested there. | `TradingFees.calculateCommission` | Move `getContractSize` into a new pure class `ContractSpecs`; `BrokerApiController.getContractSize` delegates to it, so there is no behaviour change. The `netting` core (`Quote`, `NbboValidator`, `NettingEngine`, `MatchPlan`, `FeatureBuilder`) imports **only** `java.*`, `TradingFees` and `ContractSpecs`. |

---

## 2. Target flow

```
Client order (MARKET or marketable LIMIT)
        │
        ▼
 QuoteService.snapshot(symbol) ──► bid / mid / ask  (mid = live price, bid/ask = TradingFees spread)
        │
        ▼
 NettingEngine.plan(incoming, restingOpposite, quote)     ← pure function, no Spring, no DB
        │   • price-time priority over resting opposite orders (users + simulated)
        │   • NBBO check per pair (buyLimit ≥ mid, sellLimit ≤ mid, bid < ask)
        │   • no self-match (same trading account)
        │   • partial fills allowed
        ▼
 MatchPlan { fills[] (qty @ mid, counterparty order), remainderQty }
        │
        ├── fills[]      → NettingService.bookInternalFill()  (both sides: position @ mid, commission, internal_match row)
        └── remainderQty → ExternalRouter (MT5 if connected, else demo "external fill" at ask/bid + external fee)
        │
        ▼
 FeatureBuilder + NNPredictorClient  (shadow: store prediction, never decide)
```

**Key invariant:** for every internal match, one side goes LONG and the other goes SHORT for the same quantity at the same price. **The house's net exposure from netting is always 0.**

---

## 3. The "computer" counterparty: House Liquidity Simulator

### 3.1 What it is
- There are N **simulated accounts** (default 2), e.g. `sim-lp-1@broker.local` and `sim-lp-2@broker.local`. They are flagged `is_simulated = true` and created by migration with a large demo balance (1,000,000) and leverage 100.
- They behave like clients: they hold positions and pay commission.
- Their P/L is reported **separately** as "Simulated counterparty P/L". It is **not** broker P/L.

### 3.2 What it does (scheduled, every `sim.tick-ms`, default 3 s)
1. **Quote:** for each configured symbol, keep `orders-per-side` resting LIQUIDITY orders on each side.
   - Limit price = `mid × (1 + offsetBps / 10,000)`, where `offsetBps` is random in `[quote-offset-min-bps, quote-offset-max-bps]`, default `[-2, +2]`.
   - Because the offset has both signs, some quotes pass the NBBO check and some fail. Both INTERNAL and EXTERNAL outcomes therefore happen naturally.
2. **Refresh:** cancel LIQUIDITY orders older than `ttl-seconds` (default 30) and re-quote around the latest mid.
3. **Take:** with probability `market-rate-per-min / (60,000 / tick-ms)`, send a MARKET order from a sim account. This creates matches against real users' resting LIMIT orders.
4. **Size:** each order's size is random in `[min-qty, max-qty]` per symbol, e.g. BTC 0.01–0.2, EURUSD 0.1–2 lots, XAU 0.05–1.

### 3.3 Rules that keep it safe
- **Order type:** simulator orders use `order_type = 'LIQUIDITY'`. `OrderExecutionService.tick()` must **skip** them, so they are never filled against the external market. They fill **only** through netting.
- **Self-matching:** a sim account can never match itself or another sim account (`is_simulated` on both sides → skip). Matches are always *client vs. computer* or *client vs. client*.
- **Kill switch:** `broker.netting.sim.enabled=false` cancels all LIQUIDITY orders on the next tick.
- **Deterministic test endpoint** (localhost-only, under `/api/admin`):
  - `POST /api/admin/netting/sim/inject {symbol, side, qty, offsetBps}` places one LIQUIDITY order.
  - `POST /api/admin/netting/sim/clear` removes all LIQUIDITY orders.

---

## 4. Database — `V32__netting.sql`

```sql
-- Simulated counterparties
ALTER TABLE app_user        ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trading_account ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;

-- Fill accounting on orders
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS filled_qty   NUMERIC(24,8) NOT NULL DEFAULT 0;
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS internal_qty NUMERIC(24,8) NOT NULL DEFAULT 0;
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS external_qty NUMERIC(24,8) NOT NULL DEFAULT 0;
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS routing      VARCHAR(16);   -- INTERNAL | EXTERNAL | SPLIT | LEGACY
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS nn_shadow_correct BOOLEAN;  -- NN prediction vs real outcome

UPDATE broker_order SET routing = 'LEGACY' WHERE routing IS NULL AND nn_route_recommendation = 'LEGACY';

-- One row per internal cross (the audit trail of netting)
CREATE TABLE IF NOT EXISTS internal_match (
  id              BIGSERIAL PRIMARY KEY,
  symbol_code     VARCHAR(32)   NOT NULL,
  buy_order_id    BIGINT        NOT NULL REFERENCES broker_order(id),
  sell_order_id   BIGINT        NOT NULL REFERENCES broker_order(id),
  buy_account_id  BIGINT        NOT NULL REFERENCES trading_account(id),
  sell_account_id BIGINT        NOT NULL REFERENCES trading_account(id),
  quantity        NUMERIC(24,8) NOT NULL,
  bid             NUMERIC(24,8) NOT NULL,
  mid             NUMERIC(24,8) NOT NULL,
  ask             NUMERIC(24,8) NOT NULL,
  buyer_improvement  NUMERIC(24,8) NOT NULL,  -- (ask - mid) * qty * contractSize
  seller_improvement NUMERIC(24,8) NOT NULL,  -- (mid - bid) * qty * contractSize
  external_fee_saved NUMERIC(24,8) NOT NULL,  -- 2 × external fee (both legs stayed in-house)
  created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_nbbo CHECK (bid < mid AND mid < ask),
  CONSTRAINT chk_no_self CHECK (buy_account_id <> sell_account_id)
);
CREATE INDEX IF NOT EXISTS idx_internal_match_symbol ON internal_match(symbol_code, created_at);
CREATE INDEX IF NOT EXISTS idx_order_resting ON broker_order(symbol_code, side, status, order_type);

-- Two simulated liquidity accounts (password hash is an unusable value; they never log in).
-- No fixed ids (R5): insert by email, look ids up at runtime.
INSERT INTO app_user (email, display_name, password_hash, role, banned, is_simulated, created_at)
SELECT 'sim-lp-1@broker.local', 'Computer LP 1', '!disabled', 'USER', FALSE, TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE email = 'sim-lp-1@broker.local');
-- same for sim-lp-2, then one trading_account per sim user
-- (balance 1000000, leverage 100, is_simulated TRUE) with WHERE NOT EXISTS on user_id.
-- Column list must match V4/V5 trading_account columns exactly — copy it from V29's INSERT.

-- Order status values added: PARTIALLY_FILLED, PENDING_NET (R2). Order type added: LIQUIDITY.
```

H2 note: the default profile uses H2 in PostgreSQL mode. Keep the SQL portable: no partial indexes, and `BIGSERIAL` works in H2's PG mode.

---

## 5. Backend components

New package: `com.brokerui.broker.netting`.

| File | Type | Responsibility |
|------|------|----------------|
| `Quote.java` | record | `bid, mid, ask, takenAt`. `Quote.of(mid)` uses `TradingFees.applySpread`. |
| `QuoteService.java` | @Service | `snapshot(symbol)` wraps `MarketPriceService.getLivePrice`. Rejects `mid <= 0`. |
| `NbboValidator.java` | pure | Java port of `validateAndCross()` from `buysellmodel/README_EN.md`. Returns `Approved` or `Rejected(reason)`. |
| `NettingEngine.java` | pure | `MatchPlan plan(IncomingOrder in, List<RestingOrder> opposite, Quote q)` implementing price-time priority, NBBO, no self-match, sim-vs-sim skip and partial fills. **No Spring, no DB.** This is what the tests hit. |
| `MatchPlan.java` | record | `List<Fill> fills`, `BigDecimal remainderQty`, `List<String> rejectReasons`. |
| `NettingService.java` | @Service @Transactional | Loads resting opposite orders, calls the engine, books fills, routes the remainder. See 5.2 for lock order. |
| `FillBooking.java` | @Component | Extracted from `executeFilled()`: `book(account, order, side, qty, price, commission)` handles margin, reserve release, commission tx and position. It is shared by internal fills, external fills and LIMIT fills, so there is only one copy of the money logic. |
| `ExternalRouter.java` | @Service | Remainder handling. If `mt5Service` is connected, `sendTrade`. Otherwise demo fill at ask/bid. Records `external_qty` and the external fee cost. |
| `FeatureBuilder.java` | pure | **The only** feature builder, byte-for-byte equal to `nn_core.extractFeatures`: side-aware, quantities, clamping, `(imb+1)/2`, spread in price units against the training range, `historicalMatchRate` from `internal_match` over the last 24 h. |
| `HouseLiquiditySimulator.java` | @Service @Scheduled | Section 3. Enabled by config. |
| `NettingAdminController.java` | @RestController `/api/admin/netting` | `summary`, `matches`, `sim/inject`, `sim/clear`, `invariants`. Localhost-only through the existing `LocalhostOnlyFilter`. |

### 5.1 Engine pseudocode

```java
MatchPlan plan(IncomingOrder in, List<RestingOrder> opposite, Quote q) {
  if (!(q.bid() < q.mid() && q.mid() < q.ask())) return MatchPlan.none(in.qty(), "CROSSED_MARKET");
  // Implicit limit for MARKET orders: BUY = ask, SELL = bid (always satisfies NBBO on its own side)
  BigDecimal inLimit = in.limit() != null ? in.limit() : (in.isBuy() ? q.ask() : q.bid());
  if (in.isBuy() ? inLimit < q.mid() : inLimit > q.mid()) return MatchPlan.none(in.qty(), in.isBuy() ? "BUY_LIMIT_BELOW_MID" : "SELL_LIMIT_ABOVE_MID");

  opposite.sort(in.isBuy() ? byLimitAscThenTime : byLimitDescThenTime);   // best price first, then oldest
  BigDecimal left = in.qty(); List<Fill> fills = new ArrayList<>();
  for (RestingOrder r : opposite) {
    if (left.signum() == 0) break;
    if (r.accountId().equals(in.accountId())) continue;             // no self-match
    if (r.simulated() && in.simulated()) continue;                  // computer never trades with computer
    boolean ok = in.isBuy() ? r.limit() <= q.mid() : r.limit() >= q.mid();   // NBBO for the resting side
    if (!ok) continue;
    BigDecimal qty = min(left, r.remainingQty());
    fills.add(new Fill(r.orderId(), r.accountId(), qty, q.mid()));
    left = left.subtract(qty);
  }
  return new MatchPlan(fills, left, List.of());
}
```

### 5.2 Booking rules (NettingService)
- **Two-phase (R1):** `placeOrder` only validates, reserves and saves `NEW`, then commits. Only after that does it call `nettingService.execute(orderId)`, which runs in a **new** transaction.
- **Lock order:** lock all involved **orders** sorted by id, then all involved **accounts** sorted by id. This matches today's order-then-account convention in `tryExecute` and `cancelOrder`, and the global sort prevents cycles. Retry up to 3× on a lock failure.
- **Netting window (R2):** if the plan has a remainder and `wait-ms > 0`:
  - A MARKET order or marketable LIMIT becomes `PENDING_NET` with `net_deadline = now + wait-ms`.
  - While pending, it is an eligible resting order for incoming opposite orders.
  - `tick()` sends expired `PENDING_NET` orders to `ExternalRouter`.
  - Add a `net_deadline TIMESTAMP` column to `broker_order` in V32.
- **Per fill:**
  - Buyer opens LONG `qty @ mid`; seller opens SHORT `qty @ mid`.
  - Each side pays `TradingFees.calculateCommission(symbol, qty, mid)`.
  - Resting LIMIT reserves are released through `FillBooking` (same `repaySettlementOrBorrow` logic as today).
- **Order status:**
  - `filled_qty += qty` and `internal_qty += qty`.
  - Status becomes `FILLED` when `filled_qty == quantity`, otherwise `PARTIALLY_FILLED`, which stays resting and eligible.
- **Records:** one `internal_match` row per fill.
- **Remainder:**
  - Incoming MARKET: the remainder goes to `ExternalRouter` immediately.
  - Incoming LIMIT that is not marketable: the remainder stays resting in the book.
- **Routing label:**
  - `internal_qty == quantity` → `INTERNAL`
  - `external_qty == quantity` → `EXTERNAL`
  - otherwise `SPLIT`
- **After the DB transaction commits** (`TransactionSynchronization.afterCommit`):
  - The NN shadow call happens here. **No network calls while holding row locks.**
  - `MT5 sendTrade` also moves here.

### 5.3 Changes to existing code
- **`BrokerApiController.placeOrder()` (MARKET branch):** replace the inline fill + `applyNnRouting()` with `nettingService.execute(order)`. **Delete `applyNnRouting()`.**
- **`OrderExecutionService.tryExecute()`:**
  - When a LIMIT or STOP becomes fillable, call `nettingService.execute(order)` instead of `executeFilled()`.
  - Skip `order_type = 'LIQUIDITY'`.
  - Delete the feature-building block.
- **`OrderExecutionService.tick()` (R3):**
  - Use a new query that excludes `LIQUIDITY` and picks up `NEW`, `PARTIALLY_FILLED` and expired `PENDING_NET`.
  - Keep the per-order try/catch.
- **`BrokerApiController.placeOrder()` (R2):** honour an explicit `orderType: LIMIT` / `STOP` from the request. Re-classify by price only when the type is missing.
- **`MarketPriceService` (R4):** add a `testOverrides` map (symbol → `{mid, crossed, expiresAt}`) checked first in `getLivePrice`. It is only writable through the test endpoints.
- **`BrokerApiController.cancelOrder()`:** refund only the **unfilled** part of the reservation (`quantity - filled_qty`).
- **`AdminTradeController.TradeDto`:** add `routing`, `internalQty` and `externalQty`.

### 5.4 Config (`application.yml`)

```yaml
broker:
  netting:
    enabled: true
    external-fee-per-trade: 1.50        # broker's cost when a leg goes external (matches TradingFees.COMMISSION_PER_TRADE)
    nn-shadow: true                     # call NN after commit, store prediction, never decide
    limit-wait-ms: 8000                 # R2 netting window for marketable LIMITs; 0 = send remainder external immediately
    test-endpoints:
      enabled: true                     # demo only: freeze-quote, crossed-quote, nn-offline, inject
      freeze-ttl-minutes: 10            # auto-unfreeze safety (R4)
    sim:
      enabled: true
      tick-ms: 3000
      accounts: 2
      symbols: [BTCUSD, EURUSD, XAUUSD]
      orders-per-side: 3
      quote-offset-min-bps: -2
      quote-offset-max-bps: 2
      ttl-seconds: 30
      market-rate-per-min: 6
      qty:
        BTCUSD: [0.01, 0.20]
        EURUSD: [0.10, 2.00]
        XAUUSD: [0.05, 1.00]
```

---

## 6. Neural network: shadow mode and retraining

1. **Shadow mode:** after commit, build features with `FeatureBuilder` and call `/predict`. Store `nn_match_prob` and `nn_route_recommendation`. Set `nn_shadow_correct = (nnRoute == routing-by-majority)`.
2. **Retrain later from real outcomes:**
   - Add `train.js --from-db export.json`, which reads `broker_order` + `internal_match` exported by `/api/admin/netting/matches?format=training`.
   - Labels come from what the engine actually did, not from a hand-written rule.
3. **Fix the synthetic generator in `train.js`:**
   - Include SELL-side incoming orders.
   - Express spread in **bps** so BTC, FX and gold share one scale.
   - Add NBBO-failing scenarios.
4. **Promotion rule:** the NN may only become a *pre-filter* (e.g. "wait 2 s for a counterparty instead of sending external now") after shadow accuracy is ≥ 95 % over ≥ 1,000 orders. Until then it stays advisory.

---

## 7. Admin panel

| Card | Formula | Source |
|------|---------|--------|
| Internal rate (by qty) | Σ internal_qty / Σ filled_qty | `broker_order` (excl. LEGACY) |
| Matches | count(internal_match) | `internal_match` |
| **Broker revenue (real clients)** | commissions from real clients + external fees saved − external fees paid. Sim commissions are shown on a separate line, "demo money" (R7). | `account_transaction` (COMMISSION) + `internal_match.external_fee_saved` + `external_qty` × fee |
| Client price improvement | Σ buyer_improvement + seller_improvement (real users only) | `internal_match` |
| **House net exposure** | per symbol: Σ LONG qty − Σ SHORT qty over *all* netted positions. **Must be 0.** | `position` joined to orders with routing INTERNAL |
| Simulated counterparty P/L | realized + unrealized of `is_simulated` accounts | `broker_order`, `position` |
| Legacy (excluded) | shown greyed, not in any KPI | `routing = 'LEGACY'` |

Remove the current "Total Broker Profit = −Σ client realizedPnl" formula. Under netting, the broker is not the counterparty, so client P/L is not broker P/L.

Note: on internal fills the client gets the mid, so the broker **no longer earns the spread** on that quantity. Revenue is commissions plus saved fees. This is by design and matches the README.

---

## 8. Test plan — scenarios

These scenarios live in **one** shared file, `buysellmodel/tests/netting_scenarios.json`, which is used by both the JS script and the Java tests.

| ID | Setup (resting opposite side) | Incoming | Expected |
|----|-------------------------------|----------|----------|
| S01 | empty book | BUY 10 MARKET | EXTERNAL 10, 0 matches |
| S02 | SELL 10 limit = mid − 1bp (sim) | BUY 10 MARKET | INTERNAL 10 @ mid, 1 match |
| S03 | SELL 10 limit = mid + 1bp (sim) | BUY 10 MARKET | NBBO reject → EXTERNAL 10 |
| S04 | SELL 4 (sim) | BUY 10 MARKET | SPLIT: INTERNAL 4 @ mid, EXTERNAL 6 |
| S05 | BUY 10 limit = mid + 1bp (sim) | SELL 10 MARKET | INTERNAL 10 @ mid (**SELL side works**) |
| S06 | SELL 3 @ −2bp (t1), SELL 3 @ −1bp (t0), SELL 3 @ −2bp (t0) | BUY 5 MARKET | price-time: fills 3 (−2bp, t0) then 2 (−2bp, t1) |
| S07 | SELL 10 from **same account** | BUY 10 MARKET | self-match skipped → EXTERNAL 10 |
| S08 | SELL 10 (sim) | BUY 10 from **sim** | sim-vs-sim skipped → EXTERNAL 10 |
| S09 | crossed market (bid ≥ ask) | BUY 10 MARKET | CROSSED_MARKET → EXTERNAL / reject |
| S10 | SELL 10 (sim) | BUY LIMIT 10 @ mid − 5bp | not marketable → rests, 0 fills |
| S11 | SELL 500 (sim) | BUY 0.01 BTC | INTERNAL 0.01, resting SELL becomes PARTIALLY_FILLED |
| S12 | real user A SELL 10 limit ≤ mid | real user B BUY 10 MARKET | INTERNAL client-vs-client |
| S13 | SELL 10 (sim), **NN server down** | BUY 10 MARKET | INTERNAL 10 (the decision does not depend on the NN) |
| S14 | cancel after partial fill | user LIMIT BUY 10, 4 filled, then cancel | refund covers the unfilled 6 only |

**Invariants checked after every scenario and after every e2e run:**
- **I1:** each `internal_match` has `bid < mid < ask`, and its price equals the mid of the quote used.
- **I2:** the NBBO check held for both sides.
- **I3:** house net exposure from netted positions = 0 per symbol.
- **I4:** no row has `buy_account_id = sell_account_id`, and there is no sim-vs-sim match.
- **I5:** `internal_qty + external_qty = filled_qty ≤ quantity` for every order.
- **I6:** every internal fill produced exactly 2 COMMISSION transactions (buyer and seller).
- **I7:** with no opposite liquidity, 0 % INTERNAL. This catches the old "fake seller" bug.

---

## 9. Test scripts

### 9.1 `buysellmodel/tests/model_check.js` — model and feature sanity (no backend needed)

```
node buysellmodel/tests/model_check.js                 # run checks, exit 1 on failure
node buysellmodel/tests/model_check.js --write-golden  # write expected feature vectors into netting_scenarios.json
```

What it does:
1. Loads `nn_core.js` and `training_results.json`.
2. For every scenario, builds features with `extractFeatures` and prints the NN route next to the **engine-expected** route.
3. **Regression gate:** 1,000 random orders with an empty opposite side must give **0 %** NN INTERNAL. The old Java features gave 100 %; the script also re-creates that legacy vector and prints it as `LEGACY (expected to fail)` for comparison.
4. With `--write-golden`, it writes `expectedFeatures` per scenario. `FeatureBuilderParityTest` in Java asserts the same 8 numbers (tolerance 1e-9).

### 9.2 JUnit (pure, no Mockito, same style as `PositionCloseMathTest`)
- `netting/NettingEngineScenarioTest` loads the JSON and runs S01–S11 through `NettingEngine.plan()`.
- `netting/NbboValidatorTest` covers edge cases: equal to mid, crossed market, zero spread.
- `netting/FeatureBuilderParityTest` checks Java against the JS golden vectors.
- Run with `mvn -q -Dtest='Netting*,Nbbo*,FeatureBuilder*' test`.

### 9.3 `scripts/netting_e2e.js` — end-to-end against the running demo

Requires Node 18+ (built-in `fetch`) and a backend on `localhost:8080`.

```
node scripts/netting_e2e.js --symbol BTCUSD      # users: NETTING_USER_A / NETTING_USER_B / NETTING_PASS env vars to override
```

Flow:
1. `GET /api/auth/csrf` to get the `XSRF-TOKEN` cookie. `POST /api/auth/login` with form fields `username` and `password`. Keep the session cookie.
2. `POST /api/admin/netting/sim/clear`, which gives an empty book.
3. **S01 live:** user BUY 0.01 MARKET → expect `routing = EXTERNAL`.
4. **S02 live:** `sim/inject {side: SELL, qty: 0.01, offsetBps: -1}`, then user BUY 0.01 MARKET → expect `INTERNAL` and a new `internal_match` at mid.
5. **S03 live:** inject SELL at `+1bp`, then user BUY → expect `EXTERNAL`.
6. **S04 live:** inject SELL 0.004, then user BUY 0.01 → expect `SPLIT` 0.004 / 0.006.
7. **S05 live:** inject BUY at `+1bp`, then user SELL 0.01 → expect `INTERNAL`.
8. **Soak:** enable the simulator, place 30 random user orders over 60 s, then `GET /api/admin/netting/invariants` → all of I1–I7 must be `true`.
9. Close all positions opened by the test and print a report:

```
NETTING E2E — BTCUSD — 2026-09-27 15:02
S01 empty book            EXTERNAL            PASS
S02 sim sell -1bp         INTERNAL @ 65012.5  PASS
S03 sim sell +1bp         EXTERNAL            PASS
S04 partial               SPLIT 0.004/0.006   PASS
S05 sell side             INTERNAL            PASS
Soak 30 orders            internal 63% | exposure 0 | invariants 7/7   PASS
RESULT: 6/6 PASS
```

It exits with code 0 when everything passes and 1 otherwise.

### 9.4 `run-netting-tests.bat` — one double-click

```bat
@echo off
title Netting Model Tests
cd /d "%~dp0"
echo [1/3] Model + feature check...
node buysellmodel\tests\model_check.js || goto :fail
echo [2/3] Engine unit tests...
pushd backend && call mvnw.cmd -q -Dtest=Netting*,Nbbo*,FeatureBuilder* test || (popd & goto :fail)
popd
echo [3/3] End-to-end (backend must be running)...
netstat -aon | findstr ":8080" | findstr "LISTENING" >nul || (echo Backend not running - skipped E2E & goto :ok)
node scripts\netting_e2e.js || goto :fail
:ok
echo ALL NETTING TESTS PASSED & pause & exit /b 0
:fail
echo NETTING TESTS FAILED & pause & exit /b 1
```

---

## 9.5 Two-Client Live Visualizer — `scripts/netting_visual_demo.js`

**Why:** there are no live clients. This script **plays two real clients** (Trader A and Trader B) against the running backend, with the computer liquidity as a third party. It walks through **every situation the model can hit** while a browser page shows each step visually: who sent what, the order book, the NBBO check, the match or the external route, and both accounts updating.

### 9.5.1 How to run

```
run-netting-visual.bat                         ← double-click (starts the page and opens the browser)
node scripts/netting_visual_demo.js            ← same, from a terminal
node scripts/netting_visual_demo.js --offline  ← no backend needed: uses scripts/lib/netting_engine.js (JS port of NettingEngine)
node scripts/netting_visual_demo.js --scenario V04 --speed 0.5
```

- The page opens at `http://localhost:4010`.
- It uses zero npm dependencies: Node `http` and Server-Sent Events serve a single inline HTML page, so it works offline.
- `--offline` is for presenting the concept without the backend. The **online** mode is the real test, because it drives the actual Java engine.

### 9.5.2 The two users
- **Trader A:** `netting.a@broker.local / Netting123!`. The script creates it on first run and skips that step if the user exists.
- **Trader B:** `netting.b@broker.local / Netting123!`, created the same way through `POST /api/auth/register {email, password, displayName}`.
- Each user has its **own cookie jar and CSRF token**, so the backend sees two independent sessions, exactly like two browsers.
- **Computer:** the simulated liquidity accounts (section 3), driven through `/api/admin/netting/sim/inject`.

### 9.5.3 Backend support needed (localhost-only, demo-only)

All of these sit behind `broker.netting.test-endpoints.enabled: true` (default `false` outside the demo profile):

| Endpoint | Purpose |
|----------|---------|
| `POST /api/admin/netting/test/freeze-quote {symbol, mid}` | Freeze the price so "−1bp / +1bp" scenarios are exact, not at the mercy of live BTC moves |
| `POST /api/admin/netting/test/unfreeze-quote {symbol}` | Back to live prices |
| `POST /api/admin/netting/test/crossed-quote {symbol}` | Force `bid ≥ ask` for the CROSSED_MARKET scenario |
| `POST /api/admin/netting/test/nn-offline {on}` | Make `NNPredictorClient` behave as if the NN server is down |
| `GET  /api/admin/netting/book?symbol=` | Resting orders on both sides (owner label A/B/Computer, qty, limit, time), plus the current bid/mid/ask |
| `GET  /api/admin/netting/matches?since=` | New `internal_match` rows since the last poll |
| `GET  /api/admin/netting/events?since=` | Engine decision log: `{orderId, step: NBBO_OK/NBBO_REJECT/SELF_MATCH_SKIP/SIM_SIM_SKIP/FILL/REMAINDER_EXTERNAL, detail}`. Written by `NettingService` into an in-memory ring buffer (last 500). |

The engine's **reasons** (why a pair was rejected) come from the backend itself. The visualizer shows what the Java code decided, not a re-computation.

### 9.5.4 The scenario playlist (every situation of the model)

| ID | Story shown on screen | Actors | Expected outcome |
|----|-----------------------|--------|------------------|
| V01 | Empty book: A buys | A | EXTERNAL → arrow to "Market / MT5" |
| V02 | B rests SELL below mid, A buys at market | A ↔ B | INTERNAL @ mid, both get price improvement |
| V03 | B rests SELL **above** mid, A buys | A, B | NBBO REJECT (seller demands too much) → A EXTERNAL, B's order keeps resting |
| V04 | B rests SELL 4, A buys 10 | A ↔ B | SPLIT: 4 internal + 6 external |
| V05 | A rests BUY above mid, B **sells** at market | B ↔ A | INTERNAL (the sell side works) |
| V06 | A rests SELL, then A buys at market | A | SELF-MATCH SKIPPED → EXTERNAL |
| V07 | B SELL @ −2bp (older), Computer SELL @ −2bp (newer), B SELL @ −1bp; A buys 5 | A, B, Computer | Price-time priority: best price first, then oldest; the fill order is animated |
| V08 | A and B both send market BUY into one resting SELL 10 at the same moment | A, B, Computer | Exactly 10 filled in total, no double fill (concurrency / locks) |
| V09 | A rests BUY limit 5bp below mid; B sells at market → no match (NBBO: A's limit < mid); then the price drops (freeze-quote mid −10bp) and B sells again | A ↔ B | First attempt: NBBO_REJECT and B goes EXTERNAL. After the drop A's limit ≥ mid, so the second attempt is INTERNAL |
| V10 | A rests BUY 10, B sells 4, then A cancels | A, B | 4 filled; refund only for the 6 unfilled |
| V11 | Only Computer liquidity: Computer SELL −1bp, A buys | A ↔ Computer | INTERNAL client vs computer |
| V12 | Computer SELL resting, Computer BUY at market | Computer | SIM-SIM SKIPPED → never matched |
| V13 | NN server offline, then V02 again | A ↔ B | Still INTERNAL: the decision does not depend on the NN; the NN field shows "offline" |
| V14 | Crossed market (bid ≥ ask) | A | CROSSED_MARKET → no internal match |
| V15 | Close everything (A and B close their positions) | A, B | Each client's P/L shown; **house net exposure returns to 0** |
| V16 | Soak: 60 s, A and B send random orders, Computer quotes live | A, B, Computer | Live counters; invariants I1–I7 all green at the end |

Each scenario:
1. Starts from a clean state (`sim/clear`, cancel pending orders, freeze the quote).
2. Runs its steps with a pause (`--speed`) so the viewer can follow.
3. Asserts the expected outcome from the backend's real data (`/orders`, `/positions`, `/matches`, `/events`).
4. Marks itself **PASS / FAIL** on screen.

### 9.5.5 What the page shows

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ NETTING LIVE — BTCUSD   bid 64,990.3 | mid 65,000.0 | ask 65,009.8   [FROZEN]      │
│ Scenario V04 — "Partial match"   ▶ Play all  ⏸ Pause  ⏭ Step  speed [1x]  V01…V16 │
├──────────────────────┬──────────────────────────────────┬─────────────────────────┤
│  TRADER A            │           ORDER BOOK             │  TRADER B               │
│  balance 99,997.68   │  BUY side        │  SELL side    │  balance 99,979.39      │
│  orders:             │                  │  B  4 @ −1bp  │  orders:                │
│   → BUY 10 MKT  ●    │                  │  C  2 @ +2bp  │   SELL 4 LMT (resting)  │
│  positions:          │                  │               │  positions:             │
│   LONG 4 @ 65,000    │   ─── NBBO ✔ ─── │               │   SHORT 4 @ 65,000      │
│   LONG 6 @ 65,009.8  │                  │               │                         │
├──────────────────────┴──────────────────────────────────┴─────────────────────────┤
│  A ══(4 @ mid, INTERNAL)══► B          A ──(6 @ ask, EXTERNAL)──► 🌐 Market/MT5   │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Broker: commission +0.13  fee saved +3.00   Client improvement +39.00             │
│ House net exposure: BTCUSD 0 ✔   Internal rate (qty) 40%                          │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Engine log                                                                        │
│ 15:02:11 #812 BUY 10 A    NBBO_OK vs #809 (B SELL 4 @ −1bp)                       │
│ 15:02:11 #812             FILL 4 @ 65,000.0  (match #57)                          │
│ 15:02:11 #812             NBBO_REJECT vs #810 (C SELL 2 @ +2bp: SELL_LIMIT_ABOVE_MID) │
│ 15:02:11 #812             REMAINDER_EXTERNAL 6                                    │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Results  V01 ✔  V02 ✔  V03 ✔  V04 ✔  V05 …                                        │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Visual rules:
- **Green double arrow:** internal match between two parties, labelled with qty @ mid.
- **Grey arrow to the globe:** quantity routed external.
- **Red X:** a pair the engine rejected, with the reason (NBBO, self-match, sim-sim, crossed market).
- **Resting orders** blink when they are touched and fade out when fully filled. PARTIALLY_FILLED ones show a progress bar.
- **Computer orders** are marked `C` in a distinct colour. They never appear in the A or B panels.
- **Every number** comes from the backend responses. Nothing is computed only in the page, except the animation.
- The page carries both Hebrew and English step captions (a toggle at the top), so it can be used in a presentation.

### 9.5.6 Output
- The final summary shows 16 rows with PASS/FAIL and the invariants I1–I7.
- The script saves a report to `reports/netting-visual-YYYYMMDD-HHmm.html`, a static copy of the final screen plus the full engine log, and `...json` with the raw data.
- Exit code 0 means all PASS, which lets it be added to `run-netting-tests.bat` later as step 4 with `--headless` (no browser, same assertions).

### 9.5.7 Files

| File | Content |
|------|---------|
| `scripts/netting_visual_demo.js` | Runner: two sessions, scenario playlist, assertions, SSE server |
| `scripts/lib/api_client.js` | Login, CSRF, cookie jar per user, typed calls for broker and admin endpoints |
| `scripts/lib/scenarios.js` | V01–V16 as data plus step functions, shared with `netting_e2e.js` |
| `scripts/lib/netting_engine.js` | JS port of `NettingEngine` for `--offline` (same rules and reason codes) |
| `scripts/visual/index.html` | Single-file page: inline CSS/JS/SVG, no external libraries |
| `run-netting-visual.bat` | Checks port 8080; starts the script; opens `http://localhost:4010` |

---

## 10. Implementation order and acceptance

| Step | Work | Done when |
|------|------|-----------|
| 1 | `V32__netting.sql`, `InternalMatch` entity, `BrokerOrder` fields, sim accounts (R5, R6) | App starts on both H2 and Postgres (`validate` passes); existing tests are green |
| 2 | `Quote`, `NbboValidator`, `NettingEngine`, `MatchPlan` + scenario JSON + JUnit | S01–S11 pass in JUnit |
| 3 | `FeatureBuilder` + `model_check.js` + parity test; delete both old feature blocks | I7 gate passes (0 % INTERNAL on an empty book); Java and JS vectors are equal |
| 4 | `FillBooking` extraction (a refactor with no behaviour change) | All existing tests are green; an unchanged manual trade gives the same balance as before |
| 5 | `NettingService` (two-phase, global lock order, retry, netting window) + `ExternalRouter`; wire into `placeOrder` and `tryExecute`; honour explicit LIMIT; new tick query; NN and MT5 moved after commit (R1–R3) | S12–S14 pass; V08 (simultaneous orders) gives exactly one fill per unit; no NN or MT5 call inside a transaction |
| 6 | `HouseLiquiditySimulator` + `NettingAdminController` (`inject`, `clear`, `summary`, `invariants`) | The simulator quotes and refreshes; the kill switch works |
| 7 | `netting_e2e.js` + `run-netting-tests.bat` | `run-netting-tests.bat` shows **ALL PASSED** |
| 7b | Test endpoints (9.5.3) + `netting_visual_demo.js` + `run-netting-visual.bat` | All 16 scenarios V01–V16 show PASS on the page, both online and `--offline` |
| 8 | Admin panel cards (section 7); LEGACY excluded | House net exposure card shows 0 for every symbol; no "−Σ client P/L" anywhere |
| 9 | (Later) NN retraining from logged outcomes | Shadow accuracy ≥ 95 % over ≥ 1,000 orders |

**Out of scope for the demo:** real exchange settlement, regulatory best-execution reports, and multi-currency accounts.
