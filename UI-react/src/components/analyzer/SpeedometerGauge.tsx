import { useI18n } from '@/hooks/useI18n';

interface SpeedometerGaugeProps {
    dialAngle: number;
    recommendation: string;
    confidence: number;
    color: string;
}

export function SpeedometerGauge({
    dialAngle,
    recommendation,
    confidence,
    color,
}: SpeedometerGaugeProps) {
    const { t } = useI18n();
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
                    {t('analyzer.sell')}
                </span>
                <span style={{ color: '#eab308', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#eab308' }} />
                    {t('analyzer.neutral')}
                </span>
                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                    {t('analyzer.buy')}
                </span>
            </div>
        </div>
    );
}

