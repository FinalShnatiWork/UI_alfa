import os
import glob
import re

backend_dir = r'c:\Users\david\.gemini\antigravity-ide\scratch\UI_alfa\backend\backend\src\main\java'
frontend_dir = r'c:\Users\david\.gemini\antigravity-ide\scratch\UI_alfa\UI-react\src'

out = []
out.append('================================================================================')
out.append('      BROKER PLATFORM - COMPREHENSIVE ARCHITECTURE & FUNCTION MANUAL')
out.append('================================================================================')
out.append('This manual provides an in-depth, structured breakdown of ALL classes, services,')
out.append('controllers, repositories, components, and hooks across the system.')
out.append('Language: English | System: Trading Brokerage Platform\n')

# -----------------------------------------------------------------------------
# DETAILED MANUAL HAND-CRAFTED DICTIONARY FOR KEY SERVICES & CONTROLLERS
# -----------------------------------------------------------------------------

CLASS_DESCRIPTIONS = {
    'BrokerApiController': 'Primary REST API Controller handling client trading operations, position lifecycle, deposits/withdrawals, and overview financial metrics.',
    'OrderExecutionService': 'Core background execution service running scheduled ticks (every 2s) to execute pending limit/stop orders, trigger SL/TP auto-closes, and settle trade fills.',
    'MarginLoanService': 'Credit line and leverage management service. Handles shortfall auto-loans, debt repayments, daily interest accruals, and liquidation checks.',
    'TradingFees': 'Central fee calculation utility. Computes dynamic commissions (0.0025% with caps), applies broker bid/ask spreads (0.015%), and updates lifetime fee totals.',
    'MarketPriceService': 'Market data aggregator connecting to Binance, Finnhub, and Yahoo Finance to stream live prices and historical candles.',
    'MT5IntegrationService': 'MetaTrader 5 terminal integration bridge. Writes orders to local bridge files and checks terminal connectivity.',
    'NNPredictorClient': 'Client connector to internal Neural Network AI prediction server for evaluating trade win/loss probabilities.',
    'AdminTradeController': 'Administrator management controller providing REST endpoints for reviewing all platform trades, accounts, credit debt, and running manual batch tasks.',
    'AdminUserController': 'Administrator user management controller for viewing platform users, approving/rejecting KYC compliance cases, and toggling user roles.',
    'AuthApiController': 'Authentication controller handling user registration, login authentication, password hashing, and session tokens.',
    'AuthBootstrap': 'Application runner that initializes default asset symbols, admin accounts, demo accounts, and initial seed balances on backend startup.',
    'AuditLogService': 'Compliance audit logging service capturing user actions, administrative interventions, and IP addresses into database logs.',
    'YahooFinanceService': 'Market data provider fetching historical stock and forex price candles from Yahoo Finance API.',
    'FinnhubMarketService': 'Market data provider fetching real-time equity quotes from Finnhub REST API.',
    'BinancePriceService': 'Market data provider connecting to Binance public WebSocket/REST for real-time cryptocurrency tickers.',
    'BinanceService': 'Low-level HTTP client for querying Binance market depth and price tickers.',
    'LocalhostOnlyFilter': 'Security filter restricting access to sensitive administrative endpoints exclusively to localhost connections.',
    'SecurityConfig': 'Spring Security configuration defining CORS policies, password encoders (BCrypt), and public vs protected endpoint filters.',
    'SpaRoutingConfig': 'Spring MVC web configuration ensuring Single Page Application (SPA) HTML5 routing routes unknown URLs back to index.html.',
}

# -----------------------------------------------------------------------------
# BACKEND PARSING ENGINE
# -----------------------------------------------------------------------------
out.append('================================================================================')
out.append('                            PART 1: BACKEND (JAVA)')
out.append('================================================================================\n')

java_files = sorted(glob.glob(os.path.join(backend_dir, '**', '*.java'), recursive=True))

for jf in java_files:
    rel_path = os.path.relpath(jf, backend_dir)
    with open(jf, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    class_match = re.search(r'public\s+(class|interface|enum|record)\s+(\w+)', content)
    if not class_match:
        class_match = re.search(r'(class|interface|enum|record)\s+(\w+)', content)
        
    kind = class_match.group(1).upper() if class_match else 'CLASS'
    cname = class_match.group(2) if class_match else os.path.basename(jf).replace('.java', '')
    
    pkg_match = re.search(r'package\s+([\w\.]+);', content)
    pkg = pkg_match.group(1) if pkg_match else ''
    
    out.append(f'[{kind}] {pkg}.{cname}')
    out.append(f'Source File: src/main/java/{rel_path.replace(os.sep, "/")}')
    
    # Class description
    c_desc = CLASS_DESCRIPTIONS.get(cname, f'Backend {kind.lower()} component responsible for managing {cname} domain logic.')
    out.append(f'Overview: {c_desc}')
    out.append('-' * 80)
    
    # Check if Entity or Repository or Service
    is_entity = '@Entity' in content or '@Table' in content
    is_repo = 'Repository' in cname or 'extends JpaRepository' in content
    
    lines = content.split('\n')
    methods = []
    getters_setters = []
    
    method_pattern = re.compile(
        r'(?:@\w+(?:\([^)]*\))?\s+)*(public|protected|private|static|\s)+([\w<>\[\]\?]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*\{'
    )
    interface_method_pattern = re.compile(r'([\w<>\[\]\?]+)\s+(\w+)\s*\(([^)]*)\)\s*;')

    for line in lines:
        line_s = line.strip()
        if line_s.startswith('//') or line_s.startswith('*') or line_s.startswith('import ') or line_s.startswith('package '):
            continue
            
        if is_repo:
            im = interface_method_pattern.search(line_s)
            if im and not im.group(2).startswith('default'):
                mname = im.group(2)
                args = im.group(3).strip()
                rtype = im.group(1)
                methods.append((mname, args, rtype, f'Custom Spring Data JPA repository query executing: {mname}.'))
                continue

        m = method_pattern.search(line)
        if m:
            mname = m.group(3)
            args = m.group(4).strip()
            rtype = m.group(2)
            
            if mname in ['if', 'for', 'while', 'switch', 'catch', 'super', 'this']:
                continue
                
            if (mname.startswith('get') or mname.startswith('set') or mname.startswith('is')) and (is_entity or 'Dto' in cname or 'Request' in cname or 'Response' in cname):
                getters_setters.append(mname)
            else:
                # Meaningful method description
                low = mname.lower()
                if mname == cname:
                    purp = f'Constructor initializing {cname} instance.'
                elif 'overview' in low:
                    purp = 'Retrieves overall financial state (balance, equity, margin, fees, credit) of primary account.'
                elif 'order' in low and 'create' in low:
                    purp = 'Validates margin, applies spread, charges commission, checks credit debt, and opens position/order.'
                elif 'close' in low and 'position' in low:
                    purp = 'Settles closed trade PnL, applies spread + capped commission, returns margin, and deletes position.'
                elif 'pending' in low:
                    purp = 'Scans pending limit/stop orders and executes fills when market price conditions are satisfied.'
                elif 'shortfall' in low or 'borrow' in low:
                    purp = 'Automatically extends credit line loan when account balance is insufficient for trade margin.'
                elif 'commission' in low:
                    purp = 'Calculates dynamic 0.0025% trade commission with tier minimums and caps.'
                elif 'spread' in low:
                    purp = 'Applies broker bid/ask spread markup (0.015%) to raw execution price.'
                elif 'interest' in low:
                    purp = 'Calculates and charges daily interest on all indebted accounts (borrowedBalance > 0).'
                elif 'liquidation' in low:
                    purp = 'Monitors indebted accounts and executes liquidation if margin level drops below safety limit.'
                else:
                    purp = f'Executes operational logic for {mname}.'
                
                methods.append((mname, args, rtype, purp))
                
    if is_entity or getters_setters:
        out.append(f'  * Entity Attributes & Data Accessors:')
        out.append(f'    Contains fields, getters, setters, and constructors ({len(getters_setters)} property mutators).\n')
        
    for mname, args, rtype, purp in methods:
        out.append(f'  * Function: {mname}({args}) -> {rtype}')
        out.append(f'    Description: {purp}')
        out.append('')
    out.append('')

# -----------------------------------------------------------------------------
# FRONTEND PARSING ENGINE
# -----------------------------------------------------------------------------
out.append('================================================================================')
out.append('                            PART 2: FRONTEND (REACT & TS)')
out.append('================================================================================\n')

FRONTEND_DESCRIPTIONS = {
    'PositionsPage.tsx': 'User UI page displaying active trading positions, live PnL updates, and manual position closure controls.',
    'HistoryPage.tsx': 'User UI page displaying trade execution history, entry/close prices, realized PnL, and charged commissions.',
    'FinancePage.tsx': 'User UI page for account financial operations: deposits, withdrawals, credit line status, and transaction history.',
    'DashboardHeader.tsx': 'Top navigation header displaying real-time balance, equity, margin level, and user profile controls.',
    'NNAdvisorPanel.tsx': 'AI Neural Network advisor widget presenting live directional signals and probability confidence metrics.',
    'PreferenceSync.tsx': 'Background component synchronizing user theme (dark/light) and language settings with the backend DB.',
    'ProtectedRoute.tsx': 'Security wrapper component restricting route access to authenticated users.',
    'useAuth.tsx': 'Global authentication hook managing user tokens, login/logout context, and session persistence.',
    'useNotificationsWs.ts': 'WebSocket hook receiving real-time push alerts for trade fills, SL/TP triggers, and margin calls.',
    'AdminDashboard_Local.html': 'Standalone HTML/JS Admin Panel for platform monitoring, B-Book loss metrics, and live transactions feed.'
}

fe_files = sorted(glob.glob(os.path.join(frontend_dir, '**', '*.ts*'), recursive=True))

for ff in fe_files:
    rel_path = os.path.relpath(ff, frontend_dir)
    cname = os.path.basename(ff)
    with open(ff, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    out.append(f'[FRONTEND MODULE] {cname}')
    out.append(f'Source File: src/{rel_path.replace(os.sep, "/")}')
    f_desc = FRONTEND_DESCRIPTIONS.get(cname, f'React component/utility module handling {cname} user interface.')
    out.append(f'Overview: {f_desc}')
    out.append('-' * 80)
    
    # Extract functions
    func_pattern = re.compile(
        r'(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>'
    )
    matches = func_pattern.findall(content)
    funcs = sorted(list(set([m[0] or m[1] for m in matches if (m[0] or m[1])])))
    
    if not funcs:
        out.append('  * Exports Type Definitions / Interfaces / Configuration Constants.\n')
    else:
        for fn in funcs:
            if fn.startswith('use'):
                purp = f'Custom React hook managing state and lifecycle for {fn}.'
            elif fn.startswith('handle') or fn.startswith('on'):
                purp = f'User event handler function triggered on {fn}.'
            elif fn.startswith('fetch') or fn.startswith('get') or fn.startswith('load'):
                purp = f'Asynchronously fetches data or API payload for {fn}.'
            elif fn.startswith('format') or fn.startswith('fmt'):
                purp = f'Formats raw numerical values (currency, PnL, leverage) for display.'
            elif fn[0].isupper():
                purp = f'React Functional Component rendering {fn} UI.'
            else:
                purp = f'Helper utility executing {fn}.'
                
            out.append(f'  * Function / Component: {fn}()')
            out.append(f'    Description: {purp}')
        out.append('')

# -----------------------------------------------------------------------------
# PART 3: ADMIN DASHBOARD
# -----------------------------------------------------------------------------
out.append('\n================================================================================')
out.append('                      PART 3: ADMIN DASHBOARD (JS ENGINE)')
out.append('================================================================================\n')

out.append('[ADMIN DASHBOARD] AdminDashboard_Local.html')
out.append('Source File: AdminDashboard_Local.html')
out.append('Overview: Comprehensive Administrator Control Panel for real-time monitoring of broker revenues, B-Book client losses, transactions, accounts, and risk controls.')
out.append('-' * 80)

admin_funcs = [
    ('connectToServer', 'Validates health status and connects to local backend REST API.'),
    ('refreshData', 'Polls backend endpoints (/api/admin/accounts, /trades, /transactions) to refresh UI tables.'),
    ('renderOverviewStats', 'Calculates Total Broker Profit, B-Book Client Losses, Commissions Collected, and Equity.'),
    ('renderAccountsTable', 'Renders table of all trading accounts showing balance, leverage, debt, and total commission.'),
    ('renderTransactionsTable', 'Displays complete ledger of Deposits, Withdrawals, and COMMISSION charges with color coding.'),
    ('renderTradesTable', 'Renders table of all placed trades with side, volume, fill price, and realized PnL.'),
    ('renderCreditLineStats', 'Renders credit line debt statistics and liquidation risk indicators.'),
    ('runInterestNow', 'Sends admin command to execute daily interest calculation on all accounts in debt.'),
    ('runLiquidationCheckNow', 'Sends admin command to perform immediate margin call liquidation checks.')
]

for afn, apurp in admin_funcs:
    out.append(f'  * Function: {afn}()')
    out.append(f'    Description: {apurp}')

# Write to file
target_txt = r'c:\Users\david\.gemini\antigravity-ide\scratch\UI_alfa\code_function_summary.txt'
with open(target_txt, 'w', encoding='utf-8') as out_f:
    out_f.write('\n'.join(out))

print(f'Detailed Manual Generated Successfully! ({len(out)} lines)')
