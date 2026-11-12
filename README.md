# UI Alfa — Broker Trading Platform

Full-stack trading platform: Spring Boot (Java) + React (TypeScript) + PostgreSQL (Docker). A neural network records a suggestion after a trade. It does not choose where the order goes.

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
- Two copies of the Spring Boot backend, on ports 8081 and 8082, and Nginx on port 8080 in front of them
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

`main` is the stable branch. `develop-new` is the working branch: two backend copies behind Nginx.

### 2. Start the database (Docker)

```bash
cd backend
docker compose up -d
```

### 3. Start the two backend copies and Nginx

```bash
cd backend
powershell -ExecutionPolicy Bypass -File .\start-two-copies.ps1
```

The script builds the jar, starts copy "a" on 8081, waits until it answers, starts copy "b" on 8082, then starts Nginx on 8080. The site keeps sending `/api` to 8080. Logs are in `backend/target/lb-logs/`.

Wait until the script prints `Nginx is up on 8080`.

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

Used only for shadow advice recorded after each netting decision. Training and weights stay in `buysellmodel`.

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

## Two Backend Copies Behind Nginx (Load Balancing)

This is how the project runs. Two copies of the same backend share one database, on 8081 and 8082, and Nginx sits on 8080 in front of them. The frontend does not change, because it still sends `/api` to 8080.

```
Browser ──> Vite :3001 ──/api──> Nginx :8080 ──┬──> backend copy "a" :8081 ──┐
                                               └──> backend copy "b" :8082 ──┴──> PostgreSQL :5433
```

### Start

1. Start the database: `cd backend` and then `docker compose up -d`.
2. Make sure nothing else listens on 8080, 8081 or 8082.
3. Start both copies and Nginx: `powershell -ExecutionPolicy Bypass -File .\start-two-copies.ps1` (from `backend`).
   - The script builds the jar, starts copy "a", waits until it answers, then starts copy "b", then Nginx.
   - Logs go to `backend/target/lb-logs/`.
   - `-NoBuild` skips the build when the jar is already fresh.
4. Start the frontend as usual: `cd UI-react` and then `npm run dev`.
5. Stop everything: `powershell -ExecutionPolicy Bypass -File .\start-two-copies.ps1 -Stop`.

The same by hand:

```bash
cd backend
.\mvnw.cmd -DskipTests package
java -jar target\backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=postgres --server.port=8081 --broker.node-name=a
java -jar target\backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=postgres --server.port=8082 --broker.node-name=b
docker compose --profile lb up -d
```

Start copy "b" only after copy "a" prints `Started BackendApplication`, so the database migrations are checked once.

### How it works

1. **Routing.** Nginx (`backend/nginx/nginx.conf`) sends requests without a session to both copies in turn.
2. **Sessions stay on their copy.** Sign-in sessions are kept in the memory of the copy that created them. With `--broker.node-name=a` every session id ends with `.a`, and Nginx reads that ending from the `X-Session-Id` header and sends the tab back to copy "a".
3. **Health check.** If a copy does not answer, Nginx marks it down for 10 seconds and uses the other copy. Requests without a session continue at once. A tab that was signed in on the stopped copy is asked to sign in again, and the new session is created on the working copy.
4. **Background jobs run once.** Order execution, SL/TP, liquidation, interest and the simulated liquidity run only on the copy that holds a PostgreSQL advisory lock (`SchedulerLeader`). If that copy stops, the database releases the lock and the other copy takes over within a few seconds. So interest is never charged twice and a position is never liquidated twice.
5. **Bans.** A ban or a deleted user ends that user's sessions on both copies within 5 seconds.
6. **Which copy answered.** Every response through Nginx has an `X-Upstream` header with the copy's port.
7. **Admin.** Admin pages still work only from this computer: Nginx runs in Docker on the same machine and reaches the copies from 127.0.0.1.

### Demo: the service keeps working when one copy stops

1. Sign in on http://localhost:3001 in two browsers with two different users. In DevTools → Network, the `X-Upstream` header shows `:8081` for one tab and `:8082` for the other (sign in again if both landed on the same copy).
2. Refresh a tab. It stays on the same copy and stays signed in.
3. Stop one copy: find its process with `netstat -ano | findstr :8081` and end it in Task Manager, or close its window.
4. The site keeps working. The tab on the other copy does not notice anything. The tab on the stopped copy shows the sign-in page, and after signing in it continues on the working copy.
5. In `target/lb-logs/copy-b.log` the line `This copy now runs the broker schedulers` shows that the background jobs moved to the working copy.
6. Start the stopped copy again with its `java -jar ...` line. Nginx starts sending new sessions to it within 10 seconds.

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
│   ├── docker-compose.yml          # PostgreSQL in Docker (port 5433); Nginx with --profile lb
│   ├── nginx/nginx.conf            # Load balancer for the two-copy demo
│   ├── start-two-copies.ps1        # Starts / stops two backend copies and Nginx
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
| Load-balancing demo: Nginx / backend copy "a" / copy "b" | 8080 / 8081 / 8082 |
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
On startup the server checks that each migration file still matches the copy that was applied. A changed old file, or a file that was applied and then removed, stops the start. The usual fix is to reset the database. That deletes every account and trade, then the files are applied again from the beginning:
```bash
cd backend
docker compose down -v
docker compose up -d
```
Version 26 was corrected after it had already run. The result of the two wordings is the same. If the error names version 26, this keeps the data and only updates the stored fingerprint:
```powershell
docker exec broker_ui_db psql -U broker -d broker_ui -c "UPDATE flyway_schema_history SET checksum = 1502269684 WHERE version = '26';"
```

### JAVA_HOME is not set
Install JDK 17+ from https://adoptium.net and add `JAVA_HOME` to System Environment Variables.

### npm: command not found
Install Node.js 18+ from https://nodejs.org
