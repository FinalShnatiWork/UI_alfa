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

> **First time setup?** Run `install-requirements.bat` to install Node.js and Java automatically via winget.

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
git checkout feat/unify-react-ts
```

### 2. Start the database (Docker)

```bash
cd backend
docker compose up -d
```

### 3. Start the backend

```bash
cd backend
mvn spring-boot:run
```

Wait for: `Started BackendApplication in XX seconds`

> On first run, Flyway applies migrations V1–V33.
> V32 adds netting (internal matches, the computer accounts, legacy routing).
> V33 restates the venue fee an internal match saved.
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
- Admin Hub: http://localhost:3001/admin (or `open-admin.bat`)
- Netting console: http://localhost:3001/admin/netting
- Demo with two users: run `test-dual-users.bat`

---

## Demo Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@gmail.com | 1234 | Admin |
| netting.a@broker.local | Netting123! | User |
| netting.b@broker.local | Netting123! | User |

`demo@broker.local` is in the database, but the password is the one already stored there. A brand-new empty database creates that user with `demo123` only when the email is missing. `admin1234` and `demo1234` are not the passwords. The admin password above is the default (`BROKER_ADMIN_PASSWORD`, otherwise `1234`) and it is what this database accepts. Admin pages do not ask for a login: they are limited to localhost.

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
│           └── db/migration/       # Flyway SQL migrations (V1–V33)
├── UI-react/                       # React + TypeScript (Vite) — trading UI and admin hub
│   ├── src/
│   │   ├── pages/                  # Page components (incl. pages/admin)
│   │   ├── components/
│   │   ├── hooks/
│   │   └── locales.json            # i18n (EN / RU / HE)
│   └── package.json
├── buysellmodel/                   # NN training (Node). Inference is proxied through Spring.
├── scripts/                        # Typed netting e2e (`npx tsx scripts/netting_e2e.ts`)
├── system_documentation/           # Architecture notes
├── start-project.bat               # Start core services
├── kill-server.bat                 # Stop all services
├── build-prod.bat                  # Build production JAR
├── open-admin.bat                  # Open React admin hub
└── test-dual-users.bat             # Demo: two traders + admin simultaneously
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
- Whatever is left goes to the external market (MT5 if connected). A marketable LIMIT first waits `limit-wait-ms` (8 s) for an internal counterparty.
- The broker **never keeps a side**: it earns commission + the external fees it saved. The neural network runs in **shadow mode** only (recorded, never decides).
- Settings: `broker.netting.*` in `backend/src/main/resources/application.yml` (turn the computer off with `sim.enabled: false`).

Admin Hub → **Overview** shows profit (the live tariff minus venue cost, plus credit interest collected when a debt is paid off), client cash without the computer, and **At the venue** (the dollar size of contracts still held outside in the broker's name, also without the computer). **Netting** shows trade cash, the book, and the invariants. House inventory must stay flat.

**Testing it** (the backend must be running for the live parts):

| Double-click | What it does |
|---|---|
| `run-netting-tests.bat` | model + feature check, Java engine tests, then the 16 live scenarios (PASS/FAIL + report in `reports/`) |
| `run-netting-visual.bat` | opens the React netting console at http://localhost:3001/admin/netting |

The test users `netting.a@broker.local` / `netting.b@broker.local` (password `Netting123!`) are created automatically on the first run.

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
