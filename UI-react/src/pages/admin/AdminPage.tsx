import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminGet, adminPost, healthOk } from '@/lib/adminApi';
import { isoDate, money, num, relTime, signedMoney } from './format';
import { AdminNettingTab } from './AdminNettingTab';
import type { AdminAccount, AdminAudit, AdminLoan, AdminTrade, AdminTx, AdminUser, NettingSummary, VenueHolding } from './types';

type Tab = 'overview' | 'users' | 'trades' | 'finance' | 'transactions' | 'credit' | 'audit' | 'netting' | 'system';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'trades', label: 'Trades' },
  { id: 'finance', label: 'Accounts' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'credit', label: 'Credit line' },
  { id: 'audit', label: 'Audit' },
  { id: 'netting', label: 'Netting' },
  { id: 'system', label: 'System' },
];

/**
 * Localhost admin hub. Same APIs as the old HTML file; same tables; lives in the React app.
 */
export function AdminPage() {
  const location = useLocation();
  const [tab, setTab] = useState<Tab>(location.pathname.includes('netting') ? 'netting' : 'overview');
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trades, setTrades] = useState<AdminTrade[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [txs, setTxs] = useState<AdminTx[]>([]);
  const [loans, setLoans] = useState<AdminLoan[]>([]);
  const [audit, setAudit] = useState<AdminAudit[]>([]);
  const [netting, setNetting] = useState<NettingSummary | null>(null);
  const [mt5, setMt5] = useState<{ connected?: boolean; path?: string; bridgeReachable?: boolean } | null>(null);

  const usersById = useMemo(() => {
    const m: Record<number, AdminUser> = {};
    users.forEach((u) => { m[u.id] = u; });
    return m;
  }, [users]);

  const load = useCallback(async () => {
    setLoading(true);
    const ok = await healthOk();
    setOnline(ok);
    if (!ok) {
      setLoading(false);
      return;
    }
    const [u, t, a, x, l, au, n, m] = await Promise.all([
      adminGet<AdminUser[]>('/users'),
      adminGet<AdminTrade[]>('/trades'),
      adminGet<AdminAccount[]>('/accounts'),
      adminGet<AdminTx[]>('/transactions'),
      adminGet<AdminLoan[]>('/margin-loans'),
      adminGet<AdminAudit[]>('/audit'),
      adminGet<NettingSummary>('/netting/summary'),
      adminGet<{ connected?: boolean; path?: string; bridgeReachable?: boolean }>('/mt5/status'),
    ]);
    setUsers(u ?? []);
    setTrades(t ?? []);
    setAccounts(a ?? []);
    setTxs(x ?? []);
    setLoans(l ?? []);
    setAudit([...(au ?? [])].reverse());
    setNetting(n);
    setMt5(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        <div className="admin-brand">
          <img src="/images/LOGO.png" alt="" height={28} />
          <div>
            <div className="admin-brand-name">Admin Hub</div>
            <div className="admin-brand-sub">localhost only</div>
          </div>
        </div>
        <nav className="admin-nav">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-nav-link${tab === item.id ? ' active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <Link to="/landing" className="admin-back">← Trading app</Link>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <h1>{TABS.find((t) => t.id === tab)?.label}</h1>
          <div className="admin-status">
            <span className={`admin-dot${online ? ' on' : ''}`} />
            {online ? 'Server online' : 'Server offline'}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </header>
        <div className="admin-body">
          {!online && !loading ? (
            <div className="card admin-card">Backend is not running on port 8080. Start it, then refresh.</div>
          ) : null}
          {tab === 'overview' ? (
            <Overview users={users} accounts={accounts} trades={trades} txs={txs} loans={loans} audit={audit} netting={netting} mt5={mt5} onRefresh={load} />
          ) : null}
          {tab === 'users' ? <UsersTab users={users} accounts={accounts} onChanged={load} /> : null}
          {tab === 'trades' ? <TradesTab trades={trades} usersById={usersById} /> : null}
          {tab === 'finance' ? <AccountsTab accounts={accounts} usersById={usersById} onChanged={load} /> : null}
          {tab === 'transactions' ? <TxTab txs={txs} accounts={accounts} usersById={usersById} onChanged={() => void load()} /> : null}
          {tab === 'credit' ? <CreditTab accounts={accounts} loans={loans} usersById={usersById} onChanged={load} /> : null}
          {tab === 'audit' ? <AuditTab audit={audit} usersById={usersById} /> : null}
          {tab === 'netting' ? <AdminNettingTab /> : null}
          {tab === 'system' ? (
            <div className="card admin-card" style={{ borderColor: 'var(--red)' }}>
              <h3 style={{ color: 'var(--red)' }}>Critical</h3>
              <button type="button" className="btn btn-danger" onClick={() => {
                if (window.confirm('Restart backend?')) void adminPost('/server/restart');
              }}>
                Restart backend process
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Overview({
  users, accounts, trades, txs, loans, audit, netting, mt5, onRefresh,
}: {
  users: AdminUser[];
  accounts: AdminAccount[];
  trades: AdminTrade[];
  txs: AdminTx[];
  loans: AdminLoan[];
  audit: AdminAudit[];
  netting: NettingSummary | null;
  mt5: { connected?: boolean; path?: string; bridgeReachable?: boolean } | null;
  onRefresh: () => void;
}) {
  const computers = users.filter((u) => u.simulated).length;
  const totalBal = accounts.filter((a) => !a.simulated).reduce((s, a) => s + num(a.balance), 0);
  const openPos = trades.filter((t) => t.type === 'POSITION').length;
  const today = new Date().toISOString().slice(0, 10);
  const todayDep = txs.filter((t) => t.txType === 'DEPOSIT' && t.createdAt && String(t.createdAt).startsWith(today));
  const failures = audit.filter((a) => a.action === 'LOGIN_FAILURE').length;
  const exp = netting?.houseNetExposure ?? {};
  const bad = Object.entries(exp).filter(([, v]) => num(v) !== 0);
  const simPnl = num(netting?.simulatedRealizedPnl) + num(netting?.simulatedUnrealizedPnl);
  const tradeCash = num(netting?.brokerCashResult);
  const credit = creditInterest(loans);
  const cash = tradeCash + credit.collected;
  const fromClients = num(netting?.scheduleCommission);
  const toExchange = num(netting?.allTimeExternalFeesPaid);
  const legacyFees = num(netting?.legacyExternalFees);
  const nettingFees = num(netting?.externalFeesPaid);
  const saved = num(netting?.internalFeesAvoided);
  const legacyFills = netting?.legacyFilledOrders ?? 0;
  const matchPct = ((netting?.internalRateByQty ?? 0) * 100).toFixed(0);

  return (
    <div className="admin-stack">
      <section className="card admin-card admin-pl">
        <div className="admin-pl-kicker">Money</div>
        <div className="admin-pl-layout">
          <div className="admin-pl-hero">
            <div className="admin-pl-hero-label">Profit / loss</div>
            <div className={`admin-pl-hero-value${cash >= 0 ? ' ok' : ' bad'}`}>{signedMoney(cash)}</div>
            <p className="admin-pl-hero-hint">Crypto is 0.20% minus 0.10%. Forex and metals are $7 per lot minus $3.50.</p>
          </div>
          <div className="admin-pl-ledger">
            <PlRow label="From clients" hint="Current tariff on the stored sizes. The other tabs show what was actually charged." value={money(fromClients)} tone="in" />
            <PlRow label="To the exchange" hint="0.10% on crypto, $3.50 per lot otherwise" value={'−' + money(toExchange)} tone="out" />
            <div className="admin-pl-indent">
              <PlRow compact label={`Old trades · ${legacyFills} fills`} value={money(legacyFees)} />
              <PlRow compact label="After netting went live" value={money(nettingFees)} />
            </div>
            <PlRow label="Credit interest" hint="Collected when a debt is paid off in full" value={money(credit.collected)} tone="in" />
            {credit.stillOwed > 0 ? (
              <div className="admin-pl-indent">
                <PlRow compact label="Still inside open debts" value={money(credit.stillOwed)} />
              </div>
            ) : null}
            <div className="admin-pl-rule" />
            <PlRow label="Cash" value={signedMoney(cash)} strong tone={cash >= 0 ? 'in' : 'out'} />
          </div>
        </div>
        {saved > 0 ? (
          <p className="admin-pl-note">
            When two clients match inside, the venue is not paid. That saved venue fee is {money(saved)}, already inside the profit above.
          </p>
        ) : null}
      </section>

      <div>
        <div className="admin-section-label">Desk</div>
        <div className="admin-stat-grid admin-stat-grid-4">
          <Kpi label="Users" value={String(users.length)} sub={computers ? `${computers} are the computer` : undefined} />
          <Kpi label="Client balances" value={money(totalBal)} sub={computers ? 'People only' : undefined} />
          <Kpi label="Open positions" value={String(openPos)} />
          <Kpi label="Deposits today" value={money(todayDep.reduce((s, t) => s + num(t.amount), 0))} />
        </div>
      </div>

      <VenueCard netting={netting} />

      <div className="admin-overview-split">
        <section className="card admin-card">
          <h3>Matching</h3>
          <div>
            <Fact label="Filled inside (not exchange)" value={`${matchPct}%`} />
            <Fact label="Internal matches" value={String(netting?.matches ?? 0)} />
            <Fact label="House inventory" value={bad.length ? bad.map(([k, v]) => `${k} ${v}`).join(', ') : 'Flat'} />
            <Fact label="Demo computer P/L" value={signedMoney(simPnl)} />
          </div>
        </section>
        <section className="card admin-card">
          <h3>Operations</h3>
          <div>
            <Fact label="Failed logins" value={String(failures)} />
            <Fact label="MetaTrader 5" value={mt5?.connected ? 'Connected' : 'Off'} />
            <Fact label="Bridge" value={mt5?.bridgeReachable ? 'Reachable' : 'No'} />
          </div>
          <p className="admin-pl-note" style={{ marginTop: 12, paddingTop: 12 }}>
            {mt5?.path || 'No MT5 path set'}
          </p>
          <div className="admin-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void adminPost('/mt5/connect').then(onRefresh)}>
              Connect MT5
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Interest becomes profit only when that debt episode is repaid to zero. A write-off is not profit. */
function creditInterest(loans: AdminLoan[]): { collected: number; stillOwed: number } {
  const byAccount = new Map<number, AdminLoan[]>();
  for (const entry of loans) {
    const id = entry.accountId ?? 0;
    const list = byAccount.get(id) ?? [];
    list.push(entry);
    byAccount.set(id, list);
  }
  let collected = 0;
  let stillOwed = 0;
  for (const entries of byAccount.values()) {
    const ordered = [...entries].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    let unpaid = 0;
    for (const entry of ordered) {
      const amount = num(entry.amount);
      if (entry.entryType === 'INTEREST') unpaid += amount;
      else if (entry.entryType === 'LIQUIDATION' && amount > 0) unpaid = 0;
      else if (entry.entryType === 'REPAY' && num(entry.borrowedAfter) === 0) {
        collected += unpaid;
        unpaid = 0;
      }
    }
    stillOwed += unpaid;
  }
  return { collected, stillOwed };
}

function PlRow({
  label, hint, value, tone, compact, strong,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: 'in' | 'out';
  compact?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`admin-pl-row${compact ? ' compact' : ''}${strong ? ' total' : ''}`}>
      <div className="admin-pl-row-meta">
        <div className="admin-pl-row-label">{label}</div>
        {hint ? <div className="admin-pl-row-hint">{hint}</div> : null}
      </div>
      <div className={`admin-pl-row-value${tone === 'in' ? ' in' : tone === 'out' ? ' out' : ''}`}>{value}</div>
    </div>
  );
}

function VenueCard({ netting }: { netting: NettingSummary | null }) {
  const rows = netting?.venueHoldings ?? [];
  const total = num(netting?.venueValueUsd);
  const older = num(netting?.venueLegacyValueUsd);
  return (
    <section className="card admin-card admin-pl admin-venue">
      <div className="admin-venue-head">
        <div>
          <div className="admin-pl-kicker">At the venue</div>
          <div className="admin-pl-hero-label">In our name</div>
          <div className="admin-pl-hero-value">{rows.length ? money(total) : '–'}</div>
          <p className="admin-venue-scope">People only. The computer is not in this number.</p>
        </div>
        <p className="admin-pl-hero-hint">
          Dollar size of what people still hold outside. Not the cash on their accounts. An internal match does not add to it.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="admin-pl-hero-hint">Nothing is sitting outside.</p>
      ) : (
        <div className="admin-venue-cols">
          {venueColumns(rows).map((col, i) => (
            <div className="admin-venue-list" key={i}>
              <div className="admin-venue-row admin-venue-headrow">
                <span>Symbol</span>
                <span>Still outside</span>
                <span>Value</span>
              </div>
              {col.map((row) => {
                const hint = venueAgeHint(row);
                return (
                  <div className="admin-venue-row" key={row.symbol}>
                    <span className="admin-venue-symbol">{row.symbol}</span>
                    <span>
                      {venueQty(row.symbol, num(row.quantity))}
                      {hint ? <span className="admin-venue-hint">{hint}</span> : null}
                    </span>
                    <span className="admin-venue-value">{row.valueUsd == null ? '–' : money(row.valueUsd)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {older > 0 ? (
        <p className="admin-pl-note">
          Before netting, every fill went outside. That older book is {money(older)} of this total.
        </p>
      ) : null}
    </section>
  );
}

function venueColumns(rows: VenueHolding[]): VenueHolding[][] {
  if (rows.length <= 6) return [rows];
  const mid = Math.ceil(rows.length / 2);
  return [rows.slice(0, mid), rows.slice(mid)];
}

function venueQty(symbol: string, qty: number): string {
  const abs = Math.abs(qty);
  const digits = abs >= 100 ? 2 : 4;
  const body = abs.toLocaleString(undefined, { maximumFractionDigits: digits });
  const unit = lotSymbol(symbol) ? (abs === 1 ? ' lot' : ' lots') : '';
  return (qty < 0 ? '−' : '') + body + unit;
}

function venueAgeHint(row: VenueHolding): string | null {
  const qty = num(row.quantity);
  const old = num(row.legacyQuantity);
  if (Math.abs(old) < 1e-8) return null;
  if (Math.abs(old - qty) < 1e-4) return 'from before netting';
  return `${venueQty(row.symbol, old)} from before netting`;
}

function lotSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return !s.includes('BTC') && !s.includes('ETH') && !s.includes('SOL') && !s.includes('XRP');
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-fact">
      <span className="admin-fact-label">{label}</span>
      <span className="admin-fact-value">{value}</span>
    </div>
  );
}

function UsersTab({ users, accounts, onChanged }: { users: AdminUser[]; accounts: AdminAccount[]; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const balMap: Record<number, number> = {};
  accounts.forEach((a) => { balMap[a.userId] = (balMap[a.userId] || 0) + num(a.balance); });
  const filtered = users.filter((u) => {
    const hay = `${u.displayName || ''} ${u.email || ''}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });

  return (
    <div className="card admin-card">
      <div className="admin-toolbar">
        <h3>Users <span className="text-muted">{filtered.length} / {users.length}</span></h3>
        <input className="admin-input" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Balance</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id}>
                <td className="text-muted">{i + 1}</td>
                <td>{u.displayName}</td>
                <td className="text-muted">{u.email}</td>
                <td>
                  <span className="admin-badges">
                    <span className={`badge ${u.role === 'ADMIN' ? 'badge-warning' : 'badge-info'}`}>{u.role}</span>
                    {u.simulated ? <span className="badge badge-warning">computer</span> : null}
                  </span>
                </td>
                <td>{money(balMap[u.id])}</td>
                <td><span className={`badge ${u.banned ? 'badge-danger' : 'badge-success'}`}>{u.banned ? 'Banned' : 'Active'}</span></td>
                <td className="admin-row-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdit(u)}>Edit</button>
                  {u.banned ? (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => void adminPost(`/users/${u.id}/unban`).then(onChanged)}>Unban</button>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => {
                      const reason = window.prompt(`Ban reason for #${u.id} (optional):`);
                      if (reason === null) return;
                      void adminPost(`/users/${u.id}/ban`, { reason }).then(onChanged);
                    }}>Ban</button>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--red)' }} onClick={() => {
                    if (window.confirm(`Delete user #${u.id}?`)) void adminPost(`/users/${u.id}/delete`).then(onChanged);
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <Modal title="Edit user" onClose={() => setEdit(null)}>
          <UserEditForm user={edit} onDone={() => { setEdit(null); onChanged(); }} />
        </Modal>
      ) : null}
    </div>
  );
}

function UserEditForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const [name, setName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await adminPost(`/users/${user.id}/update`, { displayName: name, email });
    if (res) onDone();
  }
  return (
    <form onSubmit={(e) => void save(e)} className="admin-stack">
      <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="admin-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className="btn btn-primary">Save</button>
    </form>
  );
}

function TradesTab({ trades, usersById }: { trades: AdminTrade[]; usersById: Record<number, AdminUser> }) {
  const [kind, setKind] = useState<'all' | 'positions' | 'orders'>('all');
  const [routing, setRouting] = useState('');
  let data = trades;
  if (kind === 'positions') data = data.filter((t) => t.type === 'POSITION');
  if (kind === 'orders') data = data.filter((t) => t.type !== 'POSITION');
  if (routing) data = data.filter((t) => t.executionRouting === routing);
  const sorted = [...data].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return (
    <div className="card admin-card">
      <div className="admin-toolbar">
        <div className="admin-pills">
          {(['all', 'positions', 'orders'] as const).map((k) => (
            <button key={k} type="button" className={`admin-pill${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{k}</button>
          ))}
        </div>
        <select className="admin-input" value={routing} onChange={(e) => setRouting(e.target.value)}>
          <option value="">All routing</option>
          <option value="INTERNAL">Internal</option>
          <option value="SPLIT">Split</option>
          <option value="EXTERNAL">External</option>
          <option value="LEGACY">Legacy</option>
          <option value="CLOSE">Close</option>
          <option value="OPEN_POSITION">Open position</option>
          <option value="NEW">New</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <span className="text-muted">{sorted.length} records</span>
      </div>
      <p className="text-muted admin-help">
        A new fill writes this same amount on the order, on the account, and as a commission posting. Older rows are the archive and can differ.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>User</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Type</th><th>Routing</th><th>On the order</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const u = usersById[t.accountId];
              return (
                <tr key={`${t.type}-${t.id}-${i}`}>
                  <td className="text-muted">{i + 1}</td>
                  <td>{u ? <>{u.displayName}<div className="text-muted">{u.email}</div></> : `#${t.accountId}`}</td>
                  <td>{t.symbol}</td>
                  <td style={{ color: t.side === 'BUY' || t.side === 'OPEN' ? 'var(--green)' : 'var(--red)' }}>{t.side}</td>
                  <td>{num(t.quantity).toFixed(4)}</td>
                  <td><span className="badge badge-info">{t.type}</span></td>
                  <td><span className="badge">{t.executionRouting || '–'}</span></td>
                  <td>{num(t.commission) > 0 ? money(t.commission) : '–'}</td>
                  <td><span className="badge badge-success">{t.status}</span></td>
                  <td className="text-muted">{relTime(t.date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountsTab({ accounts, usersById, onChanged }: { accounts: AdminAccount[]; usersById: Record<number, AdminUser>; onChanged: () => void }) {
  const [edit, setEdit] = useState<AdminAccount | null>(null);
  return (
    <div className="card admin-card">
      <h3>Accounts</h3>
      <p className="text-muted admin-help">
        On the account is the lifetime counter. New charges match the order and the commission posting. Older rows are the archive and can differ.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>User</th><th>Type</th><th>Balance</th><th>Equity</th><th>Free</th><th>Borrowed</th><th>Margin</th><th>On the account</th><th></th></tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => {
              const u = usersById[a.userId];
              const lvl = a.marginLevelPct == null ? null : num(a.marginLevelPct);
              return (
                <tr key={a.id}>
                  <td className="text-muted">{i + 1}</td>
                  <td>{u ? <>{u.displayName}{a.simulated ? <> <span className="badge badge-warning">computer</span></> : null}<div className="text-muted">{u.email}</div></> : `#${a.userId}`}</td>
                  <td>{a.accountType} · x{a.leverage}</td>
                  <td>{money(a.balance)}</td>
                  <td>{money(a.equity)}</td>
                  <td>{money(a.freeMargin)}</td>
                  <td>{num(a.borrowedBalance) > 0 ? money(a.borrowedBalance) : '–'}</td>
                  <td>{lvl == null ? '–' : `${lvl.toFixed(1)}%`}</td>
                  <td>{money(a.commissionPaidTotal)}</td>
                  <td><button type="button" className="btn btn-outline btn-sm" onClick={() => setEdit(a)}>Adjust</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit ? (
        <Modal title="Update balance" onClose={() => setEdit(null)}>
          <BalanceForm account={edit} onDone={() => { setEdit(null); onChanged(); }} />
        </Modal>
      ) : null}
    </div>
  );
}

function BalanceForm({ account, onDone }: { account: AdminAccount; onDone: () => void }) {
  const [bal, setBal] = useState(String(account.balance));
  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await adminPost(`/accounts/${account.id}/balance`, { balance: parseFloat(bal) });
    if (res) onDone();
  }
  return (
    <form onSubmit={(e) => void save(e)} className="admin-stack">
      <input className="admin-input" type="number" step="0.01" value={bal} onChange={(e) => setBal(e.target.value)} />
      <button type="submit" className="btn btn-primary">Update funds</button>
    </form>
  );
}

function TxTab({ txs, accounts, usersById, onChanged }: { txs: AdminTx[]; accounts: AdminAccount[]; usersById: Record<number, AdminUser>; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [decideError, setDecideError] = useState('');
  const accUser: Record<number, number> = {};
  accounts.forEach((a) => { accUser[a.id] = a.userId; });
  const approved = (t: AdminTx) => (t.status || '').toUpperCase() === 'APPROVED';
  const dep = txs.filter((t) => t.txType === 'DEPOSIT' && approved(t)).reduce((s, t) => s + num(t.amount), 0);
  const wit = txs.filter((t) => t.txType === 'WITHDRAWAL' && approved(t)).reduce((s, t) => s + num(t.amount), 0);
  const comm = txs.filter((t) => t.txType === 'COMMISSION').reduce((s, t) => s + num(t.amount), 0);
  const pending = txs.filter((t) => t.txType === 'WITHDRAWAL' && (t.status || '').toUpperCase() === 'PENDING');
  const sorted = [...txs].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  async function decide(id: number, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    setDecideError('');
    try {
      const res = await fetch(`/api/admin/transactions/${id}/decide`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        setDecideError('This payout does not fit the cash on the account anymore.');
        return;
      }
      onChanged();
    } catch {
      setDecideError('This payout does not fit the cash on the account anymore.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card admin-card">
      <div className="admin-stat-grid">
        <Kpi label="Deposits" value={money(dep)} />
        <Kpi label="Withdrawals" value={money(wit)} sub={pending.length ? `${pending.length} waiting` : undefined} />
        <Kpi label="Posted commissions" value={money(comm)} />
        <Kpi label="Net flow" value={money(dep - wit)} />
      </div>
      <p className="text-muted admin-help">
        A withdrawal stays pending until you approve it. The cash leaves the account only then. Posted commissions are the cash that was actually taken. Older commission rows are the archive and can differ.
      </p>
      {decideError ? <p className="text-muted admin-help">{decideError}</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>User</th><th>Type</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {sorted.map((tx, i) => {
              const u = usersById[accUser[tx.accountId]];
              const status = (tx.status || '').toUpperCase();
              const badge = status === 'PENDING' ? 'badge-warning' : status === 'REJECTED' ? 'badge-danger' : 'badge-success';
              const waiting = tx.txType === 'WITHDRAWAL' && status === 'PENDING';
              return (
                <tr key={tx.id}>
                  <td className="text-muted">{sorted.length - i}</td>
                  <td>{u ? u.email : `#${tx.accountId}`}</td>
                  <td>{tx.txType}</td>
                  <td>{money(tx.amount)}</td>
                  <td className="text-muted">{tx.method || tx.currency || '–'}</td>
                  <td><span className={`badge ${badge}`}>{tx.status}</span></td>
                  <td className="text-muted">{isoDate(tx.createdAt)}</td>
                  <td>
                    {waiting ? (
                      <span className="admin-actions">
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy === tx.id} onClick={() => void decide(tx.id, 'APPROVED')}>Approve</button>
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy === tx.id} onClick={() => void decide(tx.id, 'REJECTED')}>Reject</button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreditTab({ accounts, loans, usersById, onChanged }: {
  accounts: AdminAccount[];
  loans: AdminLoan[];
  usersById: Record<number, AdminUser>;
  onChanged: () => void;
}) {
  const [type, setType] = useState('');
  const inDebt = accounts.filter((a) => num(a.borrowedBalance) > 0);
  const credit = creditInterest(loans);
  const filtered = type ? loans.filter((e) => e.entryType === type) : loans;
  return (
    <div className="admin-stack">
      <div className="admin-stat-grid">
        <Kpi label="In debt" value={`${inDebt.length} / ${accounts.length}`} />
        <Kpi label="Borrowed" value={money(inDebt.reduce((s, a) => s + num(a.borrowedBalance), 0))} />
        <Kpi label="Interest accrued" value={money(accounts.reduce((s, a) => s + num(a.interestAccruedTotal), 0))} sub="Lifetime, including open debts" />
        <Kpi label="Collected" value={money(credit.collected)} sub="Taken when a debt is paid off in full" />
        <Kpi label="At risk (&lt;110%)" value={String(inDebt.filter((a) => a.marginLevelPct != null && num(a.marginLevelPct) < 110).length)} />
      </div>
      <div className="card admin-card">
        <p className="text-muted">$10,000 limit · 0.5%/day · 110% call · 100% liquidation</p>
        <div className="admin-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void adminPost('/margin-loans/run-interest').then(onChanged)}>Run daily interest</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => void adminPost('/margin-loans/run-liquidation-check').then(onChanged)}>Run liquidation check</button>
        </div>
      </div>
      <div className="card admin-card">
        <div className="admin-toolbar">
          <h3>Ledger</h3>
          <select className="admin-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All events</option>
            <option value="BORROW">Borrow</option>
            <option value="REPAY">Repay</option>
            <option value="INTEREST">Interest</option>
            <option value="LIQUIDATION">Liquidation</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>#</th><th>User</th><th>Event</th><th>Amount</th><th>Debt after</th><th>Note</th><th>Time</th></tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const u = e.userId ? usersById[e.userId] : undefined;
                return (
                  <tr key={e.id}>
                    <td className="text-muted">{filtered.length - i}</td>
                    <td>{u ? u.email : e.userId ? `#${e.userId}` : '–'}</td>
                    <td><span className="badge">{e.entryType}</span></td>
                    <td>{money(e.amount)}</td>
                    <td>{money(e.borrowedAfter)}</td>
                    <td className="text-muted">{e.note || '–'}</td>
                    <td className="text-muted">{relTime(e.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditTab({ audit, usersById }: { audit: AdminAudit[]; usersById: Record<number, AdminUser> }) {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const filtered = audit.filter((a) => {
    if (action && a.action !== action) return false;
    if (q) {
      const u = a.userId ? usersById[a.userId] : undefined;
      const hay = `${u?.email || ''} ${u?.displayName || ''} ${a.detail || ''} ${a.userId || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  return (
    <div className="card admin-card">
      <div className="admin-toolbar">
        <select className="admin-input" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All events</option>
          <option value="LOGIN_SUCCESS">Login success</option>
          <option value="LOGIN_FAILURE">Login failure</option>
          <option value="ORDER_PLACED">Order placed</option>
          <option value="POSITION_CLOSED">Position closed</option>
          <option value="DEPOSIT">Deposit</option>
          <option value="WITHDRAWAL">Withdrawal</option>
          <option value="MARGIN_BORROW">Margin borrow</option>
          <option value="LIQUIDATION">Liquidation</option>
        </select>
        <input className="admin-input" placeholder="Filter user" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-muted">{filtered.length} / {audit.length}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>#</th><th>User</th><th>Action</th><th>Details</th><th>IP</th><th>Time</th></tr>
          </thead>
          <tbody>
            {filtered.map((a, i) => {
              const u = a.userId ? usersById[a.userId] : undefined;
              return (
                <tr key={a.id}>
                  <td className="text-muted">{filtered.length - i}</td>
                  <td>{u ? u.email : a.userId ? `#${a.userId}` : '–'}</td>
                  <td><span className="badge badge-info">{a.action}</span></td>
                  <td className="text-muted">{a.detail || '–'}</td>
                  <td className="text-muted">{a.ip || '–'}</td>
                  <td className="text-muted">{relTime(a.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="admin-kpi">
      <div className="admin-kpi-label">{label}</div>
      <div className={`admin-kpi-value${tone === 'ok' ? ' ok' : tone === 'bad' ? ' bad' : ''}`}>{value}</div>
      {sub ? <div className="admin-kpi-sub">{sub}</div> : null}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="admin-modal-bg" onClick={onClose} role="presentation">
      <div className="card admin-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>{title}</h3>
        {children}
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose} style={{ marginTop: 12 }}>Cancel</button>
      </div>
    </div>
  );
}
