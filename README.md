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

Double-click **`start-project.bat`** — it starts everything automatically:
- PostgreSQL (Docker)
- Spring Boot backend
- React frontend
- Neural Network AI server
- Coin Analyzer bot

To stop everything: double-click **`kill-server.bat`**

---

## Manual Start

### 1. Clone the repo

```bash
git clone https://github.com/FinalShnatiWork/UI_alfa.git
cd UI_alfa
git checkout develop
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

Wait for: `Started BrokerApplication in XX seconds`

> On first run, Flyway automatically runs all migrations (V1–V25)
> and populates the database with users, accounts, positions and trade history.

Backend URL: http://localhost:8080

### 4. Start the frontend

```bash
cd UI-react
npm install
npm run dev
```

Frontend URL: http://localhost:3001

### 5. Start AI services (optional but recommended)

Neural Network server (AI trade routing):
```bash
cd buysellmodel
node nn_server.js
```

Coin Analyzer bot (market analysis page):
```bash
cd coin-analyzer
npm start
```

### 6. Open in browser

- App: http://localhost:3001
- Admin Panel: Open `AdminDashboard_Local.html` from the project root in browser (or run `open-admin.bat`)
- Demo with two users: run `test-dual-users.bat`

---

## Demo Credentials

| Email | Password | Role |
|-------|----------|------|
| demo@broker.local | demo1234 | User |
| admin@gmail.com | admin1234 | Admin |

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
│           └── db/migration/       # Flyway SQL migrations (V1–V25)
├── UI-react/                       # React + TypeScript (Vite)
│   ├── src/
│   │   ├── pages/                  # Page components
│   │   ├── components/
│   │   ├── hooks/
│   │   └── locales.json            # i18n (EN / HE)
│   └── package.json
├── buysellmodel/                   # Neural Network AI routing server (Node.js, port 3005)
├── coin-analyzer/                  # Market analysis bot (Node.js, port 3008)
├── system_documentation/           # Auto-generated class/module docs
├── AdminDashboard_Local.html       # Admin panel (open directly in browser)
├── start-project.bat               # Start all services
├── kill-server.bat                 # Stop all services
├── build-prod.bat                  # Build production JAR
├── open-admin.bat                  # Open admin panel
└── test-dual-users.bat             # Demo: two traders + admin simultaneously
```

---

## Ports

| Service | Port |
|---------|------|
| Frontend (React) | 3001 |
| Backend (Spring Boot) | 8080 |
| PostgreSQL (Docker) | 5433 |
| Neural Network AI | 3005 |
| Coin Analyzer | 3008 |

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

## Trade Commission & AI Routing

Every order fill charges a dynamic commission based on symbol, quantity, and price (see `TradingFees.java`). A profit-safety guard caps total fees at 20% of gross profit on winning trades.

The AI advisor (`NNPredictorClient`) routes each order:
- **INTERNAL (B-Book)** — retail/noise trade, platform acts as counterparty, capturing spread and commission.
- **EXTERNAL (A-Book)** — high-probability/toxic trade, forwarded to MetaTrader 5 bridge to hedge externally.

Admin panel → **Dashboard** shows: Commission Collected, Fees Saved (Internal), B-Book Client Losses, Total Broker Profit.

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
