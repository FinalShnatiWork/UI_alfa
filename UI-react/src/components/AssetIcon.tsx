import React from 'react';

interface AssetIconProps {
  symbol: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Authentic SVG icons for cryptocurrencies, forex currency pairs, and precious metals.
 * Rendered natively with exact brand colors, gradients, and official symbols.
 */
export const AssetIcon: React.FC<AssetIconProps> = ({
  symbol,
  size = 36,
  className = '',
  style = {},
}) => {
  const sym = (symbol || '').toUpperCase().trim();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  // 1. BITCOIN (BTCUSD, BTC)
  if (sym.startsWith('BTC')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, borderRadius: '50%', ...style }}
      >
        <defs>
          <linearGradient id={`btc-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFA028" />
            <stop offset="50%" stopColor="#F7931A" />
            <stop offset="100%" stopColor="#DE7B04" />
          </linearGradient>
          <filter id={`btc-shadow-${uid}`} x1="-20%" y1="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#F7931A" floodOpacity="0.35" />
          </filter>
        </defs>
        <circle cx="24" cy="24" r="22" fill={`url(#btc-g-${uid})`} filter={`url(#btc-shadow-${uid})`} />
        <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        <path
          fill="#FFFFFF"
          d="M33.4 20.8c.4-2.8-1.7-4.3-4.6-5.3l.9-3.7-2.3-.6-.9 3.6c-.6-.2-1.2-.3-1.8-.4l.9-3.6-2.3-.6-.9 3.7c-.5-.1-1-.2-1.5-.3l-3.2-.8-.6 2.5s1.7.4 1.7.4c.9.2 1.1.9 1.1 1.4l-1.1 4.4c.1 0 .2.1.3.1l-.3-.1-1.5 6.1c-.1.3-.4.8-1.1.6 0 0-1.7-.4-1.7-.4l-1.1 2.6 3 .8c.6.1 1.1.3 1.7.4l-.9 3.8 2.3.6.9-3.7c.6.2 1.2.3 1.8.4l-.9 3.7 2.3.6.9-3.8c4 .8 6.9.5 8.2-3.1 1-2.9 0-4.6-2.1-5.7 1.5-.4 2.7-1.4 3-3.5zm-5.4 7.7c-.7 3-5.7 1.4-7.3 1l1.3-5.2c1.6.4 6.7 1.2 6 4.2zm.7-7.8c-.7 2.7-4.8 1.3-6.2 1l1.2-4.7c1.4.3 5.7 1 5 3.7z"
        />
      </svg>
    );
  }

  // 2. ETHEREUM (ETHUSD, ETH)
  if (sym.startsWith('ETH')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, borderRadius: '50%', ...style }}
      >
        <defs>
          <linearGradient id={`eth-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7B93F8" />
            <stop offset="60%" stopColor="#627EEA" />
            <stop offset="100%" stopColor="#4A63D4" />
          </linearGradient>
          <filter id={`eth-shadow-${uid}`} x1="-20%" y1="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#627EEA" floodOpacity="0.35" />
          </filter>
        </defs>
        <circle cx="24" cy="24" r="22" fill={`url(#eth-g-${uid})`} filter={`url(#eth-shadow-${uid})`} />
        <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        <g transform="translate(12, 8)">
          <polygon points="12 2, 12 18, 22 22.5" fill="#FFFFFF" fillOpacity="0.65" />
          <polygon points="12 2, 2 22.5, 12 18" fill="#FFFFFF" fillOpacity="0.95" />
          <polygon points="12 19.5, 12 31, 22 24" fill="#FFFFFF" fillOpacity="0.5" />
          <polygon points="12 19.5, 2 24, 12 31" fill="#FFFFFF" fillOpacity="0.8" />
          <polygon points="12 18, 22 22.5, 12 19.5" fill="#C5D2FB" fillOpacity="0.4" />
          <polygon points="2 22.5, 12 18, 12 19.5" fill="#E4EAFE" fillOpacity="0.7" />
        </g>
      </svg>
    );
  }

  // 3. SOLANA (SOLUSD, SOL)
  if (sym.startsWith('SOL')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, borderRadius: '50%', ...style }}
      >
        <defs>
          <linearGradient id={`sol-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0D111C" />
            <stop offset="100%" stopColor="#171D2D" />
          </linearGradient>
          <linearGradient id={`sol-b-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00FFA3" />
            <stop offset="50%" stopColor="#03E1FF" />
            <stop offset="100%" stopColor="#DC1FFF" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill={`url(#sol-g-${uid})`} stroke="#2B3650" strokeWidth="1.5" />
        <g transform="translate(10, 13)">
          <path
            d="M23.5 2.5c-.3-.3-.7-.5-1.1-.5H4.2c-.7 0-1.1.8-.7 1.3l4 4.5c.3.3.7.5 1.1.5h18.2c.7 0 1.1-.8.7-1.3l-4-4.5z"
            fill={`url(#sol-b-${uid})`}
          />
          <path
            d="M4.5 9.5c.3-.3.7-.5 1.1-.5h18.2c.7 0 1.1.8.7 1.3l-4 4.5c-.3.3-.7.5-1.1.5H1.2c-.7 0-1.1-.8-.7-1.3l4-4.5z"
            fill={`url(#sol-b-${uid})`}
          />
          <path
            d="M23.5 16.5c-.3-.3-.7-.5-1.1-.5H4.2c-.7 0-1.1.8-.7 1.3l4 4.5c.3.3.7.5 1.1.5h18.2c.7 0 1.1-.8.7-1.3l-4-4.5z"
            fill={`url(#sol-b-${uid})`}
          />
        </g>
      </svg>
    );
  }

  // 4. RIPPLE / XRP (XRPUSD, XRP)
  if (sym.startsWith('XRP')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, borderRadius: '50%', ...style }}
      >
        <defs>
          <linearGradient id={`xrp-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#23292F" />
            <stop offset="100%" stopColor="#12161A" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill={`url(#xrp-g-${uid})`} stroke="#3F4956" strokeWidth="1.5" />
        <path
          fill="#FFFFFF"
          d="M34.8 13h4.3l-9.3 9.3c-2.4 2.4-6.3 2.4-8.7 0L11.8 13h4.3l7 7c1.2 1.2 3.1 1.2 4.3 0l7.4-7zm-19.1 22h-4.3l9.3-9.3c2.4-2.4 6.3-2.4 8.7 0l9.3 9.3h-4.3l-7-7c-1.2-1.2-3.1-1.2-4.3 0l-7.4 7z"
        />
      </svg>
    );
  }

  // 5. GOLD (XAUUSD, GOLD)
  if (sym.startsWith('XAU') || sym.includes('GOLD')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, borderRadius: '50%', ...style }}
      >
        <defs>
          <radialGradient id={`gold-r-${uid}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFF7D6" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="75%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </radialGradient>
          <linearGradient id={`gold-bar-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="50%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <filter id={`gold-s-${uid}`} x1="-20%" y1="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#F59E0B" floodOpacity="0.45" />
          </filter>
        </defs>
        <circle cx="24" cy="24" r="22" fill={`url(#gold-r-${uid})`} filter={`url(#gold-s-${uid})`} />
        <circle cx="24" cy="24" r="20" fill="none" stroke="#FDE68A" strokeWidth="1.2" strokeDasharray="3 1.5" />
        <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
        <g transform="translate(11, 14)">
          <polygon points="3 14, 23 14, 21 18, 5 18" fill="#B45309" />
          <polygon points="5 5, 21 5, 25 9, 1 9" fill={`url(#gold-bar-${uid})`} />
          <polygon points="1 9, 25 9, 23 15, 3 15" fill="#D97706" />
          <polygon points="21 5, 25 9, 23 15, 19 11" fill="#F59E0B" />
          <text x="13" y="13.5" fill="#451A03" fontSize="6.5" fontWeight="900" textAnchor="middle" letterSpacing="0.5" fontFamily="sans-serif">
            Au
          </text>
        </g>
      </svg>
    );
  }

  // 6. SILVER (XAGUSD, SILVER)
  if (sym.startsWith('XAG') || sym.includes('SILVER')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, borderRadius: '50%', ...style }}
      >
        <defs>
          <radialGradient id={`silv-r-${uid}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="40%" stopColor="#E2E8F0" />
            <stop offset="75%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>
          <linearGradient id={`silv-bar-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="50%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
          <filter id={`silv-s-${uid}`} x1="-20%" y1="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#94A3B8" floodOpacity="0.4" />
          </filter>
        </defs>
        <circle cx="24" cy="24" r="22" fill={`url(#silv-r-${uid})`} filter={`url(#silv-s-${uid})`} />
        <circle cx="24" cy="24" r="20" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="3 1.5" strokeOpacity="0.8" />
        <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
        <g transform="translate(11, 14)">
          <polygon points="3 14, 23 14, 21 18, 5 18" fill="#475569" />
          <polygon points="5 5, 21 5, 25 9, 1 9" fill={`url(#silv-bar-${uid})`} />
          <polygon points="1 9, 25 9, 23 15, 3 15" fill="#64748B" />
          <polygon points="21 5, 25 9, 23 15, 19 11" fill="#94A3B8" />
          <text x="13" y="13.5" fill="#0F172A" fontSize="6.5" fontWeight="900" textAnchor="middle" letterSpacing="0.5" fontFamily="sans-serif">
            Ag
          </text>
        </g>
      </svg>
    );
  }

  // 7. FOREX: EURUSD
  if (sym === 'EURUSD' || sym.startsWith('EUR')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <defs>
          <linearGradient id={`eur-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E40AF" />
            <stop offset="100%" stopColor="#0B1E5C" />
          </linearGradient>
          <linearGradient id={`usd-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#065F46" />
          </linearGradient>
        </defs>
        <circle cx="31" cy="27" r="14" fill={`url(#usd-g-${uid})`} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <text x="31" y="32" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          $
        </text>
        <circle cx="19" cy="20" r="15" fill={`url(#eur-g-${uid})`} stroke="#FACC15" strokeWidth="1.2" />
        <text x="19" y="26" fill="#FACC15" fontSize="16" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          €
        </text>
      </svg>
    );
  }

  // 8. FOREX: GBPUSD & GBPJPY
  if (sym.startsWith('GBP')) {
    const isJpy = sym.includes('JPY');
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <defs>
          <linearGradient id={`gbp-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E3A8A" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <linearGradient id={`pair-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isJpy ? '#EF4444' : '#10B981'} />
            <stop offset="100%" stopColor={isJpy ? '#991B1B' : '#065F46'} />
          </linearGradient>
        </defs>
        <circle cx="31" cy="27" r="14" fill={`url(#pair-g-${uid})`} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <text x="31" y="32" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          {isJpy ? '¥' : '$'}
        </text>
        <circle cx="19" cy="20" r="15" fill={`url(#gbp-g-${uid})`} stroke="#E2E8F0" strokeWidth="1.2" />
        <text x="19" y="26" fill="#FFFFFF" fontSize="16" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          £
        </text>
      </svg>
    );
  }

  // 9. FOREX: USDJPY
  if (sym === 'USDJPY') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <defs>
          <linearGradient id={`jpy-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="100%" stopColor="#991B1B" />
          </linearGradient>
          <linearGradient id={`usd-fg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#065F46" />
          </linearGradient>
        </defs>
        <circle cx="31" cy="27" r="14" fill={`url(#jpy-g-${uid})`} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <text x="31" y="32" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          ¥
        </text>
        <circle cx="19" cy="20" r="15" fill={`url(#usd-fg-${uid})`} stroke="#6EE7B7" strokeWidth="1.2" />
        <text x="19" y="26" fill="#FFFFFF" fontSize="16" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          $
        </text>
      </svg>
    );
  }

  // 10. FOREX: USDCAD
  if (sym.startsWith('USDCAD')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <defs>
          <linearGradient id={`cad-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#7F1D1D" />
          </linearGradient>
          <linearGradient id={`usd-cg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#065F46" />
          </linearGradient>
        </defs>
        <circle cx="31" cy="27" r="14" fill={`url(#cad-g-${uid})`} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <text x="31" y="31" fill="#FFFFFF" fontSize="10" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          C$
        </text>
        <circle cx="19" cy="20" r="15" fill={`url(#usd-cg-${uid})`} stroke="#6EE7B7" strokeWidth="1.2" />
        <text x="19" y="26" fill="#FFFFFF" fontSize="16" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          $
        </text>
      </svg>
    );
  }

  // 11. FOREX: NZDUSD
  if (sym.startsWith('NZD')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <defs>
          <linearGradient id={`nzd-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0369A1" />
            <stop offset="100%" stopColor="#082F49" />
          </linearGradient>
          <linearGradient id={`usd-ng-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#065F46" />
          </linearGradient>
        </defs>
        <circle cx="31" cy="27" r="14" fill={`url(#usd-ng-${uid})`} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <text x="31" y="32" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
          $
        </text>
        <circle cx="19" cy="20" r="15" fill={`url(#nzd-g-${uid})`} stroke="#38BDF8" strokeWidth="1.2" />
        <text x="19" y="25" fill="#FFFFFF" fontSize="9.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">
          NZ$
        </text>
      </svg>
    );
  }

  // DEFAULT / GENERIC COIN FALLBACK
  const initial = sym.slice(0, 3) || 'FX';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      style={{ flexShrink: 0, borderRadius: '50%', ...style }}
    >
      <defs>
        <linearGradient id={`gen-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#A16207" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill={`url(#gen-g-${uid})`} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      <text x="24" y="28" fill="#000000" fontSize="11" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">
        {initial}
      </text>
    </svg>
  );
};
