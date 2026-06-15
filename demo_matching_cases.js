const http = require('http');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise((resolve) => rl.question(query, resolve));
}

function post(url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const isJson = typeof data === 'object';
        const body = isJson ? JSON.stringify(data) : data;
        const options = {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let chunk = '';
            res.on('data', (d) => { chunk += d.toString(); });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: chunk
                });
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function get(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options = {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname + u.search,
            method: 'GET',
            headers
        };

        const req = http.request(options, (res) => {
            let chunk = '';
            res.on('data', (d) => { chunk += d.toString(); });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: chunk
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function loginAndGetHeaders(email, password) {
    const loginData = `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const loginRes = await post("http://localhost:8080/api/auth/login", loginData);
    const setCookie = loginRes.headers['set-cookie'];
    if (!setCookie) throw new Error(`Login failed for ${email}`);
    
    const cookieMap = {};
    for (const c of setCookie) {
        const pair = c.split(';')[0].split('=');
        if (pair.length === 2) cookieMap[pair[0].trim()] = pair[1].trim();
    }
    const cookieHeaderValue = Object.keys(cookieMap).map(k => `${k}=${cookieMap[k]}`).join('; ');
    const headers = { 'Cookie': cookieHeaderValue };
    if (cookieMap['XSRF-TOKEN']) headers['X-XSRF-TOKEN'] = cookieMap['XSRF-TOKEN'];
    return headers;
}

function resetDatabase() {
    try {
        console.log("🔄 Resetting database order history & positions...");
        execSync('docker exec -t broker_ui_db psql -U broker -d broker_ui -c "TRUNCATE TABLE trade_fill, broker_order, position RESTART IDENTITY CASCADE;"');
        console.log("✅ Database reset complete.");
    } catch (e) {
        console.warn("⚠️ Database reset failed (make sure docker is running). Processing orders anyway...");
    }
}

async function run() {
    console.clear();
    console.log("=============================================================");
    console.log("     WELCOME TO THE INTERACTIVE PLATFORM MATCHING DEMO       ");
    console.log("=============================================================");
    console.log("  This script walks you through the 5 matching case studies. ");
    console.log("  For each case, we place overlapping limit orders for ");
    console.log("  Trader A (demo@broker.local) and Trader B (7@gmail.com) ");
    console.log("  and inspect the neural network crossing routing results.");
    console.log("=============================================================\n");

    const startChoice = await askQuestion("Do you want to reset the database history first? (y/n): ");
    if (startChoice.toLowerCase() === 'y') {
        resetDatabase();
    }

    console.log("\nLogging in users...");
    const headersA = await loginAndGetHeaders("demo@broker.local", "demo1234");
    const headersB = await loginAndGetHeaders("7@gmail.com", "demo1234");
    console.log("Authentication successful.");

    // Fetch live price
    const priceRes = await get("http://localhost:8080/api/market/price/EURUSDT");
    const priceJson = JSON.parse(priceRes.body);
    const mid = priceJson.price || 1.17;
    console.log(`Current EURUSDT Market Price (Mid): $${mid}`);

    console.log("\nEstablishing initial long position (100 shares) for Seller B so they can place SELL orders...");
    await post("http://localhost:8080/api/broker/orders", {
        symbolCode: "EURUSDT", side: "BUY", orderType: "MARKET", quantity: 100
    }, headersB);
    console.log("Initial position created successfully.");

    const cases = [
        {
            name: "Case 1: Both limits are above mid price",
            description: `Tests when both buyer and seller set limits higher than current mid price ($${mid}).`,
            orderB: { symbolCode: "EURUSDT", side: "SELL", orderType: "LIMIT", quantity: 10, limitPrice: +(mid + 0.0005).toFixed(5) },
            orderA: { symbolCode: "EURUSDT", side: "BUY", orderType: "LIMIT", quantity: 10, limitPrice: +(mid + 0.01).toFixed(5) },
            expected: "Both execute internally (INTERNAL) at mid price."
        },
        {
            name: "Case 2: Both limits are below mid price",
            description: `Tests when both buyer and seller set limits lower than current mid price ($${mid}).`,
            orderB: { symbolCode: "EURUSDT", side: "SELL", orderType: "LIMIT", quantity: 10, limitPrice: +(mid - 0.01).toFixed(5) },
            orderA: { symbolCode: "EURUSDT", side: "BUY", orderType: "LIMIT", quantity: 10, limitPrice: +(mid - 0.0005).toFixed(5) },
            expected: "Seller triggered immediately. Buyer order remains pending (NEW) since market is too expensive."
        },
        {
            name: "Case 3: Market order meets Limit order above mid",
            description: `Tests when Buyer submits MARKET order while Seller has a RESTING LIMIT order above mid ($${mid}).`,
            orderB: { symbolCode: "EURUSDT", side: "SELL", orderType: "LIMIT", quantity: 10, limitPrice: +(mid + 0.0005).toFixed(5) },
            orderA: { symbolCode: "EURUSDT", side: "BUY", orderType: "MARKET", quantity: 10 },
            expected: "Buyer filled immediately. Seller limit order remains resting (NEW) waiting for market price."
        },
        {
            name: "Case 4: Large gap straddling mid price",
            description: `Tests when there is a large overlap of limits crossing the mid price ($${mid}) from both sides.`,
            orderB: { symbolCode: "EURUSDT", side: "SELL", orderType: "LIMIT", quantity: 10, limitPrice: +(mid - 0.02).toFixed(5) },
            orderA: { symbolCode: "EURUSDT", side: "BUY", orderType: "LIMIT", quantity: 10, limitPrice: +(mid + 0.02).toFixed(5) },
            expected: "Both execute internally at mid price, sharing maximum price improvements."
        },
        {
            name: "Case 5: No overlap (Prices don't cross)",
            description: "Tests when Buyer limit is lower than Seller limit. No matching is possible.",
            orderB: { symbolCode: "EURUSDT", side: "SELL", orderType: "LIMIT", quantity: 10, limitPrice: +(mid + 0.02).toFixed(5) },
            orderA: { symbolCode: "EURUSDT", side: "BUY", orderType: "LIMIT", quantity: 10, limitPrice: +(mid - 0.02).toFixed(5) },
            expected: "Both remain pending (NEW) in the book."
        }
    ];

    for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        console.log(`\n=============================================================`);
        console.log(`STEP ${i + 1}: ${c.name}`);
        console.log(`=============================================================`);
        console.log(`Description:   ${c.description}`);
        console.log(`Expectation:   ${c.expected}`);
        
        await askQuestion("\nPress [Enter] to place the orders and run this case...");

        console.log(`\n[Trader B (Seller)] Placing SELL order...`);
        const resB = await post("http://localhost:8080/api/broker/orders", c.orderB, headersB);
        const orderIdB = JSON.parse(resB.body).orderId;
        console.log(`-> Order #${orderIdB} placed.`);

        console.log(`[Trader A (Buyer)]  Placing BUY order...`);
        const resA = await post("http://localhost:8080/api/broker/orders", c.orderA, headersA);
        const orderIdA = JSON.parse(resA.body).orderId;
        console.log(`-> Order #${orderIdA} placed.`);

        console.log("\nWaiting 3.5 seconds for matching engine scheduler to execute...");
        await new Promise(r => setTimeout(r, 3500));

        // Fetch execution details
        const ordersResA = await get("http://localhost:8080/api/broker/orders", headersA);
        const ordersA = JSON.parse(ordersResA.body);
        const orderA = ordersA.find(o => o.id === orderIdA);

        const ordersResB = await get("http://localhost:8080/api/broker/orders", headersB);
        const ordersB = JSON.parse(ordersResB.body);
        const orderB = ordersB.find(o => o.id === orderIdB);

        console.log("\n------------------ Database Execution Results ------------------");
        if (orderA) {
            console.log(`Trader A (BUY Order #${orderIdA}):`);
            console.log(`  Status:                 ${orderA.status === 'FILLED' ? '🟢 FILLED' : '⏳ PENDING (NEW)'}`);
            console.log(`  Limit Price:            ${orderA.limitPrice ? '$' + orderA.limitPrice : 'MARKET'}`);
            console.log(`  Fill Price:             ${orderA.entryPrice ? '$' + orderA.entryPrice : '—'}`);
            console.log(`  Routing:                ${orderA.nnRouteRecommendation || '—'}`);
            console.log(`  NN Match Probability:   ${orderA.nnMatchProb != null ? (orderA.nnMatchProb * 100) + '%' : '—'}`);
        }
        if (orderB) {
            console.log(`\nTrader B (SELL Order #${orderIdB}):`);
            console.log(`  Status:                 ${orderB.status === 'FILLED' ? '🟢 FILLED' : '⏳ PENDING (NEW)'}`);
            console.log(`  Limit Price:            $${orderB.limitPrice}`);
            console.log(`  Fill Price:             ${orderB.entryPrice ? '$' + orderB.entryPrice : '—'}`);
            console.log(`  Routing:                ${orderB.nnRouteRecommendation || '—'}`);
            console.log(`  NN Match Probability:   ${orderB.nnMatchProb != null ? (orderB.nnMatchProb * 100) + '%' : '—'}`);
        }
        console.log("----------------------------------------------------------------");

        if (i < cases.length - 1) {
            await askQuestion("\nPress [Enter] to move to the next Case Study...");
        }
    }

    console.log("\n=============================================================");
    console.log("  ALL CASE STUDIES COMPLETED SUCCESSFULLY!");
    console.log("=============================================================");
    
    // Print final DB statistics
    try {
        console.log("\nFinal Platform Fee Statistics:");
        const stats = execSync('docker exec -t broker_ui_db psql -U broker -d broker_ui -c "SELECT COUNT(*), nn_route_recommendation FROM broker_order GROUP BY nn_route_recommendation;"').toString();
        console.log(stats);
    } catch(e) {}

    rl.close();
}

run().catch(console.error);
