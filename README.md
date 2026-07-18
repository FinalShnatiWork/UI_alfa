# UI Alfa — Broker Trading Platform

Full-stack trading platform: Spring Boot (Java) + React (TypeScript) + PostgreSQL (Docker).

---

## Requirements

| Tool | Version | Download |
|------|---------|----------|
| Java JDK | 17+ | https://adoptium.net |
| Maven | 3.8+ | https://maven.apache.org |
| Node.js | 18+ | https://nodejs.org |
| Docker Desktop | latest | https://docker.com/products/docker-desktop |

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/FinalShnatiWork/UI_alfa.git
cd UI_alfa
git checkout session/jun02-improvements
```

### 2. Start the database (Docker)

```bash
cd backend
docker compose up -d
```

Wait until the container is healthy:
```bash
docker ps
# broker_ui_db should show (healthy)
```

### 3. Start the backend

```bash
cd backend/backend
mvn spring-boot:run
```

Wait for: `Started BrokerApplication in XX seconds`

> On first run, Flyway automatically runs all migrations V1-V14
> and populates the database with users, accounts, positions and trade history.
> This takes about 10-15 seconds.

Backend URL: http://localhost:8080

### 4. Start the frontend

```bash
cd UI-react
npm install
npm run dev
```

Frontend URL: http://localhost:3001

### 5. Open in browser

- App: http://localhost:3001
- Admin Panel: Open AdminDashboard_Local.html from the project root in browser

---

## Margin Credit Line (demo)

When a BUY/SELL order needs more cash than the account balance holds, the backend
automatically borrows the shortfall from a fixed credit line instead of rejecting the trade
(similar to Bybit's Unified Margin). Rules for this demo:

| Parameter | Value |
|-----------|-------|
| Credit limit | $10,000 per account (fixed) |
| Interest rate | 0.5% per day on the borrowed balance, charged once every 24h |
| Margin call | UI warning when margin level (equity / debt) drops below 110% |
| Liquidation | Open positions are force-closed automatically when margin level drops below 100% |

Implementation: `MarginLoanService.java` (borrow/repay logic + two `@Scheduled` jobs).
Admin panel → **Credit Line** tab shows the full borrow/repay/interest/liquidation ledger,
plus buttons to trigger the interest and liquidation jobs immediately (for testing, since
the interest job normally waits 24h between charges per account).

---

## Trade Commission (real money, tied to the AI netting model)

Every order fill — market open, limit/stop fill, manual close, or auto SL/TP close — now
charges the client a flat **$1.50 commission**, debited straight from the trading account
balance (see `TradingFees.java`). This is real money movement, not a display-only number.

The commission amount deliberately matches the exchange-fee assumption already used by the
netting-broker AI advisor (`NNPredictorClient` / `nn_route_recommendation`), so the economics
line up cleanly without touching the buy/sell matching logic itself:

- The client pays the same $1.50 commission regardless of how the order was routed.
- If the AI advisor matched the order **internally**, the platform pays no exchange fee, so
  the whole commission is pure profit.
- If the order was routed **externally** (MT5 bridge), the platform is modeled as paying the
  same $1.50 to the liquidity provider, so that trade nets to roughly $0 profit for the
  platform — it only covers the AI's own real-world cost of routing out.

Where this shows up:
- **History page**: every closed trade shows its commission and a "Net after fees" total.
- **Admin panel → Dashboard**: `Commission Collected` (real revenue), `Fees Saved (Internal)`
  (real profit from AI-matched trades), `External Fees Paid` (modeled cost), and
  `Net Platform Profit` (the real bottom line) are now computed from actual `commission`
  values on each order instead of a flat assumption.
- **Admin panel → Trades / Accounts**: per-trade commission column and each account's
  lifetime `commissionPaidTotal`.

Order placement math (margin/reservation checks) already accounts for the commission on top
of the required margin, so a trade can still trip `credit_limit_exceeded` if the extra $1.50
would push the account past the $10,000 credit line — same shortfall-covering path as margin.

---

## Demo Data (auto-loaded on first startup via Flyway V14)

No manual import needed. All data loads automatically.

| Email | Password | Role | Balance |
|-------|----------|------|---------|
| demo@broker.local | demo1234 | User | 100000 USD DEMO |
| admin@gmail.com | admin1234 | Admin | — |
| 12@gmail.com | (set by owner) | User | ~127000 USD DEMO |
| 7@gmail.com | (set by owner) | User | ~100000 USD DEMO |

---

## Transfer Data Between Developers

### Export (on source machine)

Windows:
```powershell
docker exec broker_ui_db pg_dump -U broker broker_ui > db_dump.sql
```

Mac/Linux:
```bash
docker exec -i broker_ui_db pg_dump -U broker broker_ui > db_dump.sql
```

Send db_dump.sql via Telegram, Google Drive, USB, etc.

### Import (on partner machine)

1. Start the database container first:
```bash
docker compose up -d
```

2. Import the dump:

Windows:
```powershell
docker exec -i broker_ui_db psql -U broker -d broker_ui < db_dump.sql
```

Mac/Linux:
```bash
docker exec -i broker_ui_db psql -U broker -d broker_ui < db_dump.sql
```

Note: if backend ran before (tables exist), you may see duplicate key warnings - that is normal.

---

## Common Problems

### Connection refused: localhost:5433
Docker is not running or the container is stopped.
```bash
docker compose up -d
# or:
docker start broker_ui_db
```

### Port 8080 already in use
Windows:
```powershell
netstat -ano | findstr :8080
taskkill /PID <NUMBER> /F
```

Mac/Linux:
```bash
lsof -ti:8080 | xargs kill -9
```

### Flyway migration failed: relation already exists
Reset the database (WARNING: deletes all data):
```bash
cd backend
docker compose down -v
docker compose up -d
```
Restart backend after.

### JAVA_HOME is not set
Install JDK 17+ from https://adoptium.net
Windows: add JAVA_HOME to System Environment Variables.

### npm: command not found
Install Node.js 18+ from https://nodejs.org

### Docker Desktop not starting on Windows
1. Enable virtualization in BIOS (Intel VT-x / AMD-V)
2. WSL2: run in PowerShell as Admin: wsl --install
3. Restart after installing Docker

---

## Project Structure

```
UI_alfa/
├── backend/
│   ├── docker-compose.yml          # PostgreSQL in Docker (port 5433)
│   └── backend/
│       └── src/main/
│           ├── java/com/brokerui/  # Spring Boot application
│           └── resources/
│               ├── application.yml
│               └── db/migration/   # Flyway SQL migrations V1-V14
├── UI-react/                       # React + TypeScript (Vite)
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── locales.json            # i18n (EN / RU / HE)
│   └── package.json
└── AdminDashboard_Local.html       # Admin panel (open directly in browser)
```

---

## Ports

| Service | Port |
|---------|------|
| Frontend (React) | 3001 |
| Backend (Spring Boot) | 8080 |
| PostgreSQL (Docker) | 5433 |