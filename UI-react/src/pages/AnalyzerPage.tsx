import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { BackPageHeader } from '@/components/BackPageHeader';

interface AnalysisResult {
    symbol: string;
    recommendation: string;
    recommendationHe: string;
    score: number;
    confidence: number;
    color: string;
    price: number;
    indicators: {
        rsi: { value: number; status: string; statusHe: string } | null;
        macd: { macdLine: number; signalLine: number; hist: number; status: string; statusHe: string } | null;
        sma: { sma20: number; sma50: number; status: string; statusHe: string } | null;
        bb: { upper: number; middle: number; lower: number; status: string; statusHe: string } | null;
    };
    explanationsEn: string[];
    explanationsHe: string[];
    summary: string;
    summaryHe: string;
}

interface OverviewAsset {
    symbol: string;
    category: string;
    price: number;
    recommendation: string;
    recommendationHe: string;
    confidence: number;
    color: string;
    rsi: number;
    macdStatus: string;
    macdStatusHe: string;
}

export function AnalyzerPage() {
    const { t, lang } = useI18n();
    const navigate = useNavigate();
    
    const [assets, setAssets] = useState<OverviewAsset[]>([]);
    const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSD');
    const [selectedCategory, setSelectedCategory] = useState<string>('crypto');
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    
    // Fetch all assets overview on mount & periodic polling
    useEffect(() => {
        let active = true;
        
        const fetchOverview = async () => {
            try {
                const res = await fetch('http://localhost:3008/api/analysis/all');
                if (res.ok && active) {
                    const data = await res.json();
                    setAssets(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.error("Failed to fetch analyzer overview:", e);
            } finally {
                if (active) setLoadingOverview(false);
            }
        };
        
        void fetchOverview();
        const interval = setInterval(fetchOverview, 8000);
        
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, []);

    // Fetch detailed analysis for selected asset
    useEffect(() => {
        let active = true;
        setLoadingAnalysis(true);
        
        const fetchAnalysis = async () => {
            try {
                const res = await fetch(`http://localhost:3008/api/analysis?symbol=${selectedSymbol}&category=${selectedCategory}`);
                if (res.ok && active) {
                    const data = await res.json();
                    setAnalysis(data);
                }
            } catch (e) {
                console.error(`Failed to fetch analysis for ${selectedSymbol}:`, e);
            } finally {
                if (active) setLoadingAnalysis(false);
            }
        };
        
        void fetchAnalysis();
        const interval = setInterval(fetchAnalysis, 5000);
        
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [selectedSymbol, selectedCategory]);

    const handleAssetSelect = (symbol: string, category: string) => {
        setSelectedSymbol(symbol);
        setSelectedCategory(category);
    };

    const handleTradeNow = () => {
        navigate(`/charts?symbol=${selectedSymbol}&category=${selectedCategory}`);
    };

    // Filter logic
    const filteredAssets = (Array.isArray(assets) ? assets : []).filter(asset => {
        const matchesSearch = asset.symbol.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || asset.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    const isRtl = lang === 'he';

    // Speedometer angle calculation (score from -7.5 to 7.5 yields -90 to +90 deg)
    const score = analysis?.score ?? 0;
    const dialAngle = Math.min(90, Math.max(-90, (score / 7.5) * 90));

    // Get color code by recommendation value
    const getRecBadgeClass = (rec: string) => {
        if (rec.includes('BUY')) return 'badge-success';
        if (rec.includes('SELL')) return 'badge-danger';
        return 'badge-warning';
    };

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <BackPageHeader titleKey="nav.analyzer" />
            
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: 20, gap: 20 }}>
                
                {/* LEFT SIDEBAR: Asset Selection Board */}
                <div className="card" style={{ width: 340, display: 'flex', flexDirection: 'column', background: 'rgba(30, 41, 59, 0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, overflow: 'hidden' }}>
                    <div style={{ marginBottom: 14 }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 12, color: 'var(--primary, #38bdf8)' }}>
                            {isRtl ? 'לוח בקרה של השוק' : 'Market Overview Board'}
                        </h3>
                        <input
                            type="text"
                            placeholder={isRtl ? 'חיפוש סמל...' : 'Search symbol...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: '0.9rem', marginBottom: 10, outline: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                            {['all', 'crypto', 'forex', 'metals'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFilterCategory(cat)}
                                    className={`btn ${filterCategory === cat ? 'btn-primary' : 'btn-outline'}`}
                                    style={{ flex: 1, padding: '5px 0', fontSize: '0.75rem', borderRadius: 8, textTransform: 'capitalize' }}
                                >
                                    {cat === 'all' ? (isRtl ? 'הכל' : 'All') : cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loadingOverview && assets.length === 0 ? (
                        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', color: '#94a3b8' }}>
                            <div className="loading-spinner" style={{ border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid #38bdf8', borderRadius: '50%', width: 24, height: 24, animation: 'spin 1s linear infinite' }}></div>
                            <span style={{ marginInlineStart: 10 }}>{t('common.loading')}</span>
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                            {filteredAssets.map(asset => {
                                const isSelected = asset.symbol === selectedSymbol;
                                return (
                                    <div
                                        key={asset.symbol}
                                        onClick={() => handleAssetSelect(asset.symbol, asset.category)}
                                        style={{
                                            padding: '12px 14px',
                                            background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.35)',
                                            border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.04)',
                                            borderRadius: 10,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{asset.symbol}</span>
                                                <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', color: '#94a3b8' }}>{asset.category}</span>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
                                                {asset.price ? `$${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : '—'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            <span className={`badge ${getRecBadgeClass(asset.recommendation)}`} style={{ fontSize: '0.7rem', padding: '4px 8px', minWidth: 70, textAlign: 'center' }}>
                                                {isRtl ? asset.recommendationHe : asset.recommendation}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                {asset.confidence}% {isRtl ? 'ביטחון' : 'confidence'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredAssets.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                                    {isRtl ? 'לא נמצאו נכסים תואמים' : 'No matching assets found'}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* MAIN CONTENT: Technical Details and Speedometer */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', paddingRight: 4 }}>
                    
                    {loadingAnalysis && !analysis ? (
                        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 12 }}>
                            <div style={{ border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #38bdf8', borderRadius: '50%', width: 40, height: 40, animation: 'spin 1s linear infinite' }}></div>
                            <div style={{ color: '#94a3b8' }}>{isRtl ? 'מנתח נתוני שוק...' : 'Analyzing live market candles...'}</div>
                        </div>
                    ) : analysis ? (
                        <>
                            {/* OVERVIEW HERO: Dial and Gauge Summary */}
                            <div className="card" style={{ display: 'flex', background: 'rgba(30, 41, 59, 0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, gap: 30, alignItems: 'center', flexWrap: 'wrap' }}>
                                
                                {/* SVG Custom Speedometer Gauge */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 220, position: 'relative' }}>
                                    <svg width="200" height="110" viewBox="0 0 200 100" style={{ overflow: 'visible' }}>
                                        {/* Background Arc */}
                                        <path d="M 20,90 A 80,80 0 0,1 180,90" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" strokeLinecap="round" />
                                        
                                        {/* Colored Zones */}
                                        {/* Strong Sell (Red) */}
                                        <path d="M 20,90 A 80,80 0 0,1 52,43" fill="none" stroke="#ef4444" strokeWidth="16" />
                                        {/* Sell (Light Red) */}
                                        <path d="M 52,43 A 80,80 0 0,1 85,16" fill="none" stroke="#f87171" strokeWidth="16" />
                                        {/* Neutral (Yellow) */}
                                        <path d="M 85,16 A 80,80 0 0,1 115,16" fill="none" stroke="#eab308" strokeWidth="16" />
                                        {/* Buy (Light Green) */}
                                        <path d="M 115,16 A 80,80 0 0,1 148,43" fill="none" stroke="#4ade80" strokeWidth="16" />
                                        {/* Strong Buy (Green) */}
                                        <path d="M 148,43 A 80,80 0 0,1 180,90" fill="none" stroke="#22c55e" strokeWidth="16" strokeLinecap="round" />
                                        
                                        {/* Needle */}
                                        <g transform="translate(100, 90)">
                                            <line x1="0" y1="0" x2="0" y2="-75" stroke="#fff" strokeWidth="4" strokeLinecap="round" style={{ transform: `rotate(${dialAngle}deg)`, transformOrigin: '0px 0px', transition: 'transform 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)' }} />
                                            <circle cx="0" cy="0" r="10" fill="#fff" />
                                            <circle cx="0" cy="0" r="5" fill="#0f172a" />
                                        </g>
                                    </svg>
                                    
                                    <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#94a3b8', display: 'flex', width: '100%', justifyContent: 'space-between', padding: '0 10px' }}>
                                        <span>{isRtl ? 'מכירה חזקה' : 'Strong Sell'}</span>
                                        <span>{isRtl ? 'נייטרלי' : 'Neutral'}</span>
                                        <span>{isRtl ? 'קנייה חזקה' : 'Strong Buy'}</span>
                                    </div>
                                </div>

                                {/* Text Recommendation Details */}
                                <div style={{ flex: 1, minWidth: 250 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '2rem', fontWeight: 800 }}>{analysis.symbol}</span>
                                        <span style={{ fontSize: '1.4rem', color: '#64748b' }}>/</span>
                                        <span style={{ fontSize: '1.4rem', fontWeight: 700, color: analysis.color, textShadow: `0 0 10px ${analysis.color}40` }}>
                                            {isRtl ? analysis.recommendationHe : analysis.recommendation}
                                        </span>
                                    </div>
                                    <p style={{ margin: '10px 0', fontSize: '1rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                                        {isRtl ? analysis.summaryHe : analysis.summary}
                                    </p>
                                    
                                    {/* Confidence Slider Bar */}
                                    <div style={{ marginTop: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
                                            <span>{isRtl ? 'רמת ביטחון באות' : 'Signal Confidence Score'}</span>
                                            <span style={{ fontWeight: 700, color: analysis.color }}>{analysis.confidence}%</span>
                                        </div>
                                        <div style={{ height: 8, width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${analysis.confidence}%`, background: analysis.color, boxShadow: `0 0 8px ${analysis.color}`, transition: 'width 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)' }}></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Trading Trigger */}
                                <div style={{ padding: 15, background: 'rgba(15,23,42,0.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center', minWidth: 150 }}>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 8 }}>
                                        {isRtl ? 'מחיר נוכחי' : 'Live Price'}
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary, #38bdf8)', marginBottom: 12 }}>
                                        {typeof analysis.price === 'number' ? analysis.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—'}
                                    </div>
                                    <button onClick={handleTradeNow} className="btn btn-primary" style={{ width: '100%', padding: '10px 0', borderRadius: 8, fontSize: '0.85rem' }}>
                                        {isRtl ? 'פתח עסקה בגרף ⚡' : 'Trade Now on Chart ⚡'}
                                    </button>
                                </div>
                            </div>

                            {/* INDICATORS DETAIL GRID */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                                
                                {/* RSI Indicator Card */}
                                <div className="card" style={{ background: 'rgba(30, 41, 59, 0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.85rem' }}>RSI (14)</span>
                                        <span className={`badge ${analysis.indicators?.rsi?.status?.includes('OVERSOLD') ? 'badge-success' : analysis.indicators?.rsi?.status?.includes('OVERBOUGHT') ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                            {isRtl ? analysis.indicators?.rsi?.statusHe : analysis.indicators?.rsi?.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '2.1rem', fontWeight: 800, margin: '10px 0', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                        {typeof analysis.indicators?.rsi?.value === 'number' ? analysis.indicators.rsi.value.toFixed(1) : '—'}
                                        <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>/ 100</span>
                                    </div>
                                    {/* Slider Bar for RSI indicator value */}
                                    <div style={{ position: 'relative', height: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 8, overflow: 'hidden', marginTop: 14 }}>
                                        {/* Overbought Limit Overlay */}
                                        <div style={{ position: 'absolute', right: 0, width: '30%', height: '100%', background: 'rgba(239, 68, 68, 0.08)', borderLeft: '1px dashed rgba(239, 68, 68, 0.3)' }}></div>
                                        {/* Oversold Limit Overlay */}
                                        <div style={{ position: 'absolute', left: 0, width: '30%', height: '100%', background: 'rgba(34, 197, 94, 0.08)', borderRight: '1px dashed rgba(34, 197, 94, 0.3)' }}></div>
                                        {/* Position Pointer Bar */}
                                        <div style={{ position: 'absolute', left: `${typeof analysis.indicators?.rsi?.value === 'number' ? analysis.indicators.rsi.value : 0}%`, transform: 'translateX(-50%)', top: 0, width: 4, height: '100%', background: '#fff', boxShadow: '0 0 6px #fff' }}></div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginTop: 6 }}>
                                        <span>30 ({isRtl ? 'תחתון' : 'Oversold'})</span>
                                        <span>70 ({isRtl ? 'עליון' : 'Overbought'})</span>
                                    </div>
                                </div>

                                {/* MACD Indicator Card */}
                                <div className="card" style={{ background: 'rgba(30, 41, 59, 0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.85rem' }}>MACD (12, 26, 9)</span>
                                        <span className={`badge ${analysis.indicators?.macd?.status === 'BULLISH' ? 'badge-success' : analysis.indicators?.macd?.status === 'BEARISH' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                            {isRtl ? analysis.indicators.macd?.statusHe : analysis.indicators.macd?.status}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ color: '#94a3b8' }}>MACD Line:</span>
                                            <span style={{ fontWeight: 600 }}>{typeof analysis.indicators?.macd?.macdLine === 'number' ? analysis.indicators.macd.macdLine.toFixed(5) : '—'}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ color: '#94a3b8' }}>Signal Line:</span>
                                            <span style={{ fontWeight: 600 }}>{typeof analysis.indicators?.macd?.signalLine === 'number' ? analysis.indicators.macd.signalLine.toFixed(5) : '—'}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0' }}>
                                            <span style={{ color: '#94a3b8' }}>Histogram:</span>
                                            <span style={{ fontWeight: 700, color: (analysis.indicators?.macd?.hist ?? 0) >= 0 ? '#4ade80' : '#f87171' }}>
                                                {typeof analysis.indicators?.macd?.hist === 'number' ? analysis.indicators.macd.hist.toFixed(5) : '—'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Moving Averages Card */}
                                <div className="card" style={{ background: 'rgba(30, 41, 59, 0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.85rem' }}>{isRtl ? 'ממוצעים נעים (MA)' : 'Moving Averages'}</span>
                                        <span className={`badge ${analysis.indicators?.sma?.status === 'BULLISH' ? 'badge-success' : analysis.indicators?.sma?.status === 'BEARISH' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                            {isRtl ? analysis.indicators.sma?.statusHe : analysis.indicators.sma?.status}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ color: '#94a3b8' }}>SMA 20:</span>
                                            <span style={{ fontWeight: 600, color: analysis.price > (analysis.indicators.sma?.sma20 || 0) ? '#4ade80' : '#f87171' }}>
                                                {typeof analysis.indicators?.sma?.sma20 === 'number' ? `$${analysis.indicators.sma.sma20.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : '—'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0' }}>
                                            <span style={{ color: '#94a3b8' }}>SMA 50:</span>
                                            <span style={{ fontWeight: 600, color: analysis.price > (analysis.indicators.sma?.sma50 || 0) ? '#4ade80' : '#f87171' }}>
                                                {typeof analysis.indicators?.sma?.sma50 === 'number' ? `$${analysis.indicators.sma.sma50.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : '—'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 10, textAlign: 'center', fontStyle: 'italic' }}>
                                            {analysis.price > (analysis.indicators.sma?.sma20 || 0) ? (isRtl ? 'מחיר נסחר מעל ממוצע קצר מועד' : 'Price trading above short-term MA') : (isRtl ? 'מחיר נסחר מתחת לממוצע קצר מועד' : 'Price trading below short-term MA')}
                                        </div>
                                    </div>
                                </div>

                                {/* Bollinger Bands Card */}
                                <div className="card" style={{ background: 'rgba(30, 41, 59, 0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.85rem' }}>Bollinger Bands (20, 2)</span>
                                        <span className={`badge ${analysis.indicators?.bb?.status?.includes('OVERSOLD') ? 'badge-success' : analysis.indicators?.bb?.status?.includes('OVERBOUGHT') ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                            {isRtl ? analysis.indicators?.bb?.statusHe : analysis.indicators?.bb?.status}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ color: '#94a3b8' }}>Upper Band (Resistance):</span>
                                            <span style={{ fontWeight: 600 }}>{typeof analysis.indicators?.bb?.upper === 'number' ? `$${analysis.indicators.bb.upper.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : '—'}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ color: '#94a3b8' }}>Middle Band (Basis):</span>
                                            <span style={{ fontWeight: 600 }}>{typeof analysis.indicators?.bb?.middle === 'number' ? `$${analysis.indicators.bb.middle.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : '—'}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '5px 0' }}>
                                            <span style={{ color: '#94a3b8' }}>Lower Band (Support):</span>
                                            <span style={{ fontWeight: 600 }}>{typeof analysis.indicators?.bb?.lower === 'number' ? `$${analysis.indicators.bb.lower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* DETAILED SIGNAL CRITERIA AND ROADMAP EXPLANATION */}
                            <div className="card" style={{ background: 'rgba(30, 41, 59, 0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
                                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary, #38bdf8)', marginBottom: 14 }}>
                                    {isRtl ? 'פירוט איתות טכני והסבר אסטרטגיה' : 'Detailed Technical Analysis breakdown'}
                                </h4>
                                <ul style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.5 }}>
                                    {(Array.isArray(isRtl ? analysis.explanationsHe : analysis.explanationsEn) ? (isRtl ? analysis.explanationsHe : analysis.explanationsEn) : []).map((exp, idx) => (
                                        <li key={idx} style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>
                                            {exp}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </>
                    ) : (
                        <div className="card" style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(30, 41, 59, 0.45)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 40, color: '#64748b', textAlign: 'center' }}>
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16, color: '#38bdf8' }}>
                                <path d="M21 12V7H3v10h10" />
                                <path d="M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
                                <circle cx="12" cy="14" r="3" />
                                <path d="M14.5 16.5 18 20" />
                            </svg>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                                {isRtl ? 'בחר נכס מהלוח כדי לצפות באנליזת הבוט' : 'Select an asset to view the bot\'s analysis'}
                            </h3>
                            <p style={{ fontSize: '0.9rem', maxWidth: 400, margin: '0 auto', color: '#64748b' }}>
                                {isRtl ? 'מערכת הבוט תנתח את נתוני הנרות ההיסטוריים, תפעיל אינדיקטורים טכניים ותמליץ על כיוון המסחר האופטימלי.' : 'The analysis system will inspect historical candlestick data, calculate indicators, and recommend the optimal trading direction.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
            
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .badge-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); }
                .badge-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
                .badge-warning { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.2); }
            `}</style>
        </div>
    );
}
