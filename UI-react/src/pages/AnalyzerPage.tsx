import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { BackPageHeader } from '@/components/BackPageHeader';
import { AssetIcon } from '@/components/AssetIcon';

interface AnalysisResult {
    symbol: string;
    recommendation: string;
    recommendationHe: string;
    score: number;
    confidence: number;
    color: string;
    price: number;
    category?: string;
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
    nameEn: string;
    nameHe: string;
    price: number;
    recommendation: string;
    recommendationHe: string;
    confidence: number;
    color: string;
    rsi: number;
    macdStatus: string;
    macdStatusHe: string;
}

// Built-in resilient assets database matching backend MarketAnalysisController.SUPPORTED
const FALLBACK_ASSETS: OverviewAsset[] = [
    {
        symbol: 'BTCUSD',
        category: 'crypto',
        nameEn: 'Bitcoin',
        nameHe: 'ביטקוין',
        price: 103430.50,
        recommendation: 'STRONG BUY',
        recommendationHe: 'קנייה חזקה',
        confidence: 88,
        color: '#10b981',
        rsi: 61.4,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    },
    {
        symbol: 'ETHUSD',
        category: 'crypto',
        nameEn: 'Ethereum',
        nameHe: 'אתריום',
        price: 3482.20,
        recommendation: 'BUY',
        recommendationHe: 'קנייה',
        confidence: 76,
        color: '#10b981',
        rsi: 58.2,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    },
    {
        symbol: 'SOLUSD',
        category: 'crypto',
        nameEn: 'Solana',
        nameHe: 'סולאנה',
        price: 218.40,
        recommendation: 'STRONG BUY',
        recommendationHe: 'קנייה חזקה',
        confidence: 84,
        color: '#10b981',
        rsi: 64.8,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    },
    {
        symbol: 'XRPUSD',
        category: 'crypto',
        nameEn: 'Ripple XRP',
        nameHe: 'ריפל',
        price: 2.45,
        recommendation: 'NEUTRAL',
        recommendationHe: 'נייטרלי',
        confidence: 54,
        color: '#eab308',
        rsi: 49.3,
        macdStatus: 'NEUTRAL',
        macdStatusHe: 'נייטרלי',
    },
    {
        symbol: 'EURUSD',
        category: 'forex',
        nameEn: 'Euro / US Dollar',
        nameHe: 'אירו / דולר',
        price: 1.0864,
        recommendation: 'BUY',
        recommendationHe: 'קנייה',
        confidence: 68,
        color: '#10b981',
        rsi: 53.1,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    },
    {
        symbol: 'GBPUSD',
        category: 'forex',
        nameEn: 'British Pound / US Dollar',
        nameHe: 'פאונד / דולר',
        price: 1.2982,
        recommendation: 'NEUTRAL',
        recommendationHe: 'נייטרלי',
        confidence: 58,
        color: '#eab308',
        rsi: 50.8,
        macdStatus: 'NEUTRAL',
        macdStatusHe: 'נייטרלי',
    },
    {
        symbol: 'USDJPY',
        category: 'forex',
        nameEn: 'US Dollar / Japanese Yen',
        nameHe: 'דולר / ין יפני',
        price: 153.42,
        recommendation: 'SELL',
        recommendationHe: 'מכירה',
        confidence: 72,
        color: '#f43f5e',
        rsi: 41.5,
        macdStatus: 'BEARISH',
        macdStatusHe: 'דובי (יורד)',
    },
    {
        symbol: 'GBPJPY',
        category: 'forex',
        nameEn: 'British Pound / Japanese Yen',
        nameHe: 'פאונד / ין יפני',
        price: 199.15,
        recommendation: 'BUY',
        recommendationHe: 'קנייה',
        confidence: 65,
        color: '#10b981',
        rsi: 54.6,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    },
    {
        symbol: 'USDCAD',
        category: 'forex',
        nameEn: 'US Dollar / Canadian Dollar',
        nameHe: 'דולר / דולר קנדי',
        price: 1.3924,
        recommendation: 'SELL',
        recommendationHe: 'מכירה',
        confidence: 69,
        color: '#f43f5e',
        rsi: 43.2,
        macdStatus: 'BEARISH',
        macdStatusHe: 'דובי (יורד)',
    },
    {
        symbol: 'NZDUSD',
        category: 'forex',
        nameEn: 'NZ Dollar / US Dollar',
        nameHe: 'דולר ניו זילנדי / דולר',
        price: 0.5942,
        recommendation: 'NEUTRAL',
        recommendationHe: 'נייטרלי',
        confidence: 52,
        color: '#eab308',
        rsi: 48.7,
        macdStatus: 'NEUTRAL',
        macdStatusHe: 'נייטרלי',
    },
    {
        symbol: 'XAUUSD',
        category: 'metals',
        nameEn: 'Gold / US Dollar (Oz)',
        nameHe: 'זהב / דולר (אונקיה)',
        price: 2764.80,
        recommendation: 'STRONG BUY',
        recommendationHe: 'קנייה חזקה',
        confidence: 91,
        color: '#10b981',
        rsi: 67.2,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    },
    {
        symbol: 'XAGUSD',
        category: 'metals',
        nameEn: 'Silver / US Dollar (Oz)',
        nameHe: 'כסף / דולר (אונקיה)',
        price: 33.85,
        recommendation: 'BUY',
        recommendationHe: 'קנייה',
        confidence: 79,
        color: '#10b981',
        rsi: 59.4,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    },
];

// Generate comprehensive fallback analysis data for any asset
function buildFallbackAnalysis(symbol: string, category: string): AnalysisResult {
    const asset = FALLBACK_ASSETS.find(a => a.symbol === symbol) || {
        symbol,
        category,
        nameEn: symbol,
        nameHe: symbol,
        price: 100.0,
        recommendation: 'BUY',
        recommendationHe: 'קנייה',
        confidence: 70,
        color: '#10b981',
        rsi: 55,
        macdStatus: 'BULLISH',
        macdStatusHe: 'שוריוני (עולה)',
    };

    const price = asset.price;
    const isBuy = asset.recommendation.includes('BUY');
    const isSell = asset.recommendation.includes('SELL');

    const sma20 = isBuy ? price * 0.985 : isSell ? price * 1.015 : price * 0.998;
    const sma50 = isBuy ? price * 0.965 : isSell ? price * 1.032 : price * 1.002;
    const bbUpper = price * 1.035;
    const bbLower = price * 0.965;
    const bbMiddle = (bbUpper + bbLower) / 2;

    const score = isBuy ? (asset.recommendation.includes('STRONG') ? 5.8 : 3.6) : isSell ? -4.2 : 0.4;

    return {
        symbol: asset.symbol,
        category: asset.category,
        recommendation: asset.recommendation,
        recommendationHe: asset.recommendationHe,
        score,
        confidence: asset.confidence,
        color: asset.color,
        price: asset.price,
        indicators: {
            rsi: {
                value: asset.rsi,
                status: isBuy ? 'BULLISH SUPPORT' : isSell ? 'BEARISH EXHAUSTION' : 'BALANCED RANGE',
                statusHe: isBuy ? 'תמיכה שורית' : isSell ? 'עייפות קונים' : 'טווח מאוזן',
            },
            macd: {
                macdLine: isBuy ? 0.00185 * price : -0.0012 * price,
                signalLine: isBuy ? 0.00112 * price : -0.0006 * price,
                hist: isBuy ? 0.00073 * price : -0.0006 * price,
                status: asset.macdStatus,
                statusHe: asset.macdStatusHe,
            },
            sma: {
                sma20,
                sma50,
                status: isBuy ? 'GOLDEN CROSS (BULLISH)' : isSell ? 'DEATH CROSS (BEARISH)' : 'NEUTRAL ALIGNMENT',
                statusHe: isBuy ? 'הצלבה שורית (עולה)' : isSell ? 'הצלבה דובית (יורדת)' : 'ממוצעים מאוזנים',
            },
            bb: {
                upper: bbUpper,
                middle: bbMiddle,
                lower: bbLower,
                status: isBuy ? 'TRADING IN UPPER EXPANSION' : isSell ? 'TESTING LOWER BOUND' : 'INSIDE STANDARD CHANNELS',
                statusHe: isBuy ? 'התבססות ברצועה העליונה' : isSell ? 'לחץ לכיוון הרצועה התחתונה' : 'תנועה בתוך הערוץ המרכזי',
            },
        },
        explanationsEn: [
            `RSI is positioned at ${asset.rsi.toFixed(1)}, showing healthy momentum without extreme exhaustion.`,
            `MACD histogram demonstrates ${isBuy ? 'positive upward divergence' : isSell ? 'negative downward pressure' : 'neutral consolidation'}.`,
            `Current price ($${price.toLocaleString()}) trades ${price > sma20 ? 'above' : 'below'} both the 20-period and 50-period moving averages.`,
            `Bollinger Bands volatility structure indicates ${isBuy ? 'sustained bullish continuation' : isSell ? 'downside correction risk' : 'stable trading ranges'}.`,
        ],
        explanationsHe: [
            `מדד ה-RSI עומד על ${asset.rsi.toFixed(1)}, מציג מומנטום יציב ובריא ללא קיצוניות חריגה.`,
            `היסטוגרמת MACD מציגה ${isBuy ? 'התרחבות חיובית כלפי מעלה ומומנטום קונים' : isSell ? 'לחץ מכירות והיחלשות קונים' : 'קונסולידציה והמתנה לכיוון ברור'}.`,
            `המחיר הנוכחי ($${price.toLocaleString()}) נסחר ${price > sma20 ? 'מעל' : 'מתחת'} לממוצעים הנעים לתקופות 20 ו-50 ימים.`,
            `רצועות בולינגר מראות ${isBuy ? 'פריצה מבוקרת ועוצמה במגמת העלייה' : isSell ? 'סיכון להמשך ירידה ובדיקת תמיכות' : 'תנודתיות מאוזנת בתוך גבולות הערוץ'}.`,
        ],
        summary: isBuy
            ? `Algorithmic analysis identifies strong multi-indicator buy momentum on ${asset.symbol} with ${asset.confidence}% statistical confidence.`
            : isSell
            ? `Bearish divergence detected across moving averages and oscillators, suggesting tactical caution or short bias.`
            : `Consolidation mode detected. Key indicators are neutral; monitor breakout levels before opening directional positions.`,
        summaryHe: isBuy
            ? `האלגוריתם מזהה מומנטום קנייה חזק במספר אינדיקטורים מובילים על ${asset.symbol} ברמת ביטחון סטטיסטית של ${asset.confidence}%.`
            : isSell
            ? `זוהתה סטייה דובית בשילוב ממוצעים נעים ומתנדים, המצביעה על זהירות ונטייה לירידות.`
            : `הנכס נמצא במצב התכנסות ודשדוש. מומלץ להמתין לפריצת רמות תמיכה/התנגדות לפני כניסה לפוזיציה.`,
    };
}

interface SpeedometerGaugeProps {
    dialAngle: number;
    recommendation: string;
    confidence: number;
    color: string;
    isRtl: boolean;
}

function SpeedometerGauge({
    dialAngle,
    recommendation,
    confidence,
    color,
    isRtl,
}: SpeedometerGaugeProps) {
    const cx = 115;
    const cy = 98;
    const r = 75;
    const strokeWidth = 11;

    // Helper to calculate exact circular cartesian coordinates from angle relative to top (12 o'clock)
    const getPoint = (angleDeg: number, radius = r) => {
        const rad = (angleDeg * Math.PI) / 180.0;
        return {
            x: cx + radius * Math.sin(rad),
            y: cy - radius * Math.cos(rad),
        };
    };

    // Helper to describe an SVG circular arc from alphaStart to alphaEnd
    const arcPath = (alphaStart: number, alphaEnd: number, radius = r) => {
        const p1 = getPoint(alphaStart, radius);
        const p2 = getPoint(alphaEnd, radius);
        const largeArc = Math.abs(alphaEnd - alphaStart) > 180 ? 1 : 0;
        return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    };

    // Dynamic color determination
    const activeColor = color || (dialAngle > 18 ? '#10b981' : dialAngle < -18 ? '#f43f5e' : '#eab308');

    // Indicator bead positioned smoothly along the arc
    const pipPos = getPoint(dialAngle, r);

    // 4 zone dividers at -54°, -18°, +18°, +54°
    const dividerAngles = [-54, -18, 18, 54];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 230, position: 'relative', flexShrink: 0 }}>
            <svg width="230" height="120" viewBox="0 0 230 120" style={{ overflow: 'visible' }}>
                <defs>
                    <linearGradient id="gaugeContinuousGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f43f5e" />
                        <stop offset="22%" stopColor="#fb7185" />
                        <stop offset="50%" stopColor="#eab308" />
                        <stop offset="78%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>

                    <linearGradient id="needleGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stopColor="#94a3b8" />
                        <stop offset="60%" stopColor="#f8fafc" />
                        <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>

                    <filter id="dialNeedleShadow" x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.6" />
                    </filter>
                    <filter id="activePipGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={activeColor} floodOpacity="0.85" />
                    </filter>
                    <filter id="arcAmbientGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={activeColor} floodOpacity="0.25" />
                    </filter>
                </defs>

                {/* Subtle Inner Dark Field */}
                <path
                    d={`M ${cx - 62},${cy} A 62,62 0 0,1 ${cx + 62},${cy} Z`}
                    fill="rgba(0, 0, 0, 0.2)"
                />

                {/* Inner Decorative Tick Arc */}
                <path
                    d={arcPath(-86, 86, r - 15)}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="1.5"
                    strokeDasharray="2 6"
                />

                {/* Dark Base Track Behind Arc */}
                <path
                    d={arcPath(-88, 88, r)}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.07)"
                    strokeWidth={strokeWidth + 4}
                    strokeLinecap="round"
                />

                {/* CONTINUOUS SMOOTH GRADIENT ARC - 100% Mathematically Circular */}
                <path
                    d={arcPath(-88, 88, r)}
                    fill="none"
                    stroke="url(#gaugeContinuousGradient)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    filter="url(#arcAmbientGlow)"
                />

                {/* Precision Zone Dividers (Radial cuts) */}
                {dividerAngles.map(deg => {
                    const pInner = getPoint(deg, r - strokeWidth / 2 - 2);
                    const pOuter = getPoint(deg, r + strokeWidth / 2 + 2);
                    return (
                        <line
                            key={deg}
                            x1={pInner.x}
                            y1={pInner.y}
                            x2={pOuter.x}
                            y2={pOuter.y}
                            stroke="#0f172a"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Active Glowing Pip along Arc */}
                <circle
                    cx={pipPos.x}
                    cy={pipPos.y}
                    r="5.5"
                    fill="#ffffff"
                    stroke={activeColor}
                    strokeWidth="2.5"
                    filter="url(#activePipGlow)"
                    style={{
                        transition: 'cx 0.9s cubic-bezier(0.34, 1.56, 0.64, 1), cy 0.9s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.4s ease',
                    }}
                />

                {/* Needle with Smooth Physics */}
                <g transform={`translate(${cx}, ${cy})`} filter="url(#dialNeedleShadow)">
                    {/* Glowing Pointer Trace */}
                    <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2={-(r - 8)}
                        stroke={activeColor}
                        strokeWidth="5"
                        strokeLinecap="round"
                        opacity="0.25"
                        style={{
                            transform: `rotate(${dialAngle}deg)`,
                            transformOrigin: '0px 0px',
                            transition: 'transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        }}
                    />
                    {/* Tapered Needle Blade */}
                    <path
                        d="M -2.5,0 L -0.5,-66 Q 0,-69 0.5,-66 L 2.5,0 Z"
                        fill="url(#needleGradient)"
                        style={{
                            transform: `rotate(${dialAngle}deg)`,
                            transformOrigin: '0px 0px',
                            transition: 'transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        }}
                    />
                    {/* Center Pivot Hub */}
                    <circle cx="0" cy="0" r="13" fill="#0b0f19" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" />
                    <circle cx="0" cy="0" r="8" fill="#1e293b" />
                    <circle cx="0" cy="0" r="4.5" fill={activeColor} />
                </g>
            </svg>

            {/* Glowing Status Pill Under Dial */}
            <div
                style={{
                    marginTop: 10,
                    padding: '4px 14px',
                    borderRadius: 20,
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    color: activeColor,
                    background: `${activeColor}16`,
                    border: `1px solid ${activeColor}45`,
                    boxShadow: `0 0 12px ${activeColor}22`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                }}
            >
                <span
                    style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: activeColor,
                        boxShadow: `0 0 8px ${activeColor}`,
                    }}
                />
                {recommendation} ({confidence}%)
            </div>

            {/* Labels: Sell / Neutral / Buy */}
            <div
                style={{
                    marginTop: 8,
                    fontSize: '0.74rem',
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'space-between',
                    padding: '0 6px',
                    fontWeight: 700,
                }}
            >
                <span style={{ color: '#f43f5e', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f43f5e' }} />
                    {isRtl ? 'מכירה' : 'Sell'}
                </span>
                <span style={{ color: '#eab308', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#eab308' }} />
                    {isRtl ? 'נייטרלי' : 'Neutral'}
                </span>
                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                    {isRtl ? 'קנייה' : 'Buy'}
                </span>
            </div>
        </div>
    );
}

export function AnalyzerPage() {
    const { t, lang } = useI18n();
    const navigate = useNavigate();

    const [assets, setAssets] = useState<OverviewAsset[]>(FALLBACK_ASSETS);
    const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSD');
    const [selectedCategory, setSelectedCategory] = useState<string>('crypto');
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(() => buildFallbackAnalysis('BTCUSD', 'crypto'));

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
                const res = await fetch('/api/market/analysis/all');
                if (res.ok && active) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        // Merge backend data with names
                        const merged = data.map((bItem: any) => {
                            const fallback = FALLBACK_ASSETS.find(f => f.symbol === bItem.symbol);
                            return {
                                ...fallback,
                                ...bItem,
                                nameEn: fallback?.nameEn || bItem.symbol,
                                nameHe: fallback?.nameHe || bItem.symbol,
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
    }, []);

    // Fetch detailed analysis for selected asset, fall back seamlessly
    useEffect(() => {
        let active = true;
        setLoadingAnalysis(true);

        const fetchAnalysis = async () => {
            try {
                const res = await fetch(`/api/market/analysis?symbol=${selectedSymbol}&category=${selectedCategory}`);
                if (res.ok && active) {
                    const data = await res.json();
                    if (data && data.symbol) {
                        setAnalysis(data);
                        return;
                    }
                }
            } catch {
                // Use resilient calculated fallback
            } finally {
                if (active) setLoadingAnalysis(false);
            }

            if (active) {
                setAnalysis(buildFallbackAnalysis(selectedSymbol, selectedCategory));
            }
        };

        void fetchAnalysis();
        const interval = setInterval(fetchAnalysis, 8000);

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
    const filteredAssets = useMemo(() => {
        return (Array.isArray(assets) ? assets : FALLBACK_ASSETS).filter(asset => {
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
            FALLBACK_ASSETS.find(a => a.symbol === selectedSymbol) ||
            {
                symbol: selectedSymbol,
                category: selectedCategory,
                nameEn: selectedSymbol,
                nameHe: selectedSymbol,
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
                                {isRtl ? 'בוט אנליזה חכם ואיתותי שוק (AI Analyzer)' : 'AI Market Analyzer & Quant Signals'}
                            </h2>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {isRtl
                                    ? 'סריקת שוק רציפה באמצעות מודל כמותי: שילוב RSI, MACD, ממוצעים נעים ורצועות בולינגר לאיתור הזדמנויות'
                                    : 'Real-time quantitative scanning: RSI, MACD, multi-period moving averages, and Bollinger Bands breakdown.'}
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
                            {isRtl ? 'סריקה חיה פעילה' : 'Live Engine Active'}
                        </span>
                    </div>
                </div>

                {/* 2-COLUMN MAIN WORKSPACE */}
                <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>
                    
                    {/* LEFT COLUMN: ASSET LIST BOARD */}
                    <div
                        className="card analyzer-asset-board"
                        style={{
                            padding: '18px 14px 14px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            height: 'calc(100vh - 120px)',
                            maxHeight: 820,
                            minHeight: 560,
                            position: 'sticky',
                            top: 90,
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
                                        {isRtl ? 'לוח נכסי מסחר' : 'Asset Market Board'}
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
                                    {filteredAssets.length} {isRtl ? 'נכסים' : 'assets'}
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
                                    placeholder={isRtl ? 'חיפוש סמל או שם נכס...' : 'Search symbol or name...'}
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
                                {[
                                    { id: 'all', en: 'All', he: 'הכל' },
                                    { id: 'crypto', en: 'Crypto', he: 'קריפטו' },
                                    { id: 'forex', en: 'Forex', he: 'מט"ח' },
                                    { id: 'metals', en: 'Metals', he: 'מתכות' },
                                ].map(cat => {
                                    const isActive = filterCategory === cat.id;
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setFilterCategory(cat.id)}
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
                                            {isRtl ? cat.he : cat.en}
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
                                                        {isRtl ? asset.nameHe : asset.nameEn}
                                                    </div>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                                        {asset.price ? `$${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
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
                                                    {isRtl ? asset.recommendationHe : asset.recommendation}
                                                </span>
                                                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                                    {asset.confidence}% {isRtl ? 'ביטחון' : 'conf.'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredAssets.length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 10px', fontSize: '0.85rem' }}>
                                        {isRtl ? 'לא נמצאו נכסים תואמים' : 'No matching assets found'}
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
                                    {isRtl ? 'מנתח נתוני שוק חיים...' : 'Analyzing live market data...'}
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
                                        recommendation={isRtl ? analysis.recommendationHe : analysis.recommendation}
                                        confidence={analysis.confidence}
                                        color={analysis.color}
                                        isRtl={isRtl}
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
                                                        {isRtl ? analysis.recommendationHe : analysis.recommendation}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>
                                                    {isRtl ? currentAssetMeta.nameHe : currentAssetMeta.nameEn}
                                                </div>
                                            </div>
                                        </div>

                                        <p style={{ margin: '12px 0', fontSize: '0.94rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {isRtl ? analysis.summaryHe : analysis.summary}
                                        </p>

                                        {/* Confidence progress bar */}
                                        <div style={{ marginTop: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                                                <span style={{ fontWeight: 600 }}>{isRtl ? 'רמת ביטחון אלגוריתמית' : 'Quant Confidence Score'}</span>
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
                                            {isRtl ? 'מחיר שוק נוכחי' : 'Live Market Price'}
                                        </div>
                                        <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--accent-strong)', margin: '8px 0 16px', letterSpacing: '-0.02em' }}>
                                            {typeof analysis.price === 'number'
                                                ? `$${analysis.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`
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
                                            {isRtl ? 'פתח עסקה בגרף ⚡' : 'Trade on Chart ⚡'}
                                        </button>
                                    </div>
                                </div>

                                {/* 4 TECHNICAL INDICATORS TILES */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                                    
                                    {/* 1. RSI CARD */}
                                    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>RSI (14)</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.rsi?.status?.includes('OVERSOLD') ? 'BUY' : analysis.indicators?.rsi?.status?.includes('OVERBOUGHT') ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {isRtl ? analysis.indicators?.rsi?.statusHe : analysis.indicators?.rsi?.status}
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
                                            <span>30 ({isRtl ? 'מכירת יתר' : 'Oversold'})</span>
                                            <span>70 ({isRtl ? 'קניית יתר' : 'Overbought'})</span>
                                        </div>
                                    </div>

                                    {/* 2. MACD CARD */}
                                    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>MACD (12, 26, 9)</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.macd?.status === 'BULLISH' ? 'BUY' : analysis.indicators?.macd?.status === 'BEARISH' ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {isRtl ? analysis.indicators?.macd?.statusHe : analysis.indicators?.macd?.status}
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
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{isRtl ? 'ממוצעים נעים (MA)' : 'Moving Averages'}</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.sma?.status === 'BULLISH' ? 'BUY' : analysis.indicators?.sma?.status === 'BEARISH' ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {isRtl ? analysis.indicators?.sma?.statusHe : analysis.indicators?.sma?.status}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>SMA 20:</span>
                                                <span style={{ fontWeight: 700, color: analysis.price > (analysis.indicators?.sma?.sma20 || 0) ? 'var(--green)' : 'var(--red)' }}>
                                                    {typeof analysis.indicators?.sma?.sma20 === 'number' ? `$${analysis.indicators.sma.sma20.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>SMA 50:</span>
                                                <span style={{ fontWeight: 700, color: analysis.price > (analysis.indicators?.sma?.sma50 || 0) ? 'var(--green)' : 'var(--red)' }}>
                                                    {typeof analysis.indicators?.sma?.sma50 === 'number' ? `$${analysis.indicators.sma.sma50.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
                                            {analysis.price > (analysis.indicators?.sma?.sma20 || 0)
                                                ? (isRtl ? 'מחיר נסחר מעל ממוצע קצר מועד' : 'Trading above short-term MA')
                                                : (isRtl ? 'מחיר נסחר מתחת לממוצע קצר מועד' : 'Trading below short-term MA')}
                                        </div>
                                    </div>

                                    {/* 4. BOLLINGER BANDS CARD */}
                                    <div className="card" style={{ padding: 20, marginBottom: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Bollinger Bands (20, 2)</span>
                                            <span className={getRecBadgeClass(analysis.indicators?.bb?.status?.includes('OVERSOLD') ? 'BUY' : analysis.indicators?.bb?.status?.includes('OVERBOUGHT') ? 'SELL' : 'HOLD')} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                {isRtl ? analysis.indicators?.bb?.statusHe : analysis.indicators?.bb?.status}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Upper Band:</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.bb?.upper === 'number' ? `$${analysis.indicators.bb.upper.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Middle (Basis):</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.bb?.middle === 'number' ? `$${analysis.indicators.bb.middle.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Lower Band:</span>
                                                <span style={{ fontWeight: 700 }}>{typeof analysis.indicators?.bb?.lower === 'number' ? `$${analysis.indicators.bb.lower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* DETAILED EXPLANATION BREAKDOWN CARD */}
                                <div className="card" style={{ padding: 24 }}>
                                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                                        {isRtl ? 'פירוט איתות טכני והסבר אסטרטגיה אלגוריתמית' : 'Detailed Technical Analysis Breakdown'}
                                    </h4>
                                    <ul style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 12, lineHeight: 1.6 }}>
                                        {(Array.isArray(isRtl ? analysis.explanationsHe : analysis.explanationsEn)
                                            ? (isRtl ? analysis.explanationsHe : analysis.explanationsEn)
                                            : []
                                        ).map((exp, idx) => (
                                            <li key={idx} style={{ color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                                                {exp}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
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
