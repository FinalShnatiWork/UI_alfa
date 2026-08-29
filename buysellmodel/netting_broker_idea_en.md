# Netting Broker Model — The Core Idea

## 1. The Problem

A broker receives buy and sell orders on the same asset from different clients,
often around the same time. If the broker routes each order separately to the
external market, it pays an exchange fee on every order and absorbs the full
spread for each client — even when client orders would have cancelled each
other out.

## 2. The Core Idea

Instead of sending everything out, the broker **crosses opposing orders
internally** and sends only the **net difference** to the external market.

> Example: Client A wants to buy 20 shares of a given asset, and Client B
> wants to sell 10 shares of the same asset. The broker crosses 10 shares
> internally between them, and only the remaining 10 shares that A still
> needs are sent to the market.

In other words: whenever the broker can, it captures both sides of a trade
in-house, and exposes itself to the market only for the portion that has no
internal match.

## 3. The Three Stages

1. **Accumulation** — Every incoming order enters the broker's internal order
   book, separated by asset and by side (buy / sell).
2. **Internal matching** — A new order is checked against the opposite side of
   the book. If the prices cross, an internal trade is created: the buyer
   receives shares from the seller, and the seller receives cash from the
   buyer. Nothing goes through the exchange.
3. **External trade on the net difference** — If any quantity remains after
   matching, only that remainder is sent to the external market as a single
   trade.

## 4. Determining the Internal Price

The central question is: at what price does the internal trade between two
clients execute?

The standard and fair approach is to use the **mid price** — the average
between the best bid and the best ask in the external market at that moment.
This means:

- The buyer pays less than they would on the exchange (where they would pay
  the ask).
- The seller receives more than they would on the exchange (where they would
  receive the bid).
- The broker saves the exchange fee on the portion crossed internally.

Everyone wins relative to the alternative.

## 5. Flow of Cash and Shares

In every internal trade, the broker acts as a trusted intermediary: it holds
the buyer's cash and the seller's shares in segregated escrow accounts, and
performs the exchange at the moment of the match.

- The full purchase amount is debited from the buyer and credited to the
  seller.
- The shares are transferred from the seller to the buyer.
- For the portion that goes to the external market, the broker pays the
  exchange price and delivers the shares to the client who needs them.

The critical point: the broker **never mixes** one client's money with
another's without a defined trade. Every movement is recorded as a transaction
with two parties and a price.

## 6. Why It Pays Off

### For Clients

- Better price — execution at mid instead of paying the full spread.
- Faster execution — no waiting in the exchange queue.
- Lower fees — the broker's savings can be partially passed through.

### For the Broker

- Exchange / liquidity-provider fees saved on every internally-matched order.
- Better control over order flow and the client base.
- A consistent profit stream from the spread (if it executes at NBBO rather
  than at mid).

## 7. Key Challenges

### Fair Pricing and Regulation

Most regulated markets enforce **best execution**: the broker must ensure that
the internal price is no worse than what the client would have received on the
public market at that moment. Internal crossing at a "made-up" price that
disadvantages the client is not allowed.

### Market Risk Between Stages

Between the moment the broker completes the internal match and the moment it
sends the remaining difference to the exchange, the market price can move. If
it moves against the broker, the broker absorbs the loss. That's why the two
stages should happen almost simultaneously, or the broker should hedge its
exposure.

### Lack of Matching Flow

There isn't always an opposing order at the right moment. If a client wants to
sell and there are no internal buyers, the order is simply routed to the
external market — exactly like in a standard model. Netting is an optimization
layer, not a substitute for the market.

### Timing and Fairness

When two orders arrive almost simultaneously, the broker must apply a clear
ordering rule — typically **price-time priority**: the better price wins, and
among equal prices, the earlier order wins. Without this, client trust breaks
down.

## 8. Short Numerical Example

**Market data:** exchange bid 99.95, exchange ask 100.05, mid = 100.00.

**The orders:**
- Client A: buy 20 shares.
- Client B: sell 10 shares.

**What happens:**
1. The broker crosses 10 shares internally at 100.00:
   - A pays $1,000 and receives 10 shares.
   - B receives $1,000 and delivers 10 shares.
2. The broker buys an additional 10 shares for A on the exchange at 100.05:
   - A pays another $1,000.50 and receives another 10 shares.

**The result:**
- A received all 20 shares. On 10 of them, A paid 100.00 instead of 100.05 —
  a saving of $0.50 versus full execution on the exchange.
- B sold all 10 shares at 100.00 instead of 99.95 — a gain of $0.50.
- The broker executed only one external trade (on 10 shares) instead of two.

## 9. Summary

The netting model is a simple idea at its core: **before going to the market,
check whether the trade can be closed in-house.** Any opposing order already
in the internal book is an opportunity to save a fee and deliver a better
price to both sides. Only what cannot be crossed internally — the net
difference — is sent to the exchange.

That is what makes brokers with large, balanced order flow particularly
profitable: the more clients and the more two-sided flow, the higher the
internal crossing rate, and the less the external market sees. The exchange
only sees the tip of the iceberg.
