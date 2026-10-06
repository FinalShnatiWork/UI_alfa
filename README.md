# UI Alfa — Broker Trading Platform

Full-stack trading platform: Spring Boot (Java) + React (TypeScript) + PostgreSQL (Docker) + Neural Network AI routing.

---

## Requirements

| Tool | Version | Download |
|------|---------|----------|
| Java JDK | 17+ | https://adoptium.net |
| Maven | 3.8+ | https://maven.apache.org |
| Node.js | 18+ | https://nodejs.org |
| Docker Desktop | latest | https://docker.com/products/docker-desktop |

Maven does not have to be installed separately: `backend/mvnw.cmd` downloads it.

---

## Quick Start (Recommended)

Double-click **`start-project.bat`** — it starts:
- PostgreSQL (Docker)
- Spring Boot backend (trading, netting, technical analysis)
- React frontend (trading UI + admin hub)

The neural-network trainer on port 3005 is optional (shadow advisor). Technical analysis no longer uses a separate Node server.

To stop everything: double-click **`kill-server.bat`**

---

## Manual Start

### 1. Clone the repo

```bash
git clone https://github.com/FinalShnatiWork/UI_alfa.git
cd UI_alfa
```

`main` is the stable branch, `develop` is the working one.

### 2. Start the database (Docker)

```bash
cd backend
docker compose up -d
```

### 3. Start the backend

```bash
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=postgres"
```

Wait for: `Started BackendApplication in XX seconds`

> On first run, Flyway applies migrations V1–V36.
> V32 adds netting (internal matches, the computer accounts, legacy routing).
> V33 restates the venue fee an internal match saved.
> V34 lets a close wait on the internal book, V35 sets the SOL contract size to 1 coin,
> V36 allows only one working close order per position.
> The seed data is users, accounts, positions, and trade history.

Backend URL: http://localhost:8080

### 4. Start the frontend

```bash
cd UI-react
npm install
npm run dev
```

Frontend URL: http://localhost:3001

### 5. Optional: neural network trainer

Used only for `/api/nn/predict` shadow advice. Training and weights stay in `buysellmodel`.

```bash
cd buysellmodel
node nn_server.js
```

### 6. Open in browser

- App: http://localhost:3001
- Admin Hub: http://localhost:3001/#/admin
- Netting console: http://localhost:3001/#/admin/netting

The app uses hash routing, so every page address has `/#/` in it.

The GitHub Pages copy (https://finalshnatiwork.github.io/UI_alfa/) has no server behind it: it runs a demo mode inside the browser, with its own fake data and no admin.

---

## Demo Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@gmail.com | 1234 | Admin |
| netting.a@broker.local | Netting123! | User |
| netting.b@broker.local | Netting123! | User |

- **Admin.** An empty database creates the admin with `1234`. A password changed later in Settings survives restarts. To reset it, start the backend with `BROKER_ADMIN_PASSWORD` set.
- **Admin pages** need an ADMIN login and are also limited to requests from this computer.
- **`demo@broker.local`** gets `demo123` only on an empty database. An existing database keeps its stored password.
- **The two netting users** are created by the netting test on its first run.

---

## Project Structure

```
UI_alfa/
├── backend/                        # Spring Boot application
│   ├── docker-compose.yml          # PostgreSQL in Docker (port 5433)
│   ├── pom.xml                     # Maven build config
│   └── src/main/
│       ├── java/com/brokerui/      # Java source code
│       └── resources/
│           ├── application.yml
│           └── db/migration/       # Flyway SQL migrations (V1–V36)
├── UI-react/                       # React + TypeScript (Vite) — trading UI and admin hub
│   ├── src/
│   │   ├── pages/                  # Page components (incl. pages/admin)
│   │   ├── components/
│   │   ├── hooks/
│   │   └── locales.json            # i18n (EN / RU / HE)
│   └── package.json
├── buysellmodel/                   # NN training (Node). Inference is proxied through Spring.
├── scripts/                        # Netting e2e test and visual demo (TypeScript)
├── system_documentation/           # Architecture notes
├── .github/workflows/ci.yml        # CI: frontend build + backend tests on every push
├── start-project.bat               # Start core services
├── kill-server.bat                 # Stop all services
└── deploy-site.bat                 # Publish the browser-only demo to GitHub Pages
```

---

## Ports

| Service | Port |
|---------|------|
| Frontend (React) | 3001 |
| Backend (Spring Boot) | 8080 |
| PostgreSQL (Docker) | 5433 |
| Neural Network trainer (optional) | 3005 |

---

## Margin Credit Line

When a trade needs more cash than the account balance, the backend automatically borrows the shortfall from a fixed credit line (similar to Bybit's Unified Margin).

| Parameter | Value |
|-----------|-------|
| Credit limit | $10,000 per account |
| Interest rate | 0.5% per day on borrowed balance |
| Margin call | Warning when margin level drops below 110% |
| Liquidation | Positions force-closed when margin level drops below 100% |

Implementation: `MarginLoanService.java` — Admin panel → **Credit Line** tab.

---

## Trade Commission & Netting

Every fill charges a commission (`TradingFees.java`). Crypto is 0.20% of notional from the client and 0.10% to the venue on the quantity that leaves. Forex and metals are $7 per lot from the client and $3.50 per lot to the venue. An internal match keeps both client commissions and pays the venue nothing. On a winning close, a safety guard can cap the client commission at 20% of the gross profit.

**Netting (client vs client / client vs computer)** — see `buysellmodel/NETTING_IMPLEMENTATION_PLAN.md`:
- Every order first tries to **cross internally at the mid price** against an opposite order (another client, or "the computer" — simulated clients that quote around the mid). Both sides get the mid instead of paying the spread.
- A cross is allowed only if the buyer accepts ≥ mid and the seller accepts ≤ mid (NBBO), never with yourself, never computer-vs-computer.
- Whatever is left goes to the external market (MT5 if connected). A close or a marketable LIMIT first waits `limit-wait-ms` (5 s) for an internal counterparty.
- The broker **never keeps a side**: it earns commission + the external fees it saved. The neural network runs in **shadow mode** only (recorded, never decides).
- Settings: `broker.netting.*` in `backend/src/main/resources/application.yml` (turn the computer off with `sim.enabled: false`).

Admin Hub → **Overview** shows profit (the live tariff minus venue cost, plus credit interest collected when a debt is paid off), client cash without the computer, and **At the venue** (the dollar size of contracts still held outside in the broker's name, also without the computer). **Netting** shows trade cash, the book, and the invariants. House inventory must stay flat.

**Testing it** (the backend must be running for the live parts):

| Command | What it does |
|---|---|
| `cd backend` then `.\mvnw.cmd test` | Java unit tests: netting engine, fees, close math, credit line, stop validation |
| `cd scripts` then `npm install` and `npx tsx netting_e2e.ts` | the live netting scenarios against the running backend (PASS/FAIL) |
| open http://localhost:3001/#/admin/netting | the netting console in the admin hub |

The test users `netting.a@broker.local` / `netting.b@broker.local` (password `Netting123!`) are created automatically on the first run.

## Trading Safeguards

- Every order opens a confirmation window with the volume, the expected price, margin, commission and the cash left after the trade. Closing a position asks too. **Settings → Trading → One-click trading** turns both off.
- Stop Loss and Take Profit must sit on the right side of the price (BUY: SL below, TP above; SELL: the opposite). The form and the server both check it.
- A close order cannot be cancelled once it is sent, whether it came from the client, a stop, a take profit or a liquidation.
- Only the 14 instruments on the Charts page can be traded. Volume is 0.01 to 100 lots in steps of 0.01.
- A pending LIMIT or STOP order reserves margin and commission, like a market order. What the fill does not use is returned.
- Cash requested for withdrawal cannot be spent on new trades while the request is pending.
- A stop loss, take profit or liquidation tells the client why the position was closed.
- When a credit-line debt is fully repaid, the interest clock stops; a new debt waits a full day before its first charge.

---

## Transfer Data Between Developers

### Export
```powershell
docker exec broker_ui_db pg_dump -U broker broker_ui > db_dump.sql
```

### Import
```powershell
docker compose up -d
docker exec -i broker_ui_db psql -U broker -d broker_ui < db_dump.sql
```

---

## Common Problems

### Connection refused: localhost:5433
Docker is not running.
```bash
docker compose up -d
```

### Port 8080 already in use
```powershell
netstat -ano | findstr :8080
taskkill /PID <NUMBER> /F
```

### Flyway migration failed
Reset the database (WARNING: deletes all data):
```bash
cd backend
docker compose down -v
docker compose up -d
```

### JAVA_HOME is not set
Install JDK 17+ from https://adoptium.net and add `JAVA_HOME` to System Environment Variables.

### npm: command not found
Install Node.js 18+ from https://nodejs.org
