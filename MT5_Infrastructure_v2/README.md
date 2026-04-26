# MT5 Bridge Infrastructure v2

This folder contains a standalone, foundational integration between the Web Application and MetaTrader 5. It is designed to be easily portable and isolated from the main codebase to avoid conflicts with other development branches.

## Structure

- **MQL5/**: Contains the Expert Advisor (`MT5BridgeEA.mq5`) to be installed in MetaTrader 5.
- **Backend/**: Contains Java files (`MT5BridgeService.java`, `MT5BridgeController.java`) for the Spring Boot backend.
- **Frontend/**: Contains JavaScript files (`MT5ChartProvider.js`) for the UI integration.

## Installation Instructions

### 1. MetaTrader 5 (MQL5)
1. Open your MT5 Terminal.
2. Go to `File -> Open Data Folder`.
3. Navigate to `MQL5/Experts`.
4. Copy `MT5BridgeEA.mq5` into this folder.
5. In MT5, right-click "Experts" in the Navigator and click "Refresh".
6. Drag `MT5BridgeEA` onto any chart (e.g., EURUSD).
7. Ensure "Allow DLL imports" and "Allow WebRequest" are enabled in the EA settings.
8. The EA will start listening on port 5555 and monitoring the `Files` folder.

### 2. Backend (Java)
1. Copy the files from `Backend/` into your `com.brokerui.broker` package (or equivalent).
2. Ensure you have the following property in your `application.properties`:
   ```properties
   broker.mt5.base-path=C:\\Users\\<USER>\\AppData\\Roaming\\MetaQuotes\\Terminal\\<INSTANCE_ID>\\MQL5\\Files
   ```
   *Replace <USER> and <INSTANCE_ID> with your actual paths.*

### 3. Frontend (JS)
1. Import `MT5ChartProvider.js` into your chart components.
2. Use `fetchMT5Candles(symbol, interval)` to get data directly from MT5.
3. Use `sendMT5Trade(data)` to execute trades from the UI.

## Features & Solving Current Problems

### 1. Connection & Position Opening
- The `MT5BridgeController` provides a `/trade` endpoint that sends a signal via Socket to the MT5 EA.
- The EA receives the signal and executes the `trade.Buy()` or `trade.Sell()` command instantly.

### 2. MT5 Charts
- The charts will now pull data from the `/candles` endpoint, which communicates with MT5 via the File Bridge.
- This ensures the prices on the website match the prices on MT5 exactly.

### 3. Missing Stocks
- The `isMT5Symbol` method in the service allows you to check if a symbol exists in MT5.
- **Recommendation**: If a symbol is a Stock (not in MT5), the frontend should fallback to Binance or AlphaVantage data. If it is in MT5, it should use the MT5 data.

## Why a separate folder?
This allows you to work on this infrastructure without modifying the core files your partners are working on. Once they are ready, they can simply "plug in" these services by copying them into the main project.
