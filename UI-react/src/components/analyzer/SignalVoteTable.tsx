import { useI18n } from '@/hooks/useI18n';
import { NUM_LOCALE } from '@/lib/format';

export interface SignalVote {
    name: string;
    value: number;
    action: string;
    group?: string;
}

export function signalGroup(row: SignalVote): 'ma' | 'oscillator' {
    if (row.group === 'ma' || row.group === 'oscillator') return row.group;
    return row.name.startsWith('SMA') || row.name.startsWith('EMA') ? 'ma' : 'oscillator';
}

function formatSignalValue(name: string, value: number): string {
    if (name.startsWith('RSI') || name.startsWith('Stochastic')) {
        return value.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    const abs = Math.abs(value);
    const digits = abs >= 100 ? 2 : abs >= 10 ? 3 : 5;
    return value.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

function voteClass(action: string): string {
    if (action.includes('BUY')) return 'analyzer-badge-buy';
    if (action.includes('SELL')) return 'analyzer-badge-sell';
    return 'analyzer-badge-neutral';
}

export function SignalVoteTable({ title, rows }: { title: string; rows: SignalVote[] }) {
    const { t } = useI18n();
    const voteWord = (action: string) =>
        action === 'BUY' ? t('analyzer.buy') : action === 'SELL' ? t('analyzer.sell') : t('analyzer.neutral');

    return (
        <div className="analyzer-vote-table">
            <div className="analyzer-vote-title">{title}</div>
            <div className="analyzer-vote-grid analyzer-vote-head">
                <span>{t('analyzer.colName')}</span>
                <span className="analyzer-vote-end">{t('analyzer.colValue')}</span>
                <span className="analyzer-vote-end">{t('analyzer.colVote')}</span>
            </div>
            {rows.map(row => (
                <div key={row.name} className="analyzer-vote-grid analyzer-vote-row">
                    <span className="analyzer-vote-name">{row.name}</span>
                    <span className="analyzer-vote-value">{formatSignalValue(row.name, row.value)}</span>
                    <span className={`analyzer-vote-pill ${voteClass(row.action)}`}>{voteWord(row.action)}</span>
                </div>
            ))}
        </div>
    );
}
