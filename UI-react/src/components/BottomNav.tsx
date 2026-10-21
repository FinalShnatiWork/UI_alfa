import type { ReactElement } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { usePositions } from '@/hooks/useApi';

interface NavItem {
  to: string;
  labelKey: string;
  icon: (active: boolean) => ReactElement;
  badge?: number;
}

/**
 * Mobile Bottom Navigation Bar.
 * Displayed exclusively on mobile viewports (<= 768px) for authenticated users.
 * Provides thumb-friendly instant access to essential trading actions:
 * Dashboard, Charts (Trade), Positions, AI Analyzer, and Finance.
 */
export function BottomNav() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { data: positionsData } = usePositions();

  const openPositionsCount = Array.isArray(positionsData)
    ? positionsData.filter((p) => Number(p.quantity ?? 0) !== 0).length
    : 0;

  const NAV_ITEMS: NavItem[] = [
    {
      to: '/dashboard',
      labelKey: 'nav.dashboard',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      ),
    },
    {
      to: '/charts',
      labelKey: 'nav.charts',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18 9l-5 5-4-4-4 4" />
        </svg>
      ),
    },
    {
      to: '/positions',
      labelKey: 'nav.positions',
      badge: openPositionsCount,
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <path d="M12 12v3" />
        </svg>
      ),
    },
    {
      to: '/analyzer',
      labelKey: 'nav.analyzer',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polygon points="12 8 16 16 12 14 8 16 12 8" />
        </svg>
      ),
    },
    {
      to: '/finance',
      labelKey: 'nav.finance',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.9'} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      <div className="mobile-bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="mobile-bottom-nav-icon-wrap">
                {item.icon(isActive)}
                {item.badge != null && item.badge > 0 && (
                  <span className="mobile-bottom-nav-badge">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="mobile-bottom-nav-label">
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
