import { ReactNode, useEffect, useMemo, useState } from 'react';

export type AdminColumn<T> = {
  id: string;
  label: string;
  /** Omit on a column that should not sort, such as a row of buttons. */
  sort?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  wrap?: boolean;
  actions?: boolean;
  /** This column takes the spare width. The others stay as wide as their text. */
  fill?: boolean;
  /** Direction used the first time this column is chosen. */
  firstDir?: 'asc' | 'desc';
};

const PAGE_SIZE = 50;

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Admin list: dense cells, a scroll pane with a stuck header, and pages of 50.
 * Lists of 50 or fewer stay on one page.
 */
export function AdminDataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  initialDir = 'desc',
  resetKey = '',
}: {
  rows: T[];
  columns: AdminColumn<T>[];
  rowKey: (row: T) => string | number;
  initialSort?: string;
  initialDir?: 'asc' | 'desc';
  resetKey?: string;
}) {
  const [sortId, setSortId] = useState(initialSort ?? '');
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === sortId && c.sort);
    if (!col?.sort) return rows;
    const sign = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => sign * compare(col.sort!(a), col.sort!(b)));
  }, [rows, columns, sortId, dir]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const slice = sorted.length > PAGE_SIZE ? sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE) : sorted;

  function choose(col: AdminColumn<T>) {
    if (!col.sort) return;
    setPage(0);
    if (sortId === col.id) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortId(col.id);
      setDir(col.firstDir ?? 'asc');
    }
  }

  return (
    <div className="admin-grid">
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={[col.actions ? 'actions' : '', col.wrap ? 'wrap' : '', col.fill ? 'fill' : ''].filter(Boolean).join(' ') || undefined}
                  aria-sort={!col.sort ? undefined : sortId === col.id ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {col.sort ? (
                    <button type="button" className={`admin-sort${sortId === col.id ? ' on' : ''}`} onClick={() => choose(col)}>
                      {col.label}
                      <span className="arrow" aria-hidden="true">{sortId === col.id ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-muted" style={{ textAlign: 'center' }}>Nothing here</td>
              </tr>
            ) : slice.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.id} className={[col.actions ? 'actions' : '', col.wrap ? 'wrap' : '', col.fill ? 'fill' : ''].filter(Boolean).join(' ') || undefined}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE_SIZE ? (
        <div className="admin-pager">
          <span className="text-muted">{sorted.length} records · page {safePage + 1} of {pages}</span>
          <span className="admin-actions">
            <button type="button" className="btn btn-outline btn-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
