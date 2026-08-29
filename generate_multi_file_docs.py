import os
import glob
import re

base_dir = r'c:\Users\david\.gemini\antigravity-ide\scratch\UI_alfa'
doc_dir = os.path.join(base_dir, 'system_documentation')
os.makedirs(doc_dir, exist_ok=True)

backend_dir = os.path.join(base_dir, 'backend', 'backend', 'src', 'main', 'java')
frontend_dir = os.path.join(base_dir, 'UI-react', 'src')

# Mapping classes to specific doc files
CATEGORY_MAP = {
    '01_Backend_Controllers.txt': [
        'BrokerApiController', 'AdminTradeController', 'AdminUserController', 
        'AuthApiController', 'MarketController', 'HealthController'
    ],
    '02_Backend_Services.txt': [
        'OrderExecutionService', 'MarginLoanService', 'AuditLogService', 
        'MT5IntegrationService', 'MT5PositionSyncService', 'MT5JavaTradeWriter', 
        'MT5ConnectionManager', 'NNPredictorClient', 'AlpacaClient'
    ],
    '03_Backend_Market_Providers.txt': [
        'MarketPriceService', 'BinancePriceService', 'BinanceService', 
        'FinnhubMarketService', 'YahooFinanceService'
    ],
    '04_Backend_Fees_And_Utilities.txt': [
        'TradingFees', 'SecurityConfig', 'SpaRoutingConfig', 'LocalhostOnlyFilter', 
        'AuthBootstrap', 'AppUserDetailsService', 'BackendApplication'
    ]
}

CLASS_OVERVIEWS = {
    'BrokerApiController': 'Primary REST API Controller handling client trading operations, position lifecycle, deposits/withdrawals, and overview financial metrics.',
    'AdminTradeController': 'Administrator management controller providing REST endpoints for reviewing all platform trades, accounts, credit debt, and running manual batch tasks.',
    'AdminUserController': 'Administrator user management controller for viewing platform users, approving/rejecting KYC compliance cases, and toggling user roles.',
    'AuthApiController': 'Authentication controller handling user registration, login authentication, password hashing, and session tokens.',
    'MarketController': 'REST controller exposing market price feeds and historical chart candle endpoints.',
    'HealthController': 'Health check endpoint verifying backend service availability.',
    
    'OrderExecutionService': 'Core background execution service running scheduled ticks (every 2s) to execute pending limit/stop orders, trigger SL/TP auto-closes, and settle trade fills.',
    'MarginLoanService': 'Credit line and leverage management service. Handles shortfall auto-loans, debt repayments, daily interest accruals, and liquidation checks.',
    'AuditLogService': 'Compliance audit logging service capturing user actions, administrative interventions, and IP addresses into database logs.',
    'MT5IntegrationService': 'MetaTrader 5 terminal integration bridge. Writes orders to local bridge files and checks terminal connectivity.',
    'MT5PositionSyncService': 'Background service synchronizing position states with MetaTrader 5 terminal.',
    'MT5JavaTradeWriter': 'File I/O utility formatting and writing trade payloads for MT5 terminal bridge.',
    'MT5ConnectionManager': 'Connection manager maintaining MT5 bridge file path and heartbeat.',
    'NNPredictorClient': 'Client connector to internal Neural Network AI prediction server for evaluating trade win/loss probabilities.',
    'AlpacaClient': 'External broker client bridge adapter.',
    
    'MarketPriceService': 'Market data aggregator connecting to Binance, Finnhub, and Yahoo Finance to stream live prices and historical candles.',
    'BinancePriceService': 'Market data provider connecting to Binance public WebSocket/REST for real-time cryptocurrency tickers.',
    'BinanceService': 'Low-level HTTP client for querying Binance market depth and price tickers.',
    'FinnhubMarketService': 'Market data provider fetching real-time equity quotes from Finnhub REST API.',
    'YahooFinanceService': 'Market data provider fetching historical stock and forex price candles from Yahoo Finance API.',
    
    'TradingFees': 'Central fee calculation utility. Computes dynamic commissions (0.0025% with caps), applies broker bid/ask spreads (0.015%), and updates lifetime fee totals.',
    'SecurityConfig': 'Spring Security configuration defining CORS policies, password encoders (BCrypt), and public vs protected endpoint filters.',
    'SpaRoutingConfig': 'Spring MVC web configuration ensuring Single Page Application (SPA) HTML5 routing routes unknown URLs back to index.html.',
    'LocalhostOnlyFilter': 'Security filter restricting access to sensitive administrative endpoints exclusively to localhost connections.',
    'AuthBootstrap': 'Application runner that initializes default asset symbols, admin accounts, demo accounts, and initial seed balances on backend startup.',
    'AppUserDetailsService': 'Spring Security UserDetailsService loading AppUser credentials for authentication.',
    'BackendApplication': 'Main entry point launcher for the Spring Boot backend application.'
}

# -----------------------------------------------------------------------------
# PARSE BACKEND FILES
# -----------------------------------------------------------------------------
java_files = sorted(glob.glob(os.path.join(backend_dir, '**', '*.java'), recursive=True))
parsed_java = {}

method_pattern = re.compile(
    r'(?:@\w+(?:\([^)]*\))?\s+)*(public|protected|private|static|\s)+([\w<>\[\]\?]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*\{'
)

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
    
    is_entity = '@Entity' in content or '@Table' in content
    is_repo = 'Repository' in cname or 'extends JpaRepository' in content
    
    methods = []
    getters_setters = []
    
    lines = content.split('\n')
    interface_method_pattern = re.compile(r'([\w<>\[\]\?]+)\s+(\w+)\s*\(([^)]*)\)\s*;')

    for line in lines:
        line_s = line.strip()
        if line_s.startswith('//') or line_s.startswith('*') or line_s.startswith('import ') or line_s.startswith('package '):
            continue
            
        if is_repo:
            im = interface_method_pattern.search(line_s)
            if im and not im.group(2).startswith('default'):
                methods.append((im.group(2), im.group(3).strip(), im.group(1), f'Spring Data JPA query executing: {im.group(2)}.'))
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
                low = mname.lower()
                if mname == cname:
                    purp = f'Constructor initializing {cname} with required dependencies.'
                elif 'overview' in low:
                    purp = 'Retrieves overall financial state (balance, equity, margin, fees, credit) of primary account.'
                elif 'create' in low and 'order' in low:
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

    parsed_java[cname] = {
        'kind': kind, 'full_name': f'{pkg}.{cname}', 'rel_path': rel_path,
        'methods': methods, 'getters_setters': getters_setters, 'is_entity': is_entity, 'is_repo': is_repo
    }

# -----------------------------------------------------------------------------
# WRITE BACKEND CATEGORIES (01 to 04)
# -----------------------------------------------------------------------------
for filename, class_list in CATEGORY_MAP.items():
    fpath = os.path.join(doc_dir, filename)
    out = []
    out.append('=' * 80)
    out.append(f'  DOCUMENTATION: {filename.replace(".txt", "").replace("_", " ")}')
    out.append('=' * 80 + '\n')
    
    for cname in class_list:
        if cname in parsed_java:
            info = parsed_java[cname]
            out.append(f'[{info["kind"]}] {info["full_name"]}')
            out.append(f'File Path: src/main/java/{info["rel_path"].replace(os.sep, "/")}')
            out.append(f'Overview: {CLASS_OVERVIEWS.get(cname, "Backend component.")}')
            out.append('-' * 80)
            
            for mname, args, rtype, purp in info['methods']:
                out.append(f'  * Function: {mname}({args}) -> {rtype}')
                out.append(f'    Purpose: {purp}')
            out.append('\n')
            
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

# -----------------------------------------------------------------------------
# WRITE 05_Backend_Entities_And_Repositories.txt
# -----------------------------------------------------------------------------
fpath = os.path.join(doc_dir, '05_Backend_Entities_And_Repositories.txt')
out = []
out.append('=' * 80)
out.append('  DOCUMENTATION: 05 Backend Entities And Repositories')
out.append('=' * 80 + '\n')

for cname, info in parsed_java.items():
    # If not in category map 01-04
    in_cat = any(cname in l for l in CATEGORY_MAP.values())
    if not in_cat:
        out.append(f'[{info["kind"]}] {info["full_name"]}')
        out.append(f'File Path: src/main/java/{info["rel_path"].replace(os.sep, "/")}')
        out.append(f'Overview: Database Domain Entity / Spring Data Repository for {cname}.')
        out.append('-' * 80)
        
        if info['getters_setters']:
            out.append(f'  * Entity Attributes & Data Accessors:')
            out.append(f'    Contains fields, getters, setters, and constructors ({len(info["getters_setters"])} property mutators).\n')
            
        for mname, args, rtype, purp in info['methods']:
            out.append(f'  * Query / Function: {mname}({args}) -> {rtype}')
            out.append(f'    Purpose: {purp}')
        out.append('\n')

with open(fpath, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

# -----------------------------------------------------------------------------
# WRITE FRONTEND (06 & 07)
# -----------------------------------------------------------------------------
fe_files = sorted(glob.glob(os.path.join(frontend_dir, '**', '*.ts*'), recursive=True))

pages_components = []
hooks_utils = []

for ff in fe_files:
    rel = os.path.relpath(ff, frontend_dir)
    cname = os.path.basename(ff)
    if 'pages' in rel or 'components' in rel:
        pages_components.append((ff, rel, cname))
    else:
        hooks_utils.append((ff, rel, cname))

def write_fe_doc(filename, file_list, title):
    fpath = os.path.join(doc_dir, filename)
    out = []
    out.append('=' * 80)
    out.append(f'  DOCUMENTATION: {title}')
    out.append('=' * 80 + '\n')
    
    func_pattern = re.compile(
        r'(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>'
    )
    
    for ff, rel, cname in file_list:
        with open(ff, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        out.append(f'[FRONTEND MODULE] {cname}')
        out.append(f'File Path: src/{rel.replace(os.sep, "/")}')
        out.append('-' * 80)
        
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
                out.append(f'    Purpose: {purp}')
            out.append('\n')
            
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

write_fe_doc('06_Frontend_Pages_And_Components.txt', pages_components, '06 Frontend Pages And Components')
write_fe_doc('07_Frontend_Hooks_And_Utilities.txt', hooks_utils, '07 Frontend Hooks And Utilities')

# -----------------------------------------------------------------------------
# WRITE 08_Admin_Dashboard_Panel.txt
# -----------------------------------------------------------------------------
fpath = os.path.join(doc_dir, '08_Admin_Dashboard_Panel.txt')
out = []
out.append('=' * 80)
out.append('  DOCUMENTATION: 08 Admin Dashboard Panel (HTML/JS Engine)')
out.append('=' * 80 + '\n')
out.append('[ADMIN DASHBOARD] AdminDashboard_Local.html')
out.append('File Path: AdminDashboard_Local.html')
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
    out.append(f'    Purpose: {apurp}')

with open(fpath, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

print("Multi-file documentation generated successfully!")
