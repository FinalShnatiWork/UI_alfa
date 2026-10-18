export function ReplayLine({ points, up }: { points: number[]; up: boolean }) {
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const width = 320;
    const height = 112;
    const pad = 8;
    const path = points.map((point, index) => {
        const x = pad + (index / (points.length - 1)) * (width - pad * 2);
        const y = pad + (1 - (point - min) / span) * (height - pad * 2);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="120" role="img" aria-hidden="true" style={{ display: 'block' }}>
            <path d={path} fill="none" stroke={up ? '#10b981' : points[points.length - 1] < points[0] ? '#f43f5e' : '#eab308'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

