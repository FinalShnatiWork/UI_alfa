# אסטרטגיית מקסום רווח — Netting Broker Model

## מצב נוכחי

כרגע הברוקר מרוויח **רק** מחיסכון בדמי הבורסה:
- `EXCHANGE_FEE_PER_TRADE = $1.50` — כל התאמה פנימית חוסכת $1.50
- כל שיפור המחיר (spread) עובר **במלואו** ללקוחות
- אין דמי תיווך על מסחר פנימי
- אין הכנסה מהמסחר החיצוני

**לסיכום:** המודל הנוכחי נדיב מדי. הברוקר נותן את כל הערך ללקוחות ולא שומר מספיק לעצמו.

---

## אסטרטגיה 1 — Micro-Spread Capture (הכנסה ישירה על כל מסחר פנימי) ⭐ הכי משמעותי

### הרעיון

במקום לבצע את ההתאמה הפנימית בדיוק ב-Mid, הברוקר מבצע אותה **קצת מחוץ ל-Mid**:
- הקונה משלם `mid + ε` (עדיין טוב ממה שישלם ב-ask)
- המוכר מקבל `mid - ε` (עדיין טוב ממה שיקבל ב-bid)
- הברוקר כיס את `2ε × qty` בכל עסקה פנימית

### מספרים לדוגמה
```
bid = 99.95 | ask = 100.05 | mid = 100.00
ε = 0.01

קונה משלם: 100.01 (חוסך $0.04 לעומת ask — עדיין מרוצה)
מוכר מקבל: 99.99 (מרוויח $0.04 לעומת bid — עדיין מרוצה)
ברוקר: $0.02 × qty בכל עסקה פנימית
```

עבור 10 מניות: רווח מיידי $0.20 (+ חיסכון ה-$1.50 בדמי בורסה)

### שינוי קוד ב-`simulation.js`

```javascript
// הוסף בראש הקובץ:
const BROKER_MICRO_SPREAD = 0.01;  // $0.01 per share per side = $0.02 total

// שנה את שדה state:
state: {
    ...
    broker: { revenue: 0, microSpreadRevenue: 0, feesSaved: 0 }
}

// ב-matchOrdersInternal(), שנה את לוגיקת המחיר:
function validateAndCross(buyOrder, sellOrder, marketBid, marketAsk) {
    ...
    const mid = (marketBid + marketAsk) / 2;
    const buyerPrice  = mid + BROKER_MICRO_SPREAD;   // קונה משלם יותר מ-mid
    const sellerPrice = mid - BROKER_MICRO_SPREAD;   // מוכר מקבל פחות מ-mid
    const brokerGainPerShare = buyerPrice - sellerPrice;  // $0.02

    return {
        approved:          true,
        executionPrice:    mid,        // לתצוגה
        buyerActualPrice:  buyerPrice,
        sellerActualPrice: sellerPrice,
        brokerGainPerShare,
        quantity:          Math.min(buyOrder.quantity, sellOrder.quantity),
        buyerSaving:  marketAsk - buyerPrice,  // שיפור מחיר אמיתי לקונה
        sellerGain:   sellerPrice - marketBid, // שיפור מחיר אמיתי למוכר
    };
}

// בעת ביצוע ההתאמה:
const cost = matchQty * check.buyerActualPrice;
state.clientA.cash   -= cost;                              // קונה משלם buyerPrice
state.clientB.cash   += matchQty * check.sellerActualPrice; // מוכר מקבל sellerPrice
state.broker.microSpreadRevenue += check.brokerGainPerShare * matchQty;
state.broker.revenue            += check.brokerGainPerShare * matchQty;
```

---

## אסטרטגיה 2 — Internal Crossing Fee (דמי שירות על כל התאמה פנימית)

### הרעיון

גם אם מבצעים בדיוק ב-mid, הברוקר גובה **עמלה קבועה** על שירות ההתאמה הפנימית.
הלקוח עדיין חוסך לעומת הבורסה, אבל הברוקר מחייב על הנוחות.

```
דמי בורסה שנחסכו ללקוח: $1.50
עמלת ברוקר לעסקה פנימית: $0.50
נטו ללקוח: חיסכון של $1.00 (עדיין שווה לו)
נטו לברוקר: $0.50 הכנסה חדשה + ה-$1.50 שאין צורך לשלם לבורסה
```

### שינוי קוד

```javascript
const INTERNAL_CROSSING_FEE = 0.50;  // $0.50 per internal match

// בתוך matchOrdersInternal(), אחרי כל התאמה מוצלחת:
const fee = INTERNAL_CROSSING_FEE;
state.clientA.cash -= fee / 2;   // מחולק שווה בין הצדדים
state.clientB.cash -= fee / 2;
state.broker.revenue += fee;
state.broker.feeRevenue += fee;

addLogEntry('internal', `Fee: $${fee.toFixed(2)} charged on internal cross`);
```

---

## אסטרטגיה 3 — External Routing Markup (מרווח על מסחר חיצוני)

### הרעיון

כשהברוקר שולח הזמנה לבורסה, הוא קונה ב-ask מהבורסה אבל מחייב את הלקוח **קצת יותר**.
לחלופין, הוא מוכר ב-bid לבורסה אבל מחייב את הלקוח **קצת פחות**.

```
מחיר ask בשוק: $100.05
מה שהברוקר מחייב את הקונה: $100.07
רווח ברוקר: $0.02 לכל מניה
```

### שינוי קוד ב-`executeExternalTrade()`

```javascript
const EXTERNAL_MARKUP = 0.02;  // $0.02 per share markup on external trades

function executeExternalTrade(order) {
    if (order.side === 'buy') {
        const exchangePrice = state.market.ask;
        const clientPrice   = exchangePrice + EXTERNAL_MARKUP;  // מחייב יותר
        
        state.clientA.cash   -= order.remaining * clientPrice;  // לקוח משלם clientPrice
        state.clientA.shares += order.remaining;
        // הברוקר קנה ב-exchangePrice ומכר ללקוח ב-clientPrice
        state.broker.revenue += order.remaining * EXTERNAL_MARKUP;
        state.broker.externalMarkupRevenue += order.remaining * EXTERNAL_MARKUP;
        
    } else {  // sell
        const exchangePrice = state.market.bid;
        const clientPrice   = exchangePrice - EXTERNAL_MARKUP;  // מחייב פחות
        
        state.clientB.cash   += order.remaining * clientPrice;
        state.clientB.shares -= order.remaining;
        state.broker.revenue += order.remaining * EXTERNAL_MARKUP;
    }
}
```

---

## אסטרטגיה 4 — Delayed Accumulation (הגדלת אחוז ההתאמה הפנימית)

### הרעיון

ככל שיותר הזמנות מנוהלות פנימית, הברוקר חוסך יותר דמי בורסה ומרוויח יותר micro-spread.
הפתרון: **להמתין יותר זמן** לפני שמעבירים לבורסה, כדי לצבור יותר הזמנות ולהגדיל את סיכויי ההתאמה.

```
זמן המתנה נוכחי: 10 שניות
זמן מומלץ: 20–30 שניות בשעות שיא, 60 שניות בשעות דממה
```

### שינוי קוד

```javascript
// במקום ערך קבוע, חשב דינמית:
function getAccumulationWindow() {
    const totalTrades = state.stats.internalTrades + state.stats.externalTrades;
    const matchRate = totalTrades > 0 
        ? state.stats.internalTrades / totalTrades 
        : 0.5;
    
    // אם אחוז ההתאמה גבוה — המתן יותר כי יש סיכוי טוב לעוד התאמה
    if (matchRate > 0.7) return 30;
    if (matchRate > 0.4) return 20;
    return 10;  // ברירת מחדל
}

// ב-matchOrdersInternal():
startClearanceCountdown(getAccumulationWindow());
```

---

## אסטרטגיה 5 — Partial Fill Optimization (מקסום כמות ההתאמה)

### הרעיון

כרגע אם יש Buy של 20 ו-Sell של 10, מתבצעת התאמה של 10.
אך אם יש מספר הזמנות מכירה קטנות שביחד מגיעות ל-20, הקוד הנוכחי עלול לפספס אותן.

לוודא שהאלגוריתם **מנסה לצרף מספר הזמנות מנגד** כדי למקסם את ההתאמה.

```javascript
// במקום לעצור אחרי ההתאמה הראשונה, להמשיך לחפש:
for (const buy of buys) {
    if (buy.remaining === 0) continue;
    
    // מיין מוכרים לפי המשתלם ביותר לברוקר
    const sortedSells = sells
        .filter(s => s.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining); // קודם הקטנות — ממקסם מספר התאמות
    
    for (const sell of sortedSells) {
        if (buy.remaining === 0) break;  // כבר הושלם
        // ... המשך לוגיקת ההתאמה
    }
}
```

---

## אסטרטגיה 6 — Neural Network Revenue Boost (שימוש ברשת הנוירונים)

### הרעיון

הרשת הנוירונית כבר חוזה `matchProb` ו-`expectedSavings`. אפשר להשתמש בה כדי:

1. **לקבוע את גודל ה-ε דינמית**: אם ה-`matchProb` גבוה (לקוח בטוח ירצה לסגור פנימית) — העלה את ה-`BROKER_MICRO_SPREAD`. הלקוח לא יברח כי אין לו ברירה טובה.

2. **להחליט על עיכוב**: אם ה-NN אומר שסיכוי התאמה גבוה — המתן. אם נמוך — שלח לבורסה מיד.

```javascript
async function runNNAndOptimizePricing(side, qty) {
    const { features } = buildFeatures(side, qty);
    const response = await fetch('http://localhost:3001/predict', { ... });
    const pred = await response.json();
    
    const matchProb = pred.prediction[0];
    
    // מחיר דינמי: ככל שסיכוי ההתאמה גבוה יותר, הברוקר לוקח יותר
    const dynamicEpsilon = matchProb > 0.8 
        ? 0.025   // סיכוי גבוה — לקח יותר
        : matchProb > 0.5 
            ? 0.015 
            : 0.005;  // סיכוי נמוך — תהיה תחרותי
    
    BROKER_MICRO_SPREAD = dynamicEpsilon;
}
```

---

## טבלת השוואה — כמה כסף כל אסטרטגיה מייצרת?

| אסטרטגיה | הכנסה לעסקה (10 מניות) | עומס על לקוח | מורכבות |
|---|---|---|---|
| (נוכחי) חיסכון בדמי בורסה | $1.50 | אפס | - |
| 1. Micro-Spread ($0.01/side) | $0.20 | נמוך מאוד | נמוכה |
| 2. Crossing Fee ($0.50/עסקה) | $0.50 | בינוני | נמוכה |
| 3. External Markup ($0.02/מניה) | $0.20 | נמוך | נמוכה |
| 4. Delayed Accumulation | $0–$1.50 (יותר מסחר פנימי) | אפס | בינונית |
| 5. Partial Fill Optimization | $0–$1.50 (יותר מסחר פנימי) | אפס | בינונית |
| 6. NN Dynamic Pricing | $0.15–$0.40 | נמוך-בינוני | גבוהה |
| **סה"כ (1+2+3+4)** | **~$2.40 + חיסכון בורסה** | בינוני | נמוכה |

---

## המלצה — סדר יישום

### שלב 1 (מיידי, קל)
יישם **אסטרטגיה 1 + 2** — שינוי של ~20 שורות קוד ב-`simulation.js`.
הוסף `state.broker` לסטטיסטיקות ותצוגה ב-UI.

### שלב 2 (קצר)
הוסף **אסטרטגיה 3** (External Markup) ב-`executeExternalTrade()`.
הוסף **אסטרטגיה 4** (Delayed Accumulation) ב-`getAccumulationWindow()`.

### שלב 3 (מתקדם)
חבר את **אסטרטגיה 6** לרשת הנוירונים הקיימת לתמחור דינמי.

---

## שינויים ב-UI המומלצים

הוסף קופסה "Broker Revenue" לצד סטטיסטיקות הקיימות:

```html
<div class="broker-revenue-panel">
    <div class="revenue-row">
        <span>Micro-Spread Capture:</span>
        <span id="brokerMicroSpread">$0.00</span>
    </div>
    <div class="revenue-row">
        <span>Crossing Fees:</span>
        <span id="brokerCrossingFees">$0.00</span>
    </div>
    <div class="revenue-row">
        <span>External Markup:</span>
        <span id="brokerExternalMarkup">$0.00</span>
    </div>
    <div class="revenue-row total">
        <span>Total Broker Revenue:</span>
        <span id="brokerTotalRevenue">$0.00</span>
    </div>
</div>
```

---

## הערה רגולטורית

כל האסטרטגיות שמורות בגבולות **best execution**:
- הלקוח תמיד מקבל מחיר **טוב יותר** ממה שיקבל ישירות בבורסה
- גם עם micro-spread של $0.01/צד, הקונה חוסך $0.04/מניה לעומת ה-ask
- גם עם external markup של $0.02, הלקוח עדיין מקבל את שירות הביצוע

הברוקר לוקח חלק מה-"value created" — לא את כל האפסייד ולא על חשבון הלקוח.
