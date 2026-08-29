/**
 * Netting Broker Simulation Engine
 * ---------------------------------
 * Implements the internal order matching logic described in the MD document:
 *   1. Accumulation — orders enter the internal book
 *   2. Internal Matching — opposing orders cross at mid price
 *   3. External Trade — net remainder goes to exchange
 */

// =====================
//  Market & State
// =====================

const EXCHANGE_FEE_PER_TRADE = 1.50;  // flat fee per external trade

const state = {
    market: {
        bid: 99.95,
        ask: 100.05,
        get mid() { return +((this.bid + this.ask) / 2).toFixed(4); },
        get spread() { return +((this.ask - this.bid)).toFixed(4); },
    },
    clientA: { cash: 10000, shares: 0, savings: 0, internalTrades: 0, externalTrades: 0, totalSpent: 0, sharesBought: 0, feeSaved: 0 },   // Buyer
    clientB: { cash: 0,     shares: 50, savings: 0, internalTrades: 0, externalTrades: 0, totalReceived: 0, sharesSold: 0, feeSaved: 0 },   // Seller
    orderBook: { buys: [], sells: [] },
    stats: { internalTrades: 0, externalTrades: 0, feesSaved: 0, totalVolume: 0 },
    logEntries: [],
    orderId: 0,
    matchingTimer: null,
    externalTimer: null,
};

// =====================
//  DOM References
// =====================

const $ = (id) => document.getElementById(id);

const dom = {
    bidPrice:       $('bidPrice'),
    askPrice:       $('askPrice'),
    midPrice:       $('midPrice'),
    spreadValue:    $('spreadValue'),
    matchRate:      $('matchRate'),

    clientACash:         $('clientACash'),
    clientAShares:       $('clientAShares'),
    clientASavings:      $('clientASavings'),
    clientATotalSpent:   $('clientATotalSpent'),
    clientAAvgPrice:     $('clientAAvgPrice'),
    clientAInternal:     $('clientAInternal'),
    clientAExternal:     $('clientAExternal'),
    clientAFeeSaved:     $('clientAFeeSaved'),

    clientBCash:         $('clientBCash'),
    clientBShares:       $('clientBShares'),
    clientBSavings:      $('clientBSavings'),
    clientBTotalReceived:$('clientBTotalReceived'),
    clientBAvgPrice:     $('clientBAvgPrice'),
    clientBInternal:     $('clientBInternal'),
    clientBExternal:     $('clientBExternal'),
    clientBFeeSaved:     $('clientBFeeSaved'),

    buyOrders:      $('buyOrders'),
    sellOrders:     $('sellOrders'),
    matchVisual:    $('matchVisual'),
    tradeLog:       $('tradeLog'),

    internalTrades: $('internalTrades'),
    externalTrades: $('externalTrades'),
    feesSaved:      $('feesSaved'),
    totalVolume:    $('totalVolume'),

    buyQty:         $('buyQty'),
    buyPrice:       $('buyPrice'),
    sellQty:        $('sellQty'),
    sellPrice:      $('sellPrice'),

    placeBuyBtn:    $('placeBuyBtn'),
    placeSellBtn:   $('placeSellBtn'),
    resetBtn:       $('resetBtn'),
};

// =====================
//  Formatting Helpers
// =====================

const fmt = {
    usd: (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    qty: (n) => n.toLocaleString('en-US'),
    pct: (n) => n.toFixed(0) + '%',
    time: () => {
        const d = new Date();
        return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
};

// =====================
//  Market Price Drift
// =====================

function driftMarketPrice() {
    const move = (Math.random() - 0.5) * 0.04;  // ± $0.02
    state.market.bid = +(state.market.bid + move).toFixed(2);
    state.market.ask = +(state.market.bid + 0.10).toFixed(2);   // keep spread = $0.10
    updateMarketUI();
}

// =====================
//  UI Update Functions
// =====================

function updateMarketUI() {
    dom.bidPrice.textContent   = fmt.usd(state.market.bid);
    dom.askPrice.textContent   = fmt.usd(state.market.ask);
    dom.midPrice.textContent   = fmt.usd(state.market.mid);
    dom.spreadValue.textContent = fmt.usd(state.market.spread);

    const total = state.stats.internalTrades + state.stats.externalTrades;
    dom.matchRate.textContent = total > 0 ? fmt.pct((state.stats.internalTrades / total) * 100) : '0%';
}

function updateClientUI() {
    const A = state.clientA;
    const B = state.clientB;

    // Client A
    animateValue(dom.clientACash,    fmt.usd(A.cash));
    animateValue(dom.clientAShares,  fmt.qty(A.shares));
    dom.clientASavings.textContent      = fmt.usd(A.savings);
    dom.clientATotalSpent.textContent   = fmt.usd(A.totalSpent);
    dom.clientAAvgPrice.textContent     = A.sharesBought > 0 ? fmt.usd(A.totalSpent / A.sharesBought) : '—';
    dom.clientAInternal.textContent     = A.internalTrades;
    dom.clientAExternal.textContent     = A.externalTrades;
    dom.clientAFeeSaved.textContent     = fmt.usd(A.feeSaved);

    // Client B
    animateValue(dom.clientBCash,    fmt.usd(B.cash));
    animateValue(dom.clientBShares,  fmt.qty(B.shares));
    dom.clientBSavings.textContent       = fmt.usd(B.savings);
    dom.clientBTotalReceived.textContent = fmt.usd(B.totalReceived);
    dom.clientBAvgPrice.textContent      = B.sharesSold > 0 ? fmt.usd(B.totalReceived / B.sharesSold) : '—';
    dom.clientBInternal.textContent      = B.internalTrades;
    dom.clientBExternal.textContent      = B.externalTrades;
    dom.clientBFeeSaved.textContent      = fmt.usd(B.feeSaved);
}

function animateValue(el, newVal) {
    const oldVal = el.textContent;
    el.textContent = newVal;
    if (oldVal !== newVal) {
        el.classList.add('balance-change');
        // Determine direction
        const oldNum = parseFloat(oldVal.replace(/[$,]/g, ''));
        const newNum = parseFloat(newVal.replace(/[$,]/g, ''));
        if (!isNaN(oldNum) && !isNaN(newNum)) {
            el.classList.add(newNum > oldNum ? 'balance-up' : 'balance-down');
        }
        setTimeout(() => {
            el.classList.remove('balance-change', 'balance-up', 'balance-down');
        }, 800);
    }
}

function updateStatsUI() {
    dom.internalTrades.textContent = state.stats.internalTrades;
    dom.externalTrades.textContent = state.stats.externalTrades;
    dom.feesSaved.textContent      = fmt.usd(state.stats.feesSaved);
    dom.totalVolume.textContent    = fmt.qty(state.stats.totalVolume);
}

function renderOrderBook() {
    dom.buyOrders.innerHTML = state.orderBook.buys.length === 0
        ? '<div class="log-empty" style="padding:12px;font-size:0.75rem;">No buy orders</div>'
        : state.orderBook.buys.map(o => `
            <div class="book-entry buy-entry ${o.filled ? 'matched' : ''}">
                <span class="book-entry-qty">${o.remaining} shares</span>
                <span class="book-entry-price">${o.price ? fmt.usd(o.price) : 'MKT'}</span>
            </div>`).join('');

    dom.sellOrders.innerHTML = state.orderBook.sells.length === 0
        ? '<div class="log-empty" style="padding:12px;font-size:0.75rem;">No sell orders</div>'
        : state.orderBook.sells.map(o => `
            <div class="book-entry sell-entry ${o.filled ? 'matched' : ''}">
                <span class="book-entry-qty">${o.remaining} shares</span>
                <span class="book-entry-price">${o.price ? fmt.usd(o.price) : 'MKT'}</span>
            </div>`).join('');
}

function addLogEntry(type, text) {
    state.logEntries.unshift({ type, text, time: fmt.time() });
    renderLog();
}

function renderLog() {
    if (state.logEntries.length === 0) {
        dom.tradeLog.innerHTML = '<div class="log-empty">No trades executed yet</div>';
        return;
    }
    dom.tradeLog.innerHTML = state.logEntries.map(e => `
        <div class="log-entry ${e.type}">
            <span class="log-time">${e.time}</span>
            <span class="log-type">${e.type === 'internal' ? '⟷ INT' : '↗ EXT'}</span>
            <span class="log-text">${e.text}</span>
        </div>`).join('');
}

function showMatchResult(internals, externals) {
    let html = '<div class="match-result">';

    internals.forEach(m => {
        html += `
        <div class="match-row internal">
            <div class="match-icon">⟷</div>
            <div class="match-detail">
                <strong>Internal Match</strong>
                <span>${m.qty} shares at ${fmt.usd(m.price)} (mid price)</span>
            </div>
            <div class="match-amount">${fmt.usd(m.qty * m.price)}</div>
        </div>`;
    });

    externals.forEach(m => {
        html += `
        <div class="match-row external">
            <div class="match-icon">↗</div>
            <div class="match-detail">
                <strong>External Trade</strong>
                <span>${m.qty} shares at ${fmt.usd(m.price)} (${m.side === 'buy' ? 'ask' : 'bid'})</span>
            </div>
            <div class="match-amount">${fmt.usd(m.qty * m.price)}</div>
        </div>`;
    });

    html += '</div>';
    dom.matchVisual.innerHTML = html;
    dom.matchVisual.classList.add('flash-match');
    setTimeout(() => dom.matchVisual.classList.remove('flash-match'), 800);
}

// =====================
//  Highlight Flow Steps
// =====================

function highlightStep(stepNum) {
    document.querySelectorAll('.flow-step').forEach(s => s.classList.remove('active'));
    const step = document.getElementById(`step${stepNum}`);
    if (step) {
        step.classList.add('active');
        setTimeout(() => step.classList.remove('active'), 2000);
    }
}

// =====================
//  Core Engine
// =====================

function validateAndCross(buyOrder, sellOrder, marketBid, marketAsk) {

    // ---- Condition 0: Verify the market is valid ----
    if (marketBid >= marketAsk) {
        console.log("Crossed market — cannot calculate a valid Mid");
        return { approved: false, reason: "CROSSED_MARKET" };
    }

    const mid       = (marketBid + marketAsk) / 2;
    const buyLimit  = buyOrder.limitPrice;   // Infinity for market orders
    const sellLimit = sellOrder.limitPrice;  // 0 for market orders

    // ---- Condition 1: Can these orders cross at all? ----
    // If the buyer's max price is below the seller's min price, no deal is possible.
    if (buyLimit < sellLimit) {
        console.log(`Buyer max ${buyLimit} < Seller min ${sellLimit} — prices don't cross`);
        return { approved: false, reason: "PRICES_DONT_CROSS" };
    }

    // ---- Condition 2: Determine fair execution price ----
    // Prefer mid, but clamp into [sellLimit, buyLimit] so both limits are respected.
    // Examples:
    //   Both above mid → executionPrice = sellLimit  (e.g. buyer $101, seller $100.02 → $100.02)
    //   Both below mid → executionPrice = buyLimit   (e.g. buyer $99.98, seller $99.90 → $99.98)
    //   Limits straddle mid → executionPrice = mid   (e.g. buyer $101, seller $99 → $100.00)
    const candidatePrice = Math.max(sellLimit, Math.min(buyLimit, mid));

    // ---- Condition 3: Must stay within NBBO (best execution) ----
    if (candidatePrice > marketAsk || candidatePrice < marketBid) {
        console.log(`Candidate price ${candidatePrice} is outside NBBO [${marketBid}, ${marketAsk}]`);
        return { approved: false, reason: "OUTSIDE_NBBO" };
    }

    // ---- All checks passed — cross approved ----
    const executionPrice = +candidatePrice.toFixed(4);
    const quantity       = Math.min(buyOrder.quantity, sellOrder.quantity);

    return {
        approved:       true,
        executionPrice: executionPrice,
        quantity:       quantity,
        buyerSaving:    +(marketAsk - executionPrice).toFixed(4),  // buyer pays less than ask
        sellerGain:     +(executionPrice - marketBid).toFixed(4),  // seller receives more than bid
        brokerSaving:   `Exchange fee on ${quantity} shares`       // broker profit
    };
}

function executeExternalTrade(order) {
    if (order.remaining <= 0 || order.filled) return [];
    const externals = [];
    if (order.side === 'buy') {
        const price = state.market.ask;
        if (order.price !== null && order.price < price) {
            addLogEntry('external', `Routed <strong>${order.remaining}</strong> shares for A @ Limit <strong>${fmt.usd(order.price)}</strong> (Resting on Exchange)`);
            order.remaining = 0;
            order.filled = true;
            return [];
        }
        const qty = order.remaining;
        state.clientA.cash        -= qty * price;
        state.clientA.shares      += qty;
        state.clientA.externalTrades++;
        state.clientA.totalSpent  += qty * price;
        state.clientA.sharesBought += qty;
        state.stats.externalTrades++;
        state.stats.totalVolume += qty;
        externals.push({ qty, price, side: 'buy' });
        addLogEntry('external', `Bought <strong>${qty}</strong> shares for A @ <strong>${fmt.usd(price)}</strong>`);
    } else {
        const price = state.market.bid;
        if (order.price !== null && order.price > price) {
            addLogEntry('external', `Routed <strong>${order.remaining}</strong> shares for B @ Limit <strong>${fmt.usd(order.price)}</strong> (Resting on Exchange)`);
            order.remaining = 0;
            order.filled = true;
            return [];
        }
        const qty = order.remaining;
        state.clientB.cash          += qty * price;
        state.clientB.shares        -= qty;
        state.clientB.externalTrades++;
        state.clientB.totalReceived += qty * price;
        state.clientB.sharesSold    += qty;
        state.stats.externalTrades++;
        state.stats.totalVolume += qty;
        externals.push({ qty, price, side: 'sell' });
        addLogEntry('external', `Sold <strong>${qty}</strong> shares for B @ <strong>${fmt.usd(price)}</strong>`);
    }
    order.remaining = 0;
    order.filled = true;
    return externals;
}

function createOrder(side, qty, price) {
    state.orderId++;
    return {
        id: state.orderId,
        side,          // 'buy' | 'sell'
        qty,           // original quantity
        remaining: qty,
        price: price || null,   // null = market order
        filled: false,
        timestamp: Date.now(),
    };
}

function placeOrder(side, qty, price) {
    if (qty <= 0) return;

    // Validation
    if (side === 'buy') {
        const cost = qty * (price || state.market.ask);
        if (cost > state.clientA.cash) {
            alert('Client A does not have enough cash!');
            return;
        }
    } else {
        if (qty > state.clientB.shares) {
            alert('Client B does not have enough shares!');
            return;
        }
    }

    const order = createOrder(side, qty, price);

    // Stage 1: Accumulation
    highlightStep(1);
    if (side === 'buy') {
        state.orderBook.buys.push(order);
        addLogEntry('internal', `<strong>Client A</strong> placed buy order: ${qty} shares` + (price ? ` @ ${fmt.usd(price)}` : ' @ Market'));
    } else {
        state.orderBook.sells.push(order);
        addLogEntry('internal', `<strong>Client B</strong> placed sell order: ${qty} shares` + (price ? ` @ ${fmt.usd(price)}` : ' @ Market'));
    }
    renderOrderBook();

    // IMMEDIATE Internal Matching (Always updated)
    matchOrdersInternal();
}

function matchOrdersInternal() {
    const { buys, sells } = state.orderBook;
    const internals = [];
    let externals = [];

    // Stage 2: Internal Matching
    highlightStep(2);

    buys.sort((a, b) => (b.price || Infinity) - (a.price || Infinity) || a.timestamp - b.timestamp);
    sells.sort((a, b) => (a.price || 0) - (b.price || 0) || a.timestamp - b.timestamp);

    for (const buy of buys) {
        if (buy.remaining === 0) continue;
        for (const sell of sells) {
            if (sell.remaining === 0) continue;

            const buyLimit  = buy.price  || Infinity;
            const sellLimit = sell.price || 0;
            
            const check = validateAndCross(
                { limitPrice: buyLimit, quantity: buy.remaining },
                { limitPrice: sellLimit, quantity: sell.remaining },
                state.market.bid,
                state.market.ask
            );

            if (check.approved) {
                const matchQty = check.quantity;
                const midPrice = check.executionPrice;

                const cost = matchQty * midPrice;
                state.clientA.cash   -= cost;
                state.clientA.shares += matchQty;
                state.clientB.cash   += cost;
                state.clientB.shares -= matchQty;

                state.clientA.savings += check.buyerSaving * matchQty;
                state.clientB.savings += check.sellerGain * matchQty;

                // Per-client tracking
                state.clientA.internalTrades++;
                state.clientA.totalSpent  += cost;
                state.clientA.sharesBought += matchQty;
                state.clientA.feeSaved    += EXCHANGE_FEE_PER_TRADE / 2;

                state.clientB.internalTrades++;
                state.clientB.totalReceived += cost;
                state.clientB.sharesSold    += matchQty;
                state.clientB.feeSaved      += EXCHANGE_FEE_PER_TRADE / 2;

                buy.remaining  -= matchQty;
                sell.remaining -= matchQty;
                if (buy.remaining === 0) buy.filled = true;
                if (sell.remaining === 0) sell.filled = true;

                state.stats.internalTrades++;
                state.stats.feesSaved += EXCHANGE_FEE_PER_TRADE;
                state.stats.totalVolume += matchQty;

                internals.push({ qty: matchQty, price: midPrice });
                const trueMid = +((state.market.bid + state.market.ask) / 2).toFixed(4);
                const priceNote = midPrice !== trueMid
                    ? ` <span style="opacity:0.6">(mid was ${fmt.usd(trueMid)} — limit adjusted)</span>`
                    : '';
                addLogEntry('internal', `Crossed <strong>${matchQty}</strong> shares internally @ <strong>${fmt.usd(midPrice)}</strong>${priceNote}`);
            } else {
                if (check.reason === "PRICES_DONT_CROSS") {
                    // Buyer's max < seller's min — no internal deal possible, both go to exchange
                    externals = externals.concat(executeExternalTrade(buy));
                    externals = externals.concat(executeExternalTrade(sell));
                } else if (check.reason === "OUTSIDE_NBBO") {
                    // Execution price would violate best-execution rules — both go to exchange
                    externals = externals.concat(executeExternalTrade(buy));
                    externals = externals.concat(executeExternalTrade(sell));
                }
                // CROSSED_MARKET: market data is invalid — do nothing, wait for a valid market
            }
        }
    }

    state.orderBook.buys  = state.orderBook.buys.filter(o => !o.filled);
    state.orderBook.sells = state.orderBook.sells.filter(o => !o.filled);

    renderOrderBook();
    updateClientUI();
    updateStatsUI();

    if (internals.length || externals.length) {
        showMatchResult(internals, externals);
        // Reset timer on match to allow leftovers more time
        stopClearanceCountdown();
    }

    // External timer logic: Start or Reset countdown
    if (state.orderBook.buys.length || state.orderBook.sells.length) {
        stopClearanceCountdown();
        startClearanceCountdown(10);
    } else {
        stopClearanceCountdown();
    }
}

function stopClearanceCountdown() {
    if (state.externalTimer) {
        clearInterval(state.externalTimer);
        state.externalTimer = null;
    }
    const badge = document.querySelector('.broker-badge');
    if (badge) {
        badge.innerHTML = 'Internal Matching';
        badge.style.background = 'var(--internal-gold-dim)';
    }
}

function startClearanceCountdown(seconds) {
    let remaining = seconds;
    const badge = document.querySelector('.broker-badge');
    
    const updateBadge = () => {
        badge.innerHTML = `Internal Matching (Clearance in ${remaining}s)`;
        badge.style.background = 'rgba(245, 158, 11, 0.2)';
    };
    
    updateBadge();
    
    state.externalTimer = setInterval(() => {
        remaining--;
        updateBadge();
        
        if (remaining <= 0) {
            stopClearanceCountdown();
            matchOrdersExternal();
        }
    }, 1000);
}

function matchOrdersExternal() {
    const { buys, sells } = state.orderBook;
    let externals = [];

    // Stage 3: External trade
    highlightStep(3);

    for (const buy of buys) {
        externals = externals.concat(executeExternalTrade(buy));
    }

    for (const sell of sells) {
        externals = externals.concat(executeExternalTrade(sell));
    }

    state.orderBook.buys  = state.orderBook.buys.filter(o => !o.filled);
    state.orderBook.sells = state.orderBook.sells.filter(o => !o.filled);

    renderOrderBook();
    updateClientUI();
    updateStatsUI();
    updateMarketUI();

    if (externals.length) {
        showMatchResult([], externals);
    }
}

// =====================
//  Event Handlers
// =====================

dom.placeBuyBtn.addEventListener('click', () => {
    const qty   = parseInt(dom.buyQty.value, 10);
    const price = dom.buyPrice.value ? parseFloat(dom.buyPrice.value) : null;
    if (isNaN(qty) || qty <= 0) return;
    placeOrder('buy', qty, price);
    $('clientA').classList.add('flash-buy');
    setTimeout(() => $('clientA').classList.remove('flash-buy'), 600);
});

dom.placeSellBtn.addEventListener('click', () => {
    const qty   = parseInt(dom.sellQty.value, 10);
    const price = dom.sellPrice.value ? parseFloat(dom.sellPrice.value) : null;
    if (isNaN(qty) || qty <= 0) return;
    placeOrder('sell', qty, price);
    $('clientB').classList.add('flash-sell');
    setTimeout(() => $('clientB').classList.remove('flash-sell'), 600);
});

dom.resetBtn.addEventListener('click', () => {
    state.clientA   = { cash: 10000, shares: 0, savings: 0, internalTrades: 0, externalTrades: 0, totalSpent: 0, sharesBought: 0, feeSaved: 0 };
    state.clientB   = { cash: 0,     shares: 50, savings: 0, internalTrades: 0, externalTrades: 0, totalReceived: 0, sharesSold: 0, feeSaved: 0 };
    state.orderBook = { buys: [], sells: [] };
    state.stats     = { internalTrades: 0, externalTrades: 0, feesSaved: 0, totalVolume: 0 };
    state.logEntries = [];
    state.orderId   = 0;
    state.market.bid = 99.95;
    state.market.ask = 100.05;

    stopClearanceCountdown();

    updateMarketUI();
    updateClientUI();
    updateStatsUI();
    renderOrderBook();
    renderLog();

    dom.matchVisual.innerHTML = `
        <div class="match-placeholder">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.3"><path d="M6 24h36M24 6v36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" opacity="0.3"/></svg>
            <p>Place orders from both clients to see internal matching in action</p>
        </div>`;
});

// =====================
//  Scenarios
// =====================

$('scenario1').addEventListener('click', () => {
    dom.resetBtn.click();
    setTimeout(() => {
        placeOrder('sell', 10, null);
        setTimeout(() => placeOrder('buy', 20, null), 400); // Wait 400ms (within 800ms window)
    }, 300);
});

$('scenario2').addEventListener('click', () => {
    dom.resetBtn.click();
    setTimeout(() => {
        placeOrder('sell', 15, null);
        setTimeout(() => placeOrder('buy', 15, null), 400); // Wait 400ms (within 800ms window)
    }, 300);
});

$('scenario3').addEventListener('click', () => {
    dom.resetBtn.click();
    setTimeout(() => {
        placeOrder('sell', 5, null);
        setTimeout(() => {
            placeOrder('buy', 8, null);
            setTimeout(() => {
                driftMarketPrice();
                placeOrder('sell', 10, null);
                setTimeout(() => {
                    placeOrder('buy', 12, null);
                }, 2500);
            }, 2500);
        }, 2000);
    }, 300);
});

$('scenario4').addEventListener('click', () => {
    dom.resetBtn.click();
    setTimeout(() => {
        placeOrder('buy', 20, null);
    }, 300);
});

// =====================
//  Market Price Drift (subtle)
// =====================

setInterval(driftMarketPrice, 5000);

// =====================
//  Initial Render
// =====================

updateMarketUI();
updateClientUI();
updateStatsUI();
renderOrderBook();
renderLog();

// =====================
//  Neural Network Advisor
// =====================

const NN = window.NeuralNetworkCore;
let nnModel = null;

const nnDom = {
    statusBadge:  $('nnStatusContainer'),
    statusText:   $('nnStatusText'),
    matchProb:    $('gaugeMatchProb'),
    valMatch:     $('valMatchProb'),
    savings:      $('gaugeSavings'),
    valSavings:   $('valSavings'),
    rec:          $('nnRecommendation'),
    lastUpdate:   $('nnLastUpdate'),
    featureRow:   $('featureRow'),
    modelNote:    $('nnModelNote'),
};

function updateNNStatus(state, text) {
    nnDom.statusBadge.classList.remove('status-online', 'status-offline', 'status-training');
    nnDom.statusBadge.classList.add(`status-${state}`);
    nnDom.statusText.textContent = text;
}

const FEATURE_NAMES = ['BuyQty','SellQty','Spread','Imbalance','MidPrice','BkBuy','BkSell','HistRate'];

// Draw the mini architecture SVG
function drawMiniNNDiagram() {
    const layers = [8, 16, 8, 3];
    const colors = ['#6366f1','#8b5cf6','#8b5cf6','#10b981'];
    const W = 420, H = 160;
    const maxN = Math.max(...layers);
    let html = '';

    const positions = layers.map((n, li) => {
        const x = 36 + (li / (layers.length - 1)) * (W - 72);
        return Array.from({length: n}, (_, ni) => ({
            x, y: H / 2 + (ni - (n - 1) / 2) * (H / (maxN + 2))
        }));
    });

    // Connections (lines) with explanation
    html += `<g class="nn-layer-group" data-title="Connections (Weights)" data-desc="Lines connect neurons from one layer to the next. The thickness or brightness represents the 'weight' (importance) of the connection between two specific data points.">`;
    for (let li = 0; li < positions.length - 1; li++) {
        positions[li].forEach(f => {
            const toNodes = positions[li + 1];
            const step = Math.max(1, Math.floor(toNodes.length / 5));
            toNodes.filter((_, i) => i % step === 0).forEach(t => {
                html += `<line x1="${f.x}" y1="${f.y}" x2="${t.x}" y2="${t.y}" stroke="rgba(99,102,241,0.15)" stroke-width="1" class="nn-connection"/>`;
            });
        });
    }
    html += `</g>`;

    // Nodes (layers) with explanations
    const explanations = [
        { title: "Input Layer (8 Neurons)", desc: "Receives raw market data: Buy/Sell Qty, Bid/Ask Spread, Order Book Depth, and Historical Rates. Each neuron holds one data feature." },
        { title: "Hidden Layer 1 (16 Neurons)", desc: "Extracts primary patterns. E.g., a neuron might fire if there's high Buy Qty AND deep Sell Order Book at the same time." },
        { title: "Hidden Layer 2 (8 Neurons)", desc: "Combines primary patterns into complex rules. E.g., understanding if the spread is wide enough to justify internal crossing." },
        { title: "Output Layer (3 Neurons)", desc: "Produces the final predictions: Match Probability, Expected Savings, and the definitive Route Recommendation (Internal/External)." }
    ];

    positions.forEach((nodes, li) => {
        const exp = explanations[li];
        html += `<g class="nn-layer-group" data-title="${exp.title}" data-desc="${exp.desc}">`;
        
        // Invisible hit area for hover
        html += `<rect x="${nodes[0].x - 15}" y="10" width="30" height="${H - 20}" fill="transparent" cursor="help"/>`;

        nodes.forEach(({x, y}) => {
            html += `<circle cx="${x}" cy="${y}" r="5" fill="${colors[li]}" opacity="0.8" class="nn-neuron"/>`;
        });
        const label = ['Input (8)','Hidden (16)','Hidden (8)','Output (3)'][li];
        html += `<text x="${nodes[0].x}" y="${H - 4}" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="9" font-family="Inter,sans-serif" pointer-events="none">${label}</text>`;
        
        html += `</g>`;
    });

    $('nnMiniDiagram').innerHTML = html;
    
    // Add tooltip logic
    setupDiagramTooltips();
}

function setupDiagramTooltips() {
    const tooltip = document.createElement('div');
    tooltip.className = 'nn-diagram-tooltip';
    document.body.appendChild(tooltip);

    const groups = document.querySelectorAll('.nn-layer-group');
    groups.forEach(g => {
        g.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `<strong>${g.dataset.title}</strong><br>${g.dataset.desc}`;
            tooltip.classList.add('visible');
            
            // Highlight this group
            g.classList.add('highlight-layer');
        });
        g.addEventListener('mousemove', (e) => {
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        });
        g.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
            g.classList.remove('highlight-layer');
        });
    });
}

drawMiniNNDiagram();

// Connect to Neural Network Server
let nnEventSource = null;

async function loadNNModel() {
    if (nnEventSource) {
        nnEventSource.close();
    }
    
    updateNNStatus('offline', 'Connecting to server...');
    
    try {
        nnEventSource = new EventSource('http://localhost:3005/connect');
        
        nnEventSource.onopen = () => {
            updateNNStatus('online', 'Connected to NN Server');
        };
        
        nnEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'status') {
                if (data.status === 'connected') {
                    updateNNStatus('online', 'NN Server Connected');
                    if (data.hasModel) {
                        nnDom.modelNote.innerHTML = '<span style="color:var(--buy-green)">Remote Model Loaded. Ready for predictions.</span>';
                        nnModel = true; // Flag to indicate server is ready
                    } else {
                        nnDom.modelNote.innerHTML = 'Server connected, but no model trained. Run node train.js';
                        nnModel = false;
                    }
                }
            }
        };

        nnEventSource.onerror = (err) => {
            updateNNStatus('offline', 'NN Server Offline');
            nnDom.modelNote.innerHTML = 'Run Neural Network server to connect.';
            nnEventSource.close();
            nnEventSource = null;
            nnModel = false;
            // Retry after 5 seconds
            setTimeout(loadNNModel, 5000);
        };
    } catch (e) {
        console.error("Connection error:", e);
    }
}

// Build feature vector from current simulation state for a given order
function buildFeatures(side, qty) {
    const sellAvail = state.orderBook.sells.reduce((s, o) => s + o.remaining, 0);
    const buyAvail  = state.orderBook.buys.reduce((s, o) => s + o.remaining, 0);
    const totalTrades = state.stats.internalTrades + state.stats.externalTrades;
    const histRate = totalTrades > 0 ? state.stats.internalTrades / totalTrades : 0.5;

    const scenario = {
        buyQty:             side === 'buy' ? qty : buyAvail,
        sellQty:            side === 'sell' ? qty : sellAvail,
        bid:                state.market.bid,
        ask:                state.market.ask,
        bookDepthBuy:       state.orderBook.buys.length,
        bookDepthSell:      state.orderBook.sells.length,
        historicalMatchRate: histRate,
    };

    return { features: NN.extractFeatures(scenario), scenario };
}

// Run prediction via server and update UI
async function runNNPrediction(side, qty) {
    if (!nnModel) return;

    const { features, scenario } = buildFeatures(side, qty);
    
    try {
        const response = await fetch('http://localhost:3005/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features })
        });
        
        if (!response.ok) throw new Error('Prediction failed');
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        const pred = data.prediction;

        const matchProb  = pred[0];
        const savingsNorm = pred[1];
        const routeScore = pred[2];
        const isInternal = routeScore >= 0.5;

        // Gauges
        nnDom.matchProb.style.width  = (matchProb * 100).toFixed(1) + '%';
        nnDom.savings.style.width    = (savingsNorm * 100).toFixed(1) + '%';
        nnDom.valMatch.textContent   = (matchProb * 100).toFixed(0) + '%';
        nnDom.valSavings.textContent = (savingsNorm * 100).toFixed(0) + '%';

        // Recommendation
        nnDom.rec.className   = 'nn-rec ' + (isInternal ? 'nn-rec-internal' : 'nn-rec-external');
        nnDom.rec.textContent = isInternal ? '⟷ CROSS INTERNALLY' : '↗ ROUTE TO EXCHANGE';

        // Timestamp
        nnDom.lastUpdate.textContent = fmt.time();

        // Feature chips
        nnDom.featureRow.innerHTML = features.map((v, i) => `
            <div class="nn-feature-chip ${v > 0.5 ? 'active' : ''}">
                <span class="nn-feature-name">${FEATURE_NAMES[i]}</span>
                <span class="nn-feature-val">${v.toFixed(2)}</span>
            </div>`).join('');
            
    } catch (e) {
        console.error("NN Prediction Error:", e);
    }
}

// Hook into order placement
const _origPlaceOrder = placeOrder;
window.placeOrder = function(side, qty, price) {
    _origPlaceOrder(side, qty, price);
    setTimeout(() => runNNPrediction(side, qty), 100);
};

// =====================
//  Training Dashboard Logic
// =====================

const trainDom = {
    modal:          $('trainingModal'),
    openBtn:         $('openTrainingBtn'),
    closeBtn:        $('closeTrainingBtn'),
    startBtn:        $('startTrainingBtn'),
    saveBtn:         $('saveModelBtn'),
    progressBar:     $('trainProgressBar'),
    progressPct:     $('trainProgressPct'),
    statusText:      $('trainStatusText'),
    log:             $('trainingLog'),
    liveAcc:         $('trainLiveAcc'),
    liveLoss:        $('trainLiveLoss'),
    canvas:          $('liveLossChart'),
};

let trainingInProgress = false;
let trainingHistory = { loss: [], acc: [] };

// Open/Close Modal
trainDom.openBtn.onclick = () => trainDom.modal.style.display = 'flex';
trainDom.closeBtn.onclick = () => {
    if (trainingInProgress) {
        if (!confirm('Training is in progress. Are you sure you want to close?')) return;
    }
    trainDom.modal.style.display = 'none';
};

// Log helper
function trainLog(msg, type = 'system') {
    const div = document.createElement('div');
    div.className = `log-msg ${type}`;
    div.textContent = `[${fmt.time()}] ${msg}`;
    trainDom.log.appendChild(div);
    trainDom.log.scrollTop = trainDom.log.scrollHeight;
}

// Data Generation
function generateBrowserDataset(size = 10000) {
    const data = [];
    const rand = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(rand(min, max + 1));

    for (let i = 0; i < size; i++) {
        const r = Math.random();
        let bid, ask, spread, buyQty, sellQty, bookDepthBuy, bookDepthSell, historicalMatchRate;

        if (r < 0.15) {
            // Whale Order
            bid = rand(90, 110); spread = rand(0.05, 0.30); ask = bid + spread;
            buyQty = Math.random() > 0.5 ? randInt(500, 2000) : randInt(1, 50);
            sellQty = buyQty > 100 ? randInt(1, 50) : randInt(500, 2000);
            bookDepthBuy = randInt(1, 5); bookDepthSell = randInt(1, 5);
            historicalMatchRate = rand(0.1, 0.5);
        } else if (r < 0.30) {
            // High Volatility / Illiquid
            bid = rand(10, 500); spread = rand(0.50, 3.50); ask = bid + spread;
            buyQty = randInt(1, 20); sellQty = randInt(1, 20);
            bookDepthBuy = randInt(0, 2); bookDepthSell = randInt(0, 2);
            historicalMatchRate = rand(0.0, 0.2);
        } else if (r < 0.40) {
            // Perfect Match
            bid = rand(90, 110); spread = rand(0.05, 0.20); ask = bid + spread;
            const qty = randInt(10, 200); buyQty = qty; sellQty = qty;
            bookDepthBuy = randInt(5, 20); bookDepthSell = randInt(5, 20);
            historicalMatchRate = rand(0.8, 1.0);
        } else if (r < 0.55) {
            // Zero Liquidity
            bid = rand(90, 110); spread = rand(0.05, 0.30); ask = bid + spread;
            buyQty = randInt(10, 100); sellQty = 0;
            bookDepthBuy = randInt(1, 5); bookDepthSell = 0;
            historicalMatchRate = 0.0;
        } else if (r < 0.70) {
            // High Historical Trust
            bid = rand(90, 110); spread = rand(0.05, 0.30); ask = bid + spread;
            buyQty = randInt(10, 50); sellQty = randInt(10, 50);
            bookDepthBuy = randInt(5, 10); bookDepthSell = randInt(5, 10);
            historicalMatchRate = rand(0.8, 1.0);
        } else {
            // Normal
            bid = rand(90, 110); spread = rand(0.05, 0.30); ask = bid + spread;
            buyQty = randInt(1, 100);
            const hasSeller = Math.random() > 0.30;
            sellQty = hasSeller ? randInt(1, 100) : 0;
            bookDepthBuy = randInt(0, 10); bookDepthSell = randInt(0, 10);
            const baseRate = hasSeller ? rand(0.3, 1.0) : rand(0.0, 0.35);
            historicalMatchRate = Math.min(1, Math.max(0, baseRate + rand(-0.1, 0.1)));
        }

        const scenario = { buyQty, sellQty, bid, ask, bookDepthBuy, bookDepthSell, historicalMatchRate };
        data.push({
            input: NN.extractFeatures(scenario),
            target: NN.generateLabels(scenario)
        });
    }
    return data;
}

// Start Training
trainDom.startBtn.onclick = async () => {
    if (trainingInProgress) return;
    
    trainingInProgress = true;
    trainDom.startBtn.disabled = true;
    trainDom.startBtn.textContent = '⏳ Training...';
    trainDom.saveBtn.style.display = 'none';
    
    updateNNStatus('training', 'Training Model...');
    
    const DATASET_SIZE = 20000;
    const EPOCHS = 100;
    const BATCH_SIZE = 64;
    
    trainLog(`Generating ${DATASET_SIZE.toLocaleString()} synthetic scenarios...`);
    const allData = generateBrowserDataset(DATASET_SIZE);
    
    const splitIdx = Math.floor(allData.length * 0.8);
    const trainSet = { 
        inputs: allData.slice(0, splitIdx).map(d => d.input), 
        targets: allData.slice(0, splitIdx).map(d => d.target) 
    };
    const valSet = { 
        inputs: allData.slice(splitIdx).map(d => d.input), 
        targets: allData.slice(splitIdx).map(d => d.target) 
    };
    
    trainLog(`Dataset ready. Training [8,16,8,3] network...`);
    
    const localNN = new NN.NeuralNetwork([8, 16, 8, 3], 0.88);
    trainingHistory = { loss: [], acc: [] };
    
    let epoch = 1;
    const trainStep = () => {
        if (epoch > EPOCHS) {
            finishTraining(localNN);
            return;
        }
        
        const result = localNN.train(trainSet, valSet, {
            epochs: 1,
            batchSize: BATCH_SIZE,
            lr: 0.04,
            lrDecay: 0.995,
        });
        
        const loss = result.trainLoss[0];
        const acc = result.valAcc[0];
        
        trainingHistory.loss.push(loss);
        trainingHistory.acc.push(acc);
        
        const pct = (epoch / EPOCHS) * 100;
        trainDom.progressBar.style.width = `${pct}%`;
        trainDom.progressPct.textContent = `${Math.round(pct)}%`;
        trainDom.statusText.textContent = `Epoch ${epoch}/${EPOCHS}`;
        trainDom.liveAcc.textContent = `${(acc * 100).toFixed(1)}%`;
        trainDom.liveLoss.textContent = loss.toFixed(4);
        
        if (epoch % 10 === 0) {
            trainLog(`Epoch ${epoch}: Loss=${loss.toFixed(4)} Acc=${(acc * 100).toFixed(1)}%`, 'epoch');
        }
        
        drawLiveChart();
        epoch++;
        requestAnimationFrame(trainStep);
    };
    
    trainStep();
};

function finishTraining(trainedNN) {
    trainingInProgress = false;
    trainDom.startBtn.disabled = false;
    trainDom.startBtn.textContent = '🚀 Retrain Model';
    trainDom.statusText.textContent = 'Training Complete!';
    trainDom.saveBtn.style.display = 'block';
    trainLog('Training complete! Click "Save & Apply" to use this model.', 'metric');

    trainDom.saveBtn.onclick = () => {
        nnModel = trainedNN;
        const weights = trainedNN.save();
        localStorage.setItem('broker_nn_weights', JSON.stringify({
            modelWeights: weights,
            metrics: {
                finalValAcc: trainingHistory.acc[trainingHistory.acc.length - 1],
                trainedAt: new Date().toISOString()
            }
        }));

        updateNNStatus('online', 'Model Ready (New)');
        nnDom.modelNote.innerHTML = `<span style="color:var(--buy-green)">Model updated!</span> Accuracy: ${(trainingHistory.acc[trainingHistory.acc.length-1]*100).toFixed(1)}%`;

        trainDom.modal.style.display = 'none';
        trainLog('Model saved and applied to simulation.');
    };
}

function drawLiveChart() {
    const canvas = trainDom.canvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth - 32;
    const H = 160;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    if (trainingHistory.loss.length < 2) return;
    const pad = 10;
    const cw = W - pad * 2;
    const ch = H - pad * 2;
    const maxLoss = Math.max(...trainingHistory.loss);
    const minLoss = Math.min(...trainingHistory.loss);
    const range = (maxLoss - minLoss) || 0.1;

    ctx.beginPath();
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    trainingHistory.loss.forEach((v, i) => {
        const x = pad + (i / (trainingHistory.loss.length - 1)) * cw;
        const y = pad + ch - ((v - minLoss) / range) * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.lineTo(pad + cw, pad + ch);
    ctx.lineTo(pad, pad + ch);
    const grad = ctx.createLinearGradient(0, pad, 0, pad + ch);
    grad.addColorStop(0, 'rgba(129, 140, 248, 0.2)');
    grad.addColorStop(1, 'rgba(129, 140, 248, 0)');
    ctx.fillStyle = grad;
    ctx.fill();
}

// Initialize
loadNNModel();
