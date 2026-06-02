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