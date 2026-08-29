# Edge Cases — Price Mismatch Between Buyer and Seller

## Background: Current Logic

The `validateAndCross` function in `simulation.js` approves an internal cross only if:

1. The buyer's limit price ≥ mid
2. The seller's limit price ≤ mid

**Execution price** is always = mid.

```
Market: bid=99.95  ask=100.05  mid=100.00

✅ Buyer limit $101   + Seller limit $99     → Cross at $100.00
❌ Buyer limit $101   + Seller limit $100.02 → SELL_LIMIT_ABOVE_MID
❌ Buyer limit $99.98 + Seller limit $99     → BUY_LIMIT_BELOW_MID
```

---

## Edge Cases the Model Does Not Currently Handle

---

### Case 1 — Both Limits Above Mid (the scenario you described)

**Description:** Client A buys 10 shares with limit $101.00, Client B sells 10 shares with limit $100.02.
Both are above mid ($100.00), but the buyer is **willing to pay more** than the seller demands — they can close the deal.

**Current behavior:**
```
sellLimit ($100.02) > mid ($100.00) → SELL_LIMIT_ABOVE_MID → B routed to exchange
```

**The problem:** B would get $100.02 on the exchange at best, but could have received that same price *internally* and saved the exchange fee.

**The fix:** Check whether `buyLimit ≥ sellLimit` (crossing is possible), then set the internal execution price to the point in `[sellLimit, buyLimit]` closest to mid:

```
executionPrice = max(sellLimit, min(buyLimit, mid))
               = max(100.02, min(101.00, 100.00))
               = max(100.02, 100.00)
               = 100.02  ✅ (within NBBO: bid=99.95, ask=100.05)
```

---

### Case 2 — Both Limits Below Mid

**Description:** Buyer limit = $99.98, Seller limit = $99.90. Both are below mid, yet they can still close with each other.

**Current behavior:**
```
buyLimit ($99.98) < mid ($100.00) → BUY_LIMIT_BELOW_MID → A routed to exchange
```

**The fix:**
```
executionPrice = max(99.90, min(99.98, 100.00))
               = max(99.90, 99.98)
               = 99.98  ✅ (within NBBO)
```

---

### Case 3 — Market Order vs. Limit Above Mid

**Description:** Buyer sends a **Market Order** (no limit), Seller sets limit $100.02.

**Current behavior:**  
`buyLimit = Infinity`, so `Infinity ≥ mid` ✓  
`sellLimit ($100.02) > mid` → SELL_LIMIT_ABOVE_MID → B routed to exchange.

**The problem:** The buyer is willing to pay the ask ($100.05) or more — so $100.02 is *cheaper for them*, and an internal cross is perfectly valid.

**The fix:**
```
executionPrice = max(100.02, min(Infinity, 100.00))
               = max(100.02, 100.00)
               = 100.02  ✅
```

---

### Case 4 — Large Gap Between Limits (who captures the difference?)

**Description:** Buyer limit = $102, Seller limit = $98, mid = $100.

Currently: cross executes at $100.00. The buyer "saved" $2 versus their willingness to pay. The seller received $2 more than they demanded.

**Question:** Can or should the broker capture part of that gap?

**Options:**

| Method | Execution Price | Notes |
|--------|----------------|-------|
| Mid (current) | $100.00 | Equal price improvement for both sides |
| Internal VWAP | Weighted average | More complex to compute |
| Split Spread | $100.00 | Broker takes half the gap above/below mid |
| Midpoint + Fee | $100.00 + $0.01 | Broker charges an explicit fee on top |

**Recommendation:** Keep mid for transparency and regulatory compliance (best execution). If the broker wants to monetize the gap, do it as a disclosed fee.

---

### Case 5 — Quantity Mismatch Combined with Price Mismatch

**Description:**
- Buyer: 20 shares @ limit $101
- Seller1: 15 shares @ limit $100.02
- Seller2: 10 shares @ limit $99.90

**Current behavior:**
1. Seller2 (limit $99.90 ≤ mid) → Cross 15 shares (min(20,15)) @ mid = $100.00. Buyer: 5 remaining.
2. Seller1 (limit $100.02 > mid) → SELL_LIMIT_ABOVE_MID → Seller1 routed to exchange.
3. Buyer: 5 remaining shares → external trade.

**With the fixed logic:**
1. Cross 15 @ $100.00 (mid, since $99.90 ≤ mid ≤ $101).
2. Cross 5 @ max($100.02, min($101, $100.00)) = $100.02 ✅ (internal, not exchange).
3. Seller1: 5 shares remaining → external trade.

---

### Case 6 — Two Orders That Cannot Cross at All

**Description:** Buyer limit = $99.50, Seller limit = $100.50 — no crossing possible (buyLimit < sellLimit).

**Current behavior:**
- buyLimit ($99.50) < mid ($100.00) → BUY_LIMIT_BELOW_MID → buyer to exchange.
- Seller remains in the book — not handled.

**What should happen:** Both should be routed to the exchange since there is no price overlap.

**The fix:** Check `buyLimit ≥ sellLimit` first. If not → route both:
```
reason: "PRICES_DONT_CROSS"
→ executeExternalTrade(buy)
→ executeExternalTrade(sell)
```

---

### Case 7 — Crossed Market

**Description:** bid ≥ ask — an invalid market state (rare, but possible in test data).

**Current behavior:** Handled correctly → `CROSSED_MARKET` → rejected.

**Recommendation:** Add a log warning and a UI alert when this occurs.

---

### Case 8 — Market Price Drift Between Order Placement and Matching

**Description:** An order was placed when mid = $100.00, but by the time matching runs (after the 10-second timeout) mid has moved to $100.50.

**Current behavior:** The model uses `state.market.bid/ask` at the moment `matchOrdersInternal()` is called — so mid is always **current**. This is correct.

**However:** If the buyer's limit = $100.20 and mid has risen to $100.50, then `buyLimit ($100.20) < mid ($100.50)` → BUY_LIMIT_BELOW_MID → routed to exchange.

**Recommendation:** This is correct behavior — a limit order that can no longer be executed at current market conditions should go to the exchange.

---

## Full Fix — Revised validateAndCross

```javascript
function validateAndCross(buyOrder, sellOrder, marketBid, marketAsk) {

    // Condition 0: Valid market
    if (marketBid >= marketAsk) {
        return { approved: false, reason: "CROSSED_MARKET" };
    }

    const mid       = (marketBid + marketAsk) / 2;
    const buyLimit  = buyOrder.limitPrice;   // Infinity for market orders
    const sellLimit = sellOrder.limitPrice;  // 0 for market orders

    // Condition 1: Can these orders cross at all?
    // If buyer's max price < seller's min price — no deal possible
    if (buyLimit < sellLimit) {
        return { approved: false, reason: "PRICES_DONT_CROSS" };
    }

    // Condition 2: Determine fair execution price
    // Prefer mid, but clamp to [sellLimit, buyLimit] range
    const candidatePrice = Math.max(sellLimit, Math.min(buyLimit, mid));

    // Condition 3: Must satisfy NBBO best-execution (stay within bid–ask)
    if (candidatePrice > marketAsk || candidatePrice < marketBid) {
        return { approved: false, reason: "OUTSIDE_NBBO" };
    }

    const executionPrice = candidatePrice;
    const quantity       = Math.min(buyOrder.quantity, sellOrder.quantity);

    return {
        approved:       true,
        executionPrice: +executionPrice.toFixed(4),
        quantity,
        buyerSaving:    +(marketAsk - executionPrice).toFixed(4),
        sellerGain:     +(executionPrice - marketBid).toFixed(4),
        brokerSaving:   `Exchange fee on ${quantity} shares`,
    };
}
```

---

## matchOrdersInternal — Required Updates

Current code:

```javascript
} else {
    if (check.reason === "BUY_LIMIT_BELOW_MID") {
        externals = externals.concat(executeExternalTrade(buy));
    } else if (check.reason === "SELL_LIMIT_ABOVE_MID") {
        externals = externals.concat(executeExternalTrade(sell));
    }
}
```

**Needs to become:**

```javascript
} else {
    if (check.reason === "PRICES_DONT_CROSS") {
        // Neither side can close with the other — both go external
        externals = externals.concat(executeExternalTrade(buy));
        externals = externals.concat(executeExternalTrade(sell));
    } else if (check.reason === "OUTSIDE_NBBO") {
        // No valid internal best-execution price — both go external
        externals = externals.concat(executeExternalTrade(buy));
        externals = externals.concat(executeExternalTrade(sell));
    }
    // CROSSED_MARKET: send nothing — wait for a valid market
}
```

---

## Summary Table

| Case | Buyer Limit | Seller Limit | Mid | Current | After Fix |
|------|------------|--------------|-----|---------|-----------|
| Normal ✅ | $101 | $99 | $100 | Cross @ $100 | Cross @ $100 |
| Both above mid ❌ | $101 | $100.02 | $100 | Seller to exchange | Cross @ $100.02 |
| Both below mid ❌ | $99.98 | $99.90 | $100 | Buyer to exchange | Cross @ $99.98 |
| Market + limit above mid ❌ | ∞ | $100.02 | $100 | Seller to exchange | Cross @ $100.02 |
| No price overlap ⚠️ | $99.50 | $100.50 | $100 | Buyer to exchange, Seller stuck | Both to exchange |
| Crossed market ✅ | any | any | — | CROSSED_MARKET | Same |
| Price outside NBBO ❌ | $103 | $102 | $100 | Not filtered | OUTSIDE_NBBO |

---

## Implementation Priorities

1. **High** — Fix `validateAndCross` as shown above. It's 15 lines and immediately improves the internal match rate.
2. **High** — Update `matchOrdersInternal` to handle `PRICES_DONT_CROSS` and `OUTSIDE_NBBO`.
3. **Medium** — Show `executionPrice` vs. `mid` in the UI when they differ, so the user understands why they got $100.02 instead of $100.00.
4. **Low** — Consider adding an explicit fee when a cross executes away from mid, to demonstrate the broker revenue model.
