# Netting Broker Simulation — Model Documentation

## Overview

This project is a **netting broker simulator** with a built-in **neural network advisor**. The model demonstrates how a broker can cross buy and sell orders **internally** before routing the remaining balance to the external market — saving exchange fees and providing clients with a better price.

The project is built in **pure JavaScript** (no external dependencies) and runs in both the browser and Node.js.

---

## The Economic Concept

When a broker receives buy and sell orders for the same asset from different clients, instead of routing each order to the exchange separately, it checks whether the orders can be **internally crossed**:

- **The buyer** receives a mid price — less than they would have paid on the exchange.
- **The seller** receives a mid price — more than they would have received on the exchange.
- **The broker** saves exchange fees for every internally crossed order.

Only the **net remainder** left after internal matching is sent to the exchange as a single trade.

### Numerical Example

| Data | Value |
|------|-------|
| Exchange Bid | 99.95 |
| Exchange Ask | 100.05 |
| Mid Price | 100.00 |

Client A buys 20 shares, Client B sells 10 shares:
1. 10 shares are crossed **internally** at 100.00 — A saves $0.50, B gains $0.50.
2. The remaining 10 shares are sent to the exchange at 100.05.

---

## System Architecture

```
buysellmodel/
├── index.html              ← Main UI (simulator + NN advisor)
├── style.css               ← UI styling
├── simulation.js           ← Internal matching engine (broker logic)
├── nn_core.js              ← Neural network engine (Browser + Node)
├── train.js                ← Training script (run with: node train.js)
├── results.html            ← Training results visualization
├── training_results.json   ← Weights + training history (auto-generated)
├── web_server.js           ← Lightweight HTTP server for local use
├── nn_server.js            ← Server with neural network API support
├── run.js                  ← Entry point
├── run_ai.bat / run_ai.ps1 ← Windows run scripts
└── deploy_app.py           ← Deployment tool
```

---

## The Three Simulator Phases

### Phase 1 — Accumulation
Every incoming order is recorded in the internal order book, sorted by asset and side (buy/sell).

### Phase 2 — Internal Matching
A new order is checked against the opposite side of the book. If prices cross — an internal trade is created at the **mid price**. Nothing goes through the exchange.

### Phase 3 — External Trade on the Remainder
If a quantity remains after internal matching, only that quantity is sent to the exchange as a single trade.

---

## NBBO Validation Before Every Internal Match

### What is NBBO?

NBBO = **National Best Bid and Offer** — the best prices available in the market at any given moment:

- **Bid** = the highest price anyone is willing to buy at on the exchange
- **Ask** = the lowest price anyone is willing to sell at on the exchange
- **Mid** = the average of the two

```
Bid: 99.00  ←——— Mid: 100.00 ———→  Ask: 101.00
    Buyers                              Sellers
```

### The Problem the Model Has Without Validation

The model assumes the midpoint price always benefits both sides — but this is not always true. A buyer who set a low limit price, or a seller who set a high limit price, may end up with a worse price than the exchange would have given them.

**Example of a problematic cross:**

| Client | Side | Limit Price | Market Price |
|--------|------|-------------|-------------|
| Danny | Buyer | 99.50 | Ask = 101.00 |
| Rachel | Seller | 100.50 | Bid = 99.00 |

Without validation, the model sees a buyer + seller and crosses them at Mid = 100.00 —
but **Danny paid more** than he agreed to, and **Rachel received less** than she demanded.

### The Three Validation Conditions

```
Condition 1: buyLimit  >= Mid        (buyer is willing to pay at least the mid)
Condition 2: sellLimit <= Mid        (seller is willing to accept at most the mid)
Condition 3: bid < ask               (market is not crossed/broken)
```

### Example 1 — A Cross That Passes the Check ✅

```
Market:   Bid = 99.00  |  Mid = 100.00  |  Ask = 101.00

Danny buys:   Limit = 100.80   ✅ (100.80 >= 100.00 — willing to pay)
Rachel sells: Limit = 99.20    ✅ (99.20  <= 100.00 — willing to accept)

→ Cross approved at 100.00
→ Danny saves 1.00 vs. Ask (101.00)
→ Rachel gains 1.00 vs. Bid (99.00)
```

### Example 2 — A Cross That Fails the Check ❌

```
Market:   Bid = 99.00  |  Mid = 100.00  |  Ask = 101.00

Danny buys:   Limit = 99.50    ❌ (99.50 < 100.00 — not willing to pay the mid!)
Rachel sells: Limit = 100.50   ❌ (100.50 > 100.00 — not willing to accept the mid!)

→ Cross rejected
→ Orders are sent to the exchange separately
```

### What Happens to the Price Differences?

When a cross is approved, a gap exists between each client's limit price and the actual execution price (Mid).
**These differences stay with the clients** — this is their Price Improvement:

```
Danny (buyer):   agreed to pay 100.80  →  paid only 100.00  →  saved 0.80 per share
Rachel (seller): agreed to accept 99.20 →  received 100.00  →  gained 0.80 per share
```

**The broker profits from something entirely different** — the exchange fee it saved by not routing orders externally. That fee would have been paid to the exchange; now it stays with the broker:

```
Broker profit = exchange fee × number of internally crossed orders
               (NOT a share of the clients' price difference)
```

### Full Code with Explanation

```javascript
function validateAndCross(buyOrder, sellOrder, marketBid, marketAsk) {

    // ---- Condition 0: Verify the market is valid ----
    if (marketBid >= marketAsk) {
        console.log("Crossed market — cannot calculate a valid Mid");
        return { approved: false, reason: "CROSSED_MARKET" };
    }

    const mid = (marketBid + marketAsk) / 2;

    // ---- Condition 1: Check the buyer ----
    if (buyOrder.limitPrice < mid) {
        console.log(`Buyer wants to pay ${buyOrder.limitPrice} but Mid is ${mid} — rejected`);
        return { approved: false, reason: "BUY_LIMIT_BELOW_MID" };
    }

    // ---- Condition 2: Check the seller ----
    if (sellOrder.limitPrice > mid) {
        console.log(`Seller wants to receive ${sellOrder.limitPrice} but Mid is ${mid} — rejected`);
        return { approved: false, reason: "SELL_LIMIT_ABOVE_MID" };
    }

    // ---- All checks passed — cross approved ----
    const quantity = Math.min(buyOrder.quantity, sellOrder.quantity);

    return {
        approved:       true,
        executionPrice: mid,
        quantity:       quantity,
        buyerSaving:    marketAsk - mid,  // stays with the buyer as Price Improvement
        sellerGain:     mid - marketBid,  // stays with the seller as Price Improvement
        brokerSaving:   `Exchange fee on ${quantity} shares` // broker profit — NOT from the price gap!
    };
}
```

### Integration in simulation.js

```javascript
// Before:
internalMatch(buyOrder, sellOrder);

// After:
const check = validateAndCross(buyOrder, sellOrder, currentBid, currentAsk);
if (check.approved) {
    internalMatch(buyOrder, sellOrder, check.executionPrice);
} else {
    sendToExchange(buyOrder);   // route to exchange instead
    sendToExchange(sellOrder);
}
```

---

## The Neural Network Advisor

### What Does It Do?
The network predicts in real time for every incoming order:

| Output | Meaning |
|--------|---------|
| `matchProb` | Probability of an internal match (0–1) |
| `expectedSavings` | Expected savings per share vs. external market |
| `routeRecommendation` | 0 = send to exchange, 1 = cross internally |

### Inputs (8 Neurons)

| # | Feature | Description |
|---|---------|-------------|
| 1 | `buyQtyNorm` | Normalized buy order size (÷100) |
| 2 | `sellQtyNorm` | Normalized available sell order size |
| 3 | `spreadNorm` | Bid-ask spread |
| 4 | `imbalance` | (buy−sell)/(buy+sell) |
| 5 | `midPriceNorm` | Normalized mid price (÷200) |
| 6 | `bookDepthBuy` | Buy book depth (÷10) |
| 7 | `bookDepthSell` | Sell book depth (÷10) |
| 8 | `historicalMatchRate` | Historical match rate (0–1) |

### Network Architecture

```
Input Layer    Hidden Layer 1   Hidden Layer 2   Output Layer
(8 neurons)  → (16 neurons)   → (8 neurons)    → (3 neurons)
               [ReLU]           [ReLU]            [Sigmoid×3]
```

### Training Details

| Parameter | Value |
|-----------|-------|
| Synthetic samples | 50,000 scenarios |
| Split | 80% training / 20% validation |
| Epochs | 200 |
| Batch size | 32 |
| Learning rate | 0.05 (with decay) |
| Optimizer | Mini-batch SGD with momentum |
| Loss function | Combined Cross-entropy + MSE |
| Weight initialization | Xavier initialization |
| Expected accuracy | ~88–93% |

---

## Running the Project

### Step 1 — Train the Network
```bash
node train.js
```
> Wait 2–5 minutes. Output is saved to `training_results.json`

### Step 2 — View Training Results
```bash
npx http-server . -p 8080
# Open: http://localhost:8080/results.html
```

### Step 3 — Use the Full Simulator
```bash
# Open: http://localhost:8080/index.html
```
The "Neural Network Advisor" panel loads automatically and advises on every order.

### Quick Run on Windows
```
run_ai.bat
```

---

## The Results Page (`results.html`)

Displays visualizations of the training process:
- **Loss curve** — training vs. validation loss over epochs
- **Accuracy curve** — accuracy over epochs
- **Confusion Matrix** — predictions vs. true labels
- **Examples table** — 20 random predictions with inputs and outputs
- **Architecture diagram** — animated SVG of network layers
- **Performance metrics** — accuracy, precision, recall, F1

---

## Model Advantages

**For clients:**
- Better execution price (mid instead of full bid/ask)
- Faster execution (no waiting in the exchange queue)
- Lower commissions

**For the broker:**
- Savings on exchange fees for every internal trade
- Better control over order flow
- Steady revenue stream from the bid-ask spread

---

## Key Challenges

**Fair pricing and regulation** — Most regulated markets require "best execution": the internal price must be at least as good as what the client would have received on the public market.

**Market risk between phases** — Between the moment of internal matching and sending to the exchange, the market price can move. The broker bears this risk.

**Lack of matching flow** — A matching counterparty order does not always exist. In that case, the order goes directly to the exchange.

**Timing and fairness** — When orders arrive nearly simultaneously, a clear ordering rule is required — typically **price-time priority**.
