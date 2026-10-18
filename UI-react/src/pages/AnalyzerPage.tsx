import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { BackPageHeader } from '@/components/BackPageHeader';
import { AssetIcon } from '@/components/AssetIcon';
import { ReplayLine } from '@/components/analyzer/ReplayLine';
import { SignalVoteTable, signalGroup, type SignalVote } from '@/components/analyzer/SignalVoteTable';
import { SpeedometerGauge } from '@/components/analyzer/SpeedometerGauge';
import { NUM_LOCALE } from '@/lib/format';

interface IndicatorStatus {
    status: string;
    statusHe?: string;
    statusRu?: string;
}

interface AnalysisResult {
    symbol: string;
    recommendation: string;
    recommendationHe: string;
    recommendationRu?: string;
    score: number;
    confidence: number;
    color: string;
    price: number;
    category?: string;
    indicators: {
        rsi: ({ value: number } & IndicatorStatus) | null;
        macd: ({ macdLine: number; signalLine: number; hist: number } & IndicatorStatus) | null;
        sma: ({ sma20: number; sma50: number } & IndicatorStatus) | null;
        bb: ({ upper: number; middle: number; lower: number } & IndicatorStatus) | null;
    };
    explanationsEn: string[];
    explanationsHe: string[];
    explanationsRu?: string[];
    summary: string;
    summaryHe: string;
    summaryRu?: string;
    available?: boolean;
    votes?: { buy: number; neutral: number; sell: number };
    signals?: SignalVote[];
    levels?: PriceLevels;
    replay?: ReplayResult;
}

interface ReplayResult {
    available?: boolean;
    stake?: number;
    endValue?: number;
    changePct?: number;
    entries?: number;
    fees?: number;
    bars?: number;
    points?: number[];
}

interface PriceLevels {
    support?: number;
    resistance?: number;
}

function formatLevel(value: number): string {
    const abs = Math.abs(value);
    const digits = abs >= 100 ? 2 : abs >= 10 ? 3 : 5;
    return value.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

/** English, then the language the page is actually in. Missing text stays English. */
function pick(lang: string, en?: string, he?: string, ru?: string): string {
    if (lang === 'he') return he || en || '';
    if (lang === 'ru') return ru || en || '';
    return en || '';
}

interface OverviewAsset {
    symbol: string;
    category: string;
    nameEn: string;
    nameHe: string;
    nameRu?: string;
    price: number;
    recommendation: string;
    recommendationHe: string;
    recommendationRu?: string;
    confidence: number;
    color: string;
    rsi: number;
    macdStatus: string;
    macdStatusHe: string;
    macdStatusRu?: string;
}

/** Names only. Prices and votes come from the server, never from this list. */
interface AssetName {
    symbol: string;
    category: string;
    nameEn: string;
    nameHe: string;
    nameRu: string;
}

const ASSET_NAMES: AssetName[] = [
    { symbol: 'BTCUSD', category: 'crypto', nameEn: 'Bitcoin', nameHe: 'ביטקוין', nameRu: 'Биткоин' },
    { symbol: 'ETHUSD', category: 'crypto', nameEn: 'Ethereum', nameHe: 'אתריום', nameRu: 'Эфириум' },
    { symbol: 'SOLUSD', category: 'crypto', nameEn: 'Solana', nameHe: 'סולאנה', nameRu: 'Solana' },
    { symbol: 'XRPUSD', category: 'crypto', nameEn: 'Ripple XRP', nameHe: 'ריפל', nameRu: 'Ripple XRP' },
    { symbol: 'EURUSD', category: 'forex', nameEn: 'Euro / US Dollar', nameHe: 'אירו / דולר', nameRu: 'Евро / доллар США' },
    { symbol: 'GBPUSD', category: 'forex', nameEn: 'British Pound / US Dollar', nameHe: 'פאונד / דולר', nameRu: 'Фунт / доллар США' },
    { symbol: 'USDJPY', category: 'forex', nameEn: 'US Dollar / Japanese Yen', nameHe: 'דולר / ין יפני', nameRu: 'Доллар США / иена' },
    { symbol: 'GBPJPY', category: 'forex', nameEn: 'British Pound / Japanese Yen', nameHe: 'פאונד / ין יפני', nameRu: 'Фунт / иена' },
    { symbol: 'USDCAD', category: 'forex', nameEn: 'US Dollar / Canadian Dollar', nameHe: 'דולר / דולר קנדי', nameRu: 'Доллар США / канадский доллар' },
    { symbol: 'NZDUSD', category: 'forex', nameEn: 'NZ Dollar / US Dollar', nameHe: 'דולר ניו זילנדי / דולר', nameRu: 'Новозеландский доллар / доллар США' },
    { symbol: 'XAUUSD', category: 'metals', nameEn: 'Gold / US Dollar (Oz)', nameHe: 'זהב / דולר (אונקיה)', nameRu: 'Золото / доллар США (унция)' },
    { symbol: 'XAGUSD', category: 'metals', nameEn: 'Silver / US Dollar (Oz)', nameHe: 'כסף / דולר (אונקיה)', nameRu: 'Серебро / доллар США (унция)' },
];

function blankAssets(): OverviewAsset[] {
    return ASSET_NAMES.map(asset => ({
        ...asset,
        price: 0,
        recommendation: '',
        recommendationHe: '',
        recommendationRu: '',
        confidence: 0,
        color: '#94a3b8',
        rsi: 0,
        macdStatus: '',
        macdStatusHe: '',
        macdStatusRu: '',
    }));
}

function unavailableAnalysis(symbol: string): AnalysisResult {
    return {
        symbol,
        recommendation: 'NEUTRAL',
        recommendationHe: 'נייטרלי',
        recommendationRu: 'нейтрально',
        score: 0,
        confidence: 0,
        color: '#94a3b8',
        price: 0,
        available: false,
        votes: { buy: 0, neutral: 0, sell: 0 },
        indicators: { rsi: null, macd: null, sma: null, bb: null },
        explanationsEn: [],
        explanationsHe: [],
        explanationsRu: [],
        summary: 'The market server did not return enough candles for this symbol.',
        summaryHe: 'שרת השוק לא החזיר מספיק נרות לנכס הזה.',
        summaryRu: 'Сервер рынка не вернул достаточно свечей по этому инструменту.',
    };
}

export function AnalyzerPage() {
    const { t, lang } = useI18n();
    const navigate = useNavigate();

    useEffect(() => {
        document.title = t('titles.analyzer');
    }, [t]);

    const [assets, setAssets] = useState<OverviewAsset[]>(blankAssets);
    const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSD');
    const [selectedCategory, setSelectedCategory] = useState<string>('crypto');
    const [candleInterval, setCandleInterval] = useState<'1h' | '1d'>('1h');
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

    const [loadingOverview, setLoadingOverview] = useState(false);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');

    const isRtl = lang === 'he';

    // Fetch all assets overview from backend, fall back seamlessly
    useEffect(() => {
        let active = true;

        const fetchOverview = async () => {
            try {
                const res = await fetch(`/api/market/analysis/all?interval=${candleInterval}`);
                if (res.ok && active) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        // Merge backend data with names
                        const merged = data.map((bItem: any) => {
                            const fallback = ASSET_NAMES.find(f => f.symbol === bItem.symbol);
                            return {
                                ...fallback,
                                ...bItem,
                                nameEn: fallback?.nameEn || bItem.symbol,
                                nameHe: fallback?.nameHe || bItem.symbol,
                                nameRu: fallback?.nameRu || bItem.symbol,
                                recommendationRu: bItem.recommendationRu || bItem.recommendation,
                            };
                        });
                        setAssets(merged);
                    }
                }
            } catch {
                // Keep resilient fallback assets
            } finally {
                if (active) setLoadingOverview(false);
            }
        };

        void fetchOverview();
        const interval = setInterval(fetchOverview, 10000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [candleInterval]);

    // Fetch detailed analysis for selected asset, fall back seamlessly
    useEffect(() => {
        let active = true;
        setAnalysis(null);
        setLoadingAnalysis(true);

        const fetchAnalysis = async () => {
            try {
                const res = await fetch(`/api/market/analysis?symbol=${selectedSymbol}&category=${selectedCategory}&interval=${candleInterval}`);
                if (res.ok && active) {
                    const data = await res.json();
                    if (data && data.symbol) {
                        setAnalysis(data);
                        return;
                    }
                }
            } catch {
                // Leave the last real summary on screen when a refresh fails.
            } finally {
                if (active) setLoadingAnalysis(false);
            }

            if (active) {
                setAnalysis(prev => (prev && prev.symbol === selectedSymbol ? prev : unavailableAnalysis(selectedSymbol)));
            }
        };

        void fetchAnalysis();
        const interval = setInterval(fetchAnalysis, 8000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [selectedSymbol, selectedCategory, candleInterval]);

    const handleAssetSelect = (symbol: string, category: string) => {
        setSelectedSymbol(symbol);
        setSelectedCategory(category);
    };

    const handleTradeNow = () => {
        navigate(`/charts?symbol=${selectedSymbol}&category=${selectedCategory}`);
    };

    // Filter logic
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            const term = searchTerm.toLowerCase().trim();
            const matchesSearch =
                !term ||
                asset.symbol.toLowerCase().includes(term) ||
                asset.nameEn?.toLowerCase().includes(term) ||
                asset.nameHe?.toLowerCase().includes(term);
            const matchesCategory = filterCategory === 'all' || asset.category === filterCategory;
            return matchesSearch && matchesCategory;
        });
    }, [assets, searchTerm, filterCategory]);

    // Current selected asset metadata
    const currentAssetMeta = useMemo(() => {
        return assets.find(a => a.symbol === selectedSymbol) ||
            ASSET_NAMES.find(a => a.symbol === selectedSymbol) ||
            {
                symbol: selectedSymbol,
                category: selectedCategory,
                nameEn: selectedSymbol,
                nameHe: selectedSymbol,
                nameRu: selectedSymbol,
                price: analysis?.price || 0,
            };
    }, [assets, selectedSymbol, selectedCategory, analysis?.price]);

    // Speedometer angle calculation (score from -7.5 to 7.5 yields -90 to +90 deg)
    const score = analysis?.score ?? 0;
    const dialAngle = Math.min(90, Math.max(-90, (score / 7.5) * 90));

    // Get color code by recommendation value
    const getRecBadgeClass = (rec: string) => {
        if (rec.includes('BUY')) return 'analyzer-badge-buy';
        if (rec.includes('SELL')) return 'analyzer-badge-sell';
        return 'analyzer-badge-neutral';
    };

    const maSignals = (analysis?.signals ?? []).filter(row => signalGroup(row) === 'ma');
    const oscillatorSignals = (analysis?.signals ?? []).filter(row => signalGroup(row) === 'oscillator');

    const levelGap = (level: number) => {
        if (!analysis?.price) return '';
        const n = Math.abs((level - analysis.price) / analysis.price * 100).toLocaleString(NUM_LOCALE, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return level > analysis.price ? t('analyzer.abovePct', { n }) : t('analyzer.belowPct', { n });
    };

    return (
        <>
            <BackPageHeader titleKey="nav.analyzer" />

            <div className="container" style={{ maxWidth: 1400, marginTop: 24, marginBottom: 40 }}>
                
                {/* HEADER INTRO BANNER */}
                <div
                    className="card"
                    style={{
                        padding: '24px 28px',
                        marginBottom: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 20,
                        flexWrap: 'wrap',
                        background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.08) 0%, rgba(16, 24, 40, 0.6) 100%)',
                        borderColor: 'rgba(234, 179, 8, 0.25)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <div
                            style={{
                                width: 52,
                                height: 52,
                                borderRadius: 16,
                                background: 'linear-gradient(135deg, var(--accent-strong), var(--accent))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 20px var(--accent-glow)',
                                flexShrink: 0,
                            }}
                        >
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                <circle cx="12" cy="12" r="4" />
                            </svg>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                                {t('analyzer.title')}
                            </h2>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {t('analyzer.subtitle')}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 14px',
                                borderRadius: 10,
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                color: 'var(--green)',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                            }}
                        >
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: 'var(--green)',
                                    boxShadow: '0 0 8px var(--green)',
                                    animation: 'pulseDot 2s infinite',
                                }}
                            />
                            {t('analyzer.live')}
                        </span>
                    </div>
                </div>

                {/* 2-COLUMN MAIN WORKSPACE */}
                <div className="analyzer-workspace-grid">
                    
                    {/* LEFT COLUMN: ASSET LIST BOARD */}
                    <div
                        className="card analyzer-asset-board"
                        style={{
                            padding: '18px 14px 14px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.75) 0%, rgba(12, 17, 29, 0.85) 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                        }}
                    >
                        <div style={{ marginBottom: 14, flexShrink: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
                                    <h3 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                                        {t('analyzer.board')}
                                    </h3>
                                </div>
                                <span
                                    style={{
                                        fontSize: '0.72rem',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 700,
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        padding: '3px 8px',
                                        borderRadius: 20,
                                    }}
                                >
                                    {t('analyzer.assets', { n: filteredAssets.length })}
                                </span>
                            </div>

                            {/* Search bar with built-in search icon and clear button */}
                            <div style={{ position: 'relative', marginBottom: 10 }}>
                                <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{
                                        position: 'absolute',
                                        [isRtl ? 'right' : 'left']: 12,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--text-muted)',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>

                                <input
                                    type="text"
                                    placeholder={t('analyzer.search')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="form-control analyzer-search-input"
                                    style={{
                                        paddingInlineStart: 34,
                                        paddingInlineEnd: searchTerm ? 32 : 12,
                                        paddingTop: 8,
                                        paddingBottom: 8,
                                        fontSize: '0.84rem',
                                        background: 'rgba(0, 0, 0, 0.4)',
                                        borderColor: 'rgba(255, 255, 255, 0.08)',
                                        borderRadius: 10,
                                        color: 'var(--text-primary)',
                                    }}
                                />

                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        style={{
                                            position: 'absolute',
                                            [isRtl ? 'left' : 'right']: 10,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: 18,
                                            height: 18,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            lineHeight: 1,
                                            padding: 0,
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Modern Segmented Control for Category Tabs */}
                            <div
                                style={{
                                    display: 'flex',
                                    background: 'rgba(0, 0, 0, 0.35)',
                                    padding: 3,
                                    borderRadius: 10,
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                    gap: 3,
                                }}
                            >
                                {(['all', 'crypto', 'forex', 'metals'] as const).map(id => {
                                    const isActive = filterCategory === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setFilterCategory(id)}
                                            className="analyzer-tab-btn"
                                            style={{
                                                flex: 1,
                                                padding: '6px 0',
                                                fontSize: '0.75rem',
                                                borderRadius: 7,
                                                fontWeight: isActive ? 700 : 500,
                                                border: isActive ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent',
                                                background: isActive
                                                    ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.22) 0%, rgba(234, 179, 8, 0.08) 100%)'
                                                    : 'transparent',
                                                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                                boxShadow: isActive ? '0 2px 8px rgba(234, 179, 8, 0.15)' : 'none',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {t(`analyzer.cat.${id}`)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Assets scrollable list with zero container spill */}
                        {loadingOverview && assets.length === 0 ? (
                            <div style={{ display: 'flex', flex: 1, minHeight: 240, justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
                                <div className="loading-spinner" />
                                <span style={{ marginInlineStart: 10 }}>{t('common.loading')}</span>
                            </div>
                        ) : (
                            <div
                                className="analyzer-scroll-list"
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    paddingInlineEnd: 4,
                                }}
                            >
                                {filteredAssets.map(asset => {
                                    const isSelected = asset.symbol === selectedSymbol;
                                    return (
                                        <div
                                            key={asset.symbol}
                                            onClick={() => handleAssetSelect(asset.symbol, asset.category)}
                                            className={`analyzer-asset-item ${isSelected ? 'selected' : ''}`}
                                            style={{
                                                position: 'relative',
                                                padding: '10px 12px',
                                                background: isSelected
                                                    ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.14) 0%, rgba(20, 28, 45, 0.85) 100%)'
                                                    : 'rgba(0, 0, 0, 0.22)',
                                                border: isSelected
                                                    ? '1px solid rgba(234, 179, 8, 0.55)'
                                                    : '1px solid rgba(255, 255, 255, 0.06)',
                                                borderRadius: 12,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 10,
                                                boxShadow: isSelected ? '0 4px 18px rgba(234, 179, 8, 0.16)' : 'none',
                                            }}
                                        >
                                            {/* Active Accent Bar on leading edge */}
                                            {isSelected && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 6,
                                                        bottom: 6,
                                                        [isRtl ? 'right' : 'left']: 0,
                                                        width: 3.5,
                                                        borderRadius: 3,
                                                        background: 'var(--accent)',
                                                        boxShadow: '0 0 8px var(--accent)',
                                                    }}
                                                />
                                            )}

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, paddingInlineStart: isSelected ? 4 : 0 }}>
                                                {/* AUTHENTIC CURRENCY/COIN ICON */}
                                                <AssetIcon symbol={asset.symbol} size={36} />

                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <span style={{ fontWeight: 800, fontSize: '0.92rem', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                                                            {asset.symbol}
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontSize: '0.6rem',
                                                                background: 'rgba(255, 255, 255, 0.07)',
                                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                                padding: '1px 5px',
                                                                borderRadius: 4,
                                                                textTransform: 'uppercase',
                                                                color: 'var(--text-muted)',
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {asset.category}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                                                        {pick(lang, asset.nameEn, asset.nameHe, asset.nameRu)}
                                                    </div>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                                        {asset.price ? `$${asset.price.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                                                <span
                                                    className={getRecBadgeClass(asset.recommendation)}
                                                    style={{
                                                        fontSize: '0.66rem',
                                                        padding: '3px 8px',
                                                        borderRadius: 6,
                                                        fontWeight: 800,
                                                        minWidth: 62,
                                                        textAlign: 'center',
                                                        letterSpacing: '0.02em',
                                                    }}
                                                >
                                                    {asset.recommendation
                                                        ? pick(lang, asset.recommendation, asset.recommendationHe, asset.recommendationRu)
                                                        : '…'}
                                                </span>
                                                {asset.recommendation ? (
                                                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                                        {t('analyzer.confidence', { n: asset.confidence })}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredAssets.length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 10px', fontSize: '0.85rem' }}>
                                        {t('analyzer.noMatch')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: DETAILED QUANT ANALYSIS & SPEEDOMETER */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        
                        {loadingAnalysis && !analysis ? (
                            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, gap: 14 }}>
                                <div className="loading-spinner" style={{ width: 36, height: 36 }} />
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                                    {t('analyzer.analyzing')}
                                </div>
                            </div>
                        ) : analysis ? (
                            <>
                                {/* HERO CARD: DIAL GAUGE + ASSET HEADER + TRADE NOW */}
                                <div
                                    className="card"
                                    style={{
                                        padding: 30,
                                        display: 'flex',
                                        gap: 30,
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        background: 'linear-gradient(135deg, rgba(16, 24, 40, 0.6) 0%, rgba(24, 34, 54, 0.7) 100%)',
                                        position: 'relative',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {/* Ambient background glow */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: -60,
                                            right: isRtl ? 'auto' : -60,
                                            left: isRtl ? -60 : 'auto',
                                            width: 200,
                                            height: 200,
                                            borderRadius: '50%',
                                            background: analysis.color === '#10b981' ? 'var(--green-glow)' : analysis.color === '#f43f5e' ? 'var(--red-glow)' : 'var(--accent-glow)',
                                            filter: 'blur(60px)',
                                            pointerEvents: 'none',
                                        }}
                                    />

                                    {/* SPEEDOMETER GAUGE */}
                                    <SpeedometerGauge
                                        dialAngle={dialAngle}
                                        recommendation={pick(lang, analysis.recommendation, analysis.recommendationHe, analysis.recommendationRu)}
                                        confidence={analysis.confidence}
                                        color={analysis.color}
                                    />

                                    {/* MIDDLE: ASSET HEADER WITH REAL ICON & RECOMMENDATION */}
                                    <div style={{ flex: 1, minWidth: 260 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                                            {/* PROMINENT AUTHENTIC COIN ICON */}
                                            <AssetIcon symbol={analysis.symbol} size={54} />

                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                                                        {analysis.symbol}
                                                    </span>
                                                    <span
                                                        className={getRecBadgeClass(analysis.recommendation)}
                                                        style={{
                                                            fontSize: '0.85rem',
                                                            padding: '4px 12px',
                                                            borderRadius: 8,
                                                            fontWeight: 800,
                                                            letterSpacing: '0.03em',
                                                        }}
                                                    >
                                                        {pick(lang, analysis.recommendation, analysis.recommendationHe, analysis.recommendationRu)}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>
                                                    {pick(lang, currentAssetMeta.nameEn, currentAssetMeta.nameHe, currentAssetMeta.nameRu)}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                            {(['1h', '1d'] as const).map(iv => (
                                                <button
                                                    key={iv}
                                                    type="button"
                                                    onClick={() => setCandleInterval(iv)}
                                                    style={{
                                                        padding: '4px 12px',
                                                        borderRadius: 8,
                                                        fontWeight: 700,
                                                        fontSize: '0.78rem',
                                                        cursor: 'pointer',
                                                        color: 'var(--text-primary)',
                                                        border: candleInterval === iv ? '1px solid var(--accent)' : '1px solid var(--border-light)',
                                                        background: candleInterval === iv ? 'rgba(234, 179, 8, 0.16)' : 'transparent',
                                                    }}
                                                >
                                                    {iv === '1h' ? t('analyzer.hour') : t('analyzer.day')}
                                                </button>
                                            ))}
                                        </div>

                                        <p style={{ margin: '12px 0', fontSize: '0.94rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {pick(lang, analysis.summary, analysis.summaryHe, analysis.summaryRu)}
                                        </p>

                                        {analysis.votes && analysis.available !== false ? (
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                                <span className="analyzer-badge-buy" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 8, fontWeight: 800 }}>
                                                    {t('analyzer.buy')} {analysis.votes.buy}
                                                </span>
                                                <span className="analyzer-badge-neutral" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 8, fontWeight: 800 }}>
                                                    {t('analyzer.neutral')} {analysis.votes.neutral}
                                                </span>
                                                <span className="analyzer-badge-sell" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 8, fontWeight: 800 }}>
                                                    {t('analyzer.sell')} {analysis.votes.sell}
                                                </span>
                                            </div>
                                        ) : null}

                                        {/* Share of the votes that landed on the summary */}
                                        {analysis.available === false ? null : (
                                        <div style={{ marginTop: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                                                <span style={{ fontWeight: 600 }}>{t('analyzer.confidenceScore')}</span>
                                                <span style={{ fontWeight: 800, color: analysis.color }}>{analysis.confidence}%</span>
                                            </div>
                                            <div style={{ height: 8, width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        width: `${analysis.confidence}%`,
                                                        background: analysis.color,
                                                        boxShadow: `0 0 10px ${analysis.color}`,
                                                        borderRadius: 4,
                                                        transition: 'width 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        )}
                                    </div>

                                    {/* RIGHT: LIVE PRICE & TRADE NOW ACTION */}
                                    <div
                                        style={{
                                            padding: '20px 24px',
                                            background: 'rgba(0, 0, 0, 0.35)',
                                            borderRadius: 16,
                                            border: '1px solid var(--border-light)',
                                            textAlign: 'center',
                                            minWidth: 180,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                            {t('analyzer.livePrice')}
                                        </div>
                                        <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--accent-strong)', margin: '8px 0 16px', letterSpacing: '-0.02em' }}>
                                            {analysis.available !== false && typeof analysis.price === 'number' && analysis.price > 0
                                                ? `$${analysis.price.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`
                                                : '—'}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleTradeNow}
                                            className="btn btn-primary"
                                            style={{
                                                width: '100%',
                                                padding: '12px 18px',
                                                fontSize: '0.9rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.02em',
                                            }}
                                        >
                                            {t('analyzer.trade')}
                                        </button>
                                    </div>
                                </div>

                                {analysis.available === false ? null : (
                                <>
                                {/* 4 TECHNICAL INDICATORS TILES */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                                    
                                    {/* 1. RSI CARD */}
                                    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>RSI (14)</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.rsi?.status?.includes('OVERSOLD') ? 'BUY' : analysis.indicators?.rsi?.status?.includes('OVERBOUGHT') ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {pick(lang, analysis.indicators?.rsi?.status, analysis.indicators?.rsi?.statusHe, analysis.indicators?.rsi?.statusRu)}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, margin: '8px 0', display: 'flex', alignItems: 'baseline', gap: 4, color: 'var(--text-primary)' }}>
                                            {typeof analysis.indicators?.rsi?.value === 'number' ? analysis.indicators.rsi.value.toFixed(1) : '—'}
                                            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ 100</span>
                                        </div>
                                        {/* Slider bar with zones */}
                                        <div style={{ position: 'relative', height: 12, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
                                            <div style={{ position: 'absolute', right: 0, width: '30%', height: '100%', background: 'rgba(244, 63, 94, 0.18)', borderLeft: '1px solid rgba(244, 63, 94, 0.4)' }} />
                                            <div style={{ position: 'absolute', left: 0, width: '30%', height: '100%', background: 'rgba(16, 185, 129, 0.18)', borderRight: '1px solid rgba(16, 185, 129, 0.4)' }} />
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: `${typeof analysis.indicators?.rsi?.value === 'number' ? Math.min(100, Math.max(0, analysis.indicators.rsi.value)) : 50}%`,
                                                    transform: 'translateX(-50%)',
                                                    top: 0,
                                                    width: 4,
                                                    height: '100%',
                                                    background: '#ffffff',
                                                    boxShadow: '0 0 8px #ffffff',
                                                    borderRadius: 2,
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6, fontWeight: 500 }}>
                                            <span>30 ({t('analyzer.oversold')})</span>
                                            <span>70 ({t('analyzer.overbought')})</span>
                                        </div>
                                    </div>

                                    {/* 2. MACD CARD */}
                                    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>MACD (12, 26, 9)</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.macd?.status === 'BULLISH' ? 'BUY' : analysis.indicators?.macd?.status === 'BEARISH' ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {pick(lang, analysis.indicators?.macd?.status, analysis.indicators?.macd?.statusHe, analysis.indicators?.macd?.statusRu)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>MACD Line:</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.macd?.macdLine === 'number' ? analysis.indicators.macd.macdLine.toFixed(4) : '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Signal Line:</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.macd?.signalLine === 'number' ? analysis.indicators.macd.signalLine.toFixed(4) : '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Histogram:</span>
                                                <span style={{ fontWeight: 800, color: (analysis.indicators?.macd?.hist ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {typeof analysis.indicators?.macd?.hist === 'number' ? analysis.indicators.macd.hist.toFixed(4) : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. MOVING AVERAGES CARD */}
                                    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{t('analyzer.movingAverages')}</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.sma?.status === 'BULLISH' ? 'BUY' : analysis.indicators?.sma?.status === 'BEARISH' ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {pick(lang, analysis.indicators?.sma?.status, analysis.indicators?.sma?.statusHe, analysis.indicators?.sma?.statusRu)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>SMA 20:</span>
                                                <span style={{ fontWeight: 700, color: analysis.price > (analysis.indicators?.sma?.sma20 || 0) ? 'var(--green)' : 'var(--red)' }}>
                                                    {typeof analysis.indicators?.sma?.sma20 === 'number' ? `$${analysis.indicators.sma.sma20.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>SMA 50:</span>
                                                <span style={{ fontWeight: 700, color: analysis.price > (analysis.indicators?.sma?.sma50 || 0) ? 'var(--green)' : 'var(--red)' }}>
                                                    {typeof analysis.indicators?.sma?.sma50 === 'number' ? `$${analysis.indicators.sma.sma50.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
                                            {analysis.price > (analysis.indicators?.sma?.sma20 || 0)
                                                ? t('analyzer.aboveMa')
                                                : t('analyzer.belowMa')}
                                        </div>
                                    </div>

                                    {/* 4. BOLLINGER BANDS CARD */}
                                    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Bollinger Bands (20, 2)</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.bb?.status?.includes('OVERSOLD') ? 'BUY' : analysis.indicators?.bb?.status?.includes('OVERBOUGHT') ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {pick(lang, analysis.indicators?.bb?.status, analysis.indicators?.bb?.statusHe, analysis.indicators?.bb?.statusRu)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Upper Band:</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.bb?.upper === 'number' ? `$${analysis.indicators.bb.upper.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Middle (Basis):</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.bb?.middle === 'number' ? `$${analysis.indicators.bb.middle.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Lower Band:</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.bb?.lower === 'number' ? `$${analysis.indicators.bb.lower.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* INDICATOR VOTES, THEN THE NEAREST TURN ON THESE CANDLES */}
                                <div className="card" style={{ padding: 24 }}>
                                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                                        {t('analyzer.breakdown')}
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
                                        <SignalVoteTable title={t('analyzer.movingAverages')} rows={maSignals} />
                                        <SignalVoteTable title={t('analyzer.oscillators')} rows={oscillatorSignals} />
                                    </div>
                                    <p style={{ margin: '16px 0 0', fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                                        {t('analyzer.voteRule')}
                                    </p>
                                </div>

                                <div className="card" style={{ padding: 24 }}>
                                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                                        {t('analyzer.levels')}
                                    </h4>
                                    <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('analyzer.levelsNote')}</p>
                                    {[
                                        { label: t('analyzer.resistance'), level: analysis.levels?.resistance },
                                        { label: t('analyzer.support'), level: analysis.levels?.support },
                                    ].map(row => (
                                        <div
                                            key={row.label}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(7rem, 1fr) auto auto',
                                                columnGap: 16,
                                                alignItems: 'center',
                                                padding: '10px 0',
                                                borderTop: '1px solid var(--border-light)',
                                            }}
                                        >
                                            <span style={{ fontWeight: 700 }}>{row.label}</span>
                                            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                                {typeof row.level === 'number' ? formatLevel(row.level) : '—'}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap', textAlign: 'end' }}>
                                                {typeof row.level === 'number' ? levelGap(row.level) : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="card" style={{ padding: 24 }}>
                                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                                        {t('analyzer.replayTitle')}
                                    </h4>
                                    <p style={{ margin: '0 0 14px', fontSize: '0.9rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                                        {t('analyzer.replayText')}
                                    </p>
                                    {analysis.replay?.available && analysis.replay.points && analysis.replay.points.length > 1 ? (
                                        <>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: (analysis.replay.changePct ?? 0) > 0 ? '#10b981' : (analysis.replay.changePct ?? 0) < 0 ? '#f43f5e' : 'var(--text-secondary)' }}>
                                                {(analysis.replay.changePct ?? 0) > 0 ? '+' : ''}
                                                {(analysis.replay.changePct ?? 0).toLocaleString(NUM_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                            </div>
                                            <div style={{ margin: '6px 0 8px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {t('analyzer.replayBecame', {
                                                    n: Math.round(analysis.replay.endValue ?? 10000).toLocaleString(NUM_LOCALE),
                                                })}
                                            </div>
                                            <ReplayLine points={analysis.replay.points} up={(analysis.replay.changePct ?? 0) > 0} />
                                            <p style={{ margin: '8px 0 0', fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                                                {t('analyzer.replayNote')}
                                                {(analysis.replay.entries ?? 0) > 0
                                                    ? ` ${t('analyzer.replayEntries', { n: analysis.replay.entries ?? 0 })}.`
                                                    : ''}
                                            </p>
                                            {(analysis.replay.entries ?? 0) === 0 ? (
                                                <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('analyzer.replayFlat')}</p>
                                            ) : null}
                                        </>
                                    ) : (
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('analyzer.replayEmpty')}</p>
                                    )}
                                </div>
                                </>
                                )}
                            </>
                        ) : null}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes pulseDot {
                    0% { transform: scale(0.95); opacity: 0.8; }
                    50% { transform: scale(1.3); opacity: 1; }
                    100% { transform: scale(0.95); opacity: 0.8; }
                }
                .analyzer-asset-board {
                    transition: border-color 0.25s ease, box-shadow 0.25s ease !important;
                }
                .analyzer-asset-board:hover {
                    transform: none !important;
                    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45) !important;
                }
                .analyzer-search-input:focus {
                    border-color: rgba(234, 179, 8, 0.5) !important;
                    box-shadow: 0 0 14px rgba(234, 179, 8, 0.2) !important;
                    outline: none;
                }
                .analyzer-tab-btn {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .analyzer-tab-btn:hover:not([style*="linear-gradient"]) {
                    background: rgba(255, 255, 255, 0.07) !important;
                    color: var(--text-primary) !important;
                }
                .analyzer-scroll-list {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
                }
                .analyzer-scroll-list::-webkit-scrollbar {
                    width: 5px;
                }
                .analyzer-scroll-list::-webkit-scrollbar-track {
                    background: transparent;
                }
                .analyzer-scroll-list::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.12);
                    border-radius: 4px;
                }
                .analyzer-scroll-list::-webkit-scrollbar-thumb:hover {
                    background: rgba(234, 179, 8, 0.4);
                }
                .analyzer-asset-item {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .analyzer-asset-item:hover:not(.selected) {
                    background: rgba(255, 255, 255, 0.05) !important;
                    border-color: rgba(255, 255, 255, 0.14) !important;
                    transform: translateX(${isRtl ? '-2px' : '2px'});
                }
                .analyzer-badge-buy {
                    background: var(--green-glow);
                    color: var(--green);
                    border: 1px solid rgba(16, 185, 129, 0.35);
                    box-shadow: 0 0 10px rgba(16, 185, 129, 0.15);
                }
                .analyzer-badge-sell {
                    background: var(--red-glow);
                    color: var(--red);
                    border: 1px solid rgba(244, 63, 94, 0.35);
                    box-shadow: 0 0 10px rgba(244, 63, 94, 0.15);
                }
                .analyzer-badge-neutral {
                    background: var(--accent-glow);
                    color: var(--accent);
                    border: 1px solid rgba(234, 179, 8, 0.35);
                    box-shadow: 0 0 10px rgba(234, 179, 8, 0.15);
                }
            `}</style>
        </>
    );
}
