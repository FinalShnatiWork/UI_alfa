import { useEffect, useState } from 'react';
import { adminGet, adminPost } from '@/lib/adminApi';
import { num, signedMoney } from './format';
import type { Invariants, NettingBook, NettingSummary } from './types';

/**
 * Live netting console: book, invariants, simulator. Replaces the vanilla HTML page on :4010
 * for day-to-day work. Scenario playback V01–V16 stays a TypeScript CLI (`scripts/netting_e2e.ts`).
 */
export function AdminNettingTab() {
  const [symbol, setSymbol] = useState('BTCUSD');
  const [summary, setSummary] = useState<NettingSummary | null>(null);
  const [book, setBook] = useState<NettingBook | null>(null);
  const [invariants, setInvariants] = useState<Invariants | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function refresh() {
    const [s, b, inv] = await Promise.all([
      adminGet<NettingSummary>('/netting/summary'),
      adminGet<NettingBook>(`/netting/book?symbol=${encodeURIComponent(symbol)}`),
      adminGet<Invariants>('/netting/invariants'),
    ]);
    setSummary(s);
    setBook(b);
    setInvariants(inv);
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      setMsg(label);
      await refresh();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  const invEntries = invariants
    ? Object.entries(invariants).filter(([, v]) => v && typeof v === 'object' && 'pass' in v)
    : [];
  const allPass = invariants && (invariants.allPass === true || invEntries.every(([, v]) => (v as { pass: boolean }).pass));

  return (
    <div className="admin-stack">
      <div className="admin-toolbar">
        <label>
          Symbol{' '}
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="admin-input">
            <option>BTCUSD</option>
            <option>EURUSD</option>
            <option>XAUUSD</option>
          </select>
        </label>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
        {msg ? <span className="text-muted">{msg}</span> : null}
      </div>

      <div className="admin-stat-grid">
        <Stat label="Internal rate" value={((summary?.internalRateByQty ?? 0) * 100).toFixed(1) + '%'} />
        <Stat label="Matches" value={String(summary?.matches ?? 0)} />
        <Stat label="Trade cash" value={signedMoney(summary?.brokerCashResult)} />
        <Stat label="Sim on" value={summary?.simulatorEnabled ? 'yes' : 'no'} />
        <Stat label="Wait ms" value={String(summary?.limitWaitMs ?? '–')} />
        <Stat label="Invariants" value={allPass ? 'all pass' : 'check'} tone={allPass ? 'ok' : 'bad'} />
      </div>
      <p className="text-muted admin-help">
        Trade cash is the current tariff minus what went to the venue. Interest collected when a debt is paid off in full is on Overview.
      </p>

      <div className="card admin-card">
        <h3>Quote &amp; simulator</h3>
        <p className="text-muted admin-help">
          Mid {book?.mid ?? '–'} · bid {book?.bid ?? '–'} · ask {book?.ask ?? '–'}
          {book?.frozen ? ' · frozen' : ''}
        </p>
        <div className="admin-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy}
            onClick={() => void run('Frozen', () => adminPost('/netting/test/freeze-quote', { symbol }))}>
            Freeze quote
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy}
            onClick={() => void run('Unfrozen', () => adminPost('/netting/test/unfreeze-quote', { symbol }))}>
            Unfreeze
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy}
            onClick={() => void run('Sim on', () => adminPost('/netting/sim/enabled', { on: true }))}>
            Enable computer
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy}
            onClick={() => void run('Sim off', () => adminPost('/netting/sim/enabled', { on: false }))}>
            Disable computer
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy}
            onClick={() => void run('Cleared', () => adminPost('/netting/sim/clear', { symbol }))}>
            Clear sim book
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy}
            onClick={() => void run('Injected sell', () => adminPost('/netting/sim/inject', { symbol, side: 'SELL', qty: '0.01', offsetBps: -1 }))}>
            Inject sim sell −1bp
          </button>
        </div>
      </div>

      <div className="admin-book-grid">
        <BookTable title="Bids (buys)" rows={book?.buys ?? []} />
        <BookTable title="Asks (sells)" rows={book?.sells ?? []} />
      </div>

      <div className="card admin-card">
        <h3>Invariants I1–I7</h3>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th style={{ width: 72 }}>Id</th><th style={{ width: 100 }}>Result</th><th className="wrap">Meaning</th></tr>
            </thead>
            <tbody>
              {invEntries.map(([k, v]) => {
                const row = v as { pass: boolean; meaning?: string; violations?: number };
                return (
                  <tr key={k}>
                    <td>{k}</td>
                    <td><span className={`badge ${row.pass ? 'badge-success' : 'badge-danger'}`}>{row.pass ? 'PASS' : 'FAIL'}</span></td>
                    <td className="text-muted">{row.meaning}</td>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="admin-kpi">
      <div className="admin-kpi-label">{label}</div>
      <div className={`admin-kpi-value${tone === 'ok' ? ' ok' : tone === 'bad' ? ' bad' : ''}`}>{value}</div>
    </div>
  );
}

function BookTable({ title, rows }: { title: string; rows: NettingBook['buys'] }) {
  return (
    <div className="card admin-card">
      <h3>{title} <span className="text-muted">{rows.length}</span></h3>
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>Id</th><th>Owner</th><th>Type</th><th>Status</th><th>Remain</th><th>Limit</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 16 }}>Empty</td></tr>
            ) : rows.map((r) => (
              <tr key={r.orderId}>
                <td>{r.orderId}</td>
                <td>{r.simulated ? 'computer' : r.owner}</td>
                <td>{r.type}</td>
                <td>{r.status}</td>
                <td>{num(r.remaining)}</td>
                <td>{r.limit ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
