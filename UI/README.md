# Broker UI (UI_alfa)

Static, multi-page front-end for a brokerage-style trading platform. Built with **Vite** and plain HTML/CSS/JS (no framework). Includes **i18n** (English, Russian, Hebrew), **dark/light theme**, **toast notifications** (`toast.js`), **confirm dialogs** instead of `window.confirm` (`confirmModal.js`), and **ESLint** + **GitHub Actions** CI.

## Tech stack

- **Vite 5** — dev server, multi-page build, hashed assets
- **ESLint 9** — `src/js`, `scripts/`, `public/js`
- **GitHub Actions** — `npm ci` → `lint` → `build` on `main` / `develop`

## Project layout

| Path | Purpose |
|------|---------|
| `src/pages/` | HTML entry points (one file per screen) |
| `src/js/pages/` | Per-screen entry modules (one bundle per HTML page) |
| `src/js/lib/` | Shared modules: `i18n.js`, `toast.js`, `confirmModal.js`, `userProfile.js` |
| `src/styles/` | Global styles (`main.css`) |
| `src/index.html` | Redirects dev root to the landing page |
| `public/` | Unbundled static files; copied to `dist/` root |
| `public/js/` | Early scripts (`theme-init`, `lang-init`) served as `/js/...` |
| `public/images/` | Images referenced as `/images/...` |
| `public/locales.json` | Translation strings (imported into the bundle via `src/js/lib/i18n.js`) |
| `scripts/` | Node utilities (e.g. HTML patching) |
| `dist/` | Production output from `npm run build` (typically gitignored) |

Root config: `vite.config.js`, `eslint.config.js`, `package.json`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (port **3000**, opens landing) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | Run ESLint |

## Live Forex/Metals/Stocks candles (Finnhub)

Charts uses **Finnhub** for candles for:
- **Forex** (OANDA symbols like `EURUSD`)
- **Metals** (`XAUUSD`, `XAGUSD`, `XPTUSD`)
- **US Stocks** (`AAPL`, `MSFT`, `GOOGL`)

You must set an API token as an environment variable on the backend:

- **Get a free key**: https://finnhub.io/register
- **Windows PowerShell (current session):**

```powershell
$env:FINNHUB_API_KEY = "YOUR_TOKEN_HERE"
cd backend
.\mvnw.cmd spring-boot:run
```

- **Windows (persistent, user-level):**

```powershell
setx FINNHUB_API_KEY "YOUR_TOKEN_HERE"
```

Then open a **new** terminal and restart the backend.

## Internationalization

- Language is stored in `localStorage` (`broker-ui-lang`).
- **Single path:** `src/js/lib/i18n.js` imports `public/locales.json`, exposes `t()`, `applyI18n()`, `setLang()`. Each page module calls `applyI18n()` on load; `data-i18n` / `data-title-i18n` on `<body>` drive strings and the document title.
- `public/js/lang-init.js` runs early to set `document.documentElement.lang` and `dir` (RTL for Hebrew) before the bundle runs.
- `html.i18n-ready` is set at the end of `applyI18n()` so the body is shown only after strings are applied (see `main.css`).

## License / product

Internal / partner branding as configured in-repo. Adjust copy and assets for your deployment.

## Possible next steps

- Shared header/nav partial to reduce duplicated HTML across pages.
- Image formats (WebP/AVIF) and `srcset` for the landing hero assets.
- Light E2E tests (e.g. Playwright) for critical flows (login, demo → dashboard).
- Real API integration and auth (httpOnly cookies, CSRF) when a backend exists.
