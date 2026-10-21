import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useSavePreferences } from '@/hooks/useApi';
import type { Lang } from '@/types/api';
import { assetUrl } from '@/lib/assets';

const NAV_LINKS = [
  { to: '/dashboard', key: 'nav.dashboard', icon: '📊' },
  { to: '/positions', key: 'nav.positions', icon: '💼' },
  { to: '/charts', key: 'nav.charts', icon: '📈' },
  { to: '/analyzer', key: 'nav.analyzer', icon: '🤖' },
  { to: '/finance', key: 'nav.finance', icon: '💳' },
  { to: '/history', key: 'nav.history', icon: '📜' },
  { to: '/pricing', key: 'nav.pricing', icon: '🏷️' },
  { to: '/account', key: 'nav.account', icon: '👤' },
  { to: '/settings', key: 'nav.settings', icon: '⚙️' },
] as const;

const LANG_OPTIONS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

interface Props {
  onLogout: () => void;
  loggingOut?: boolean;
}

/**
 * Primary header navigation for authenticated users on the dashboard and main pages.
 * Displays desktop horizontal navigation, responsive mobile hamburger drawer,
 * language selector buttons, and sign out action.
 *
 * @param props onLogout function and loggingOut indicator flag
 * @returns Primary authenticated layout top navigation bar with mobile drawer
 */
export function DashboardHeader({ onLogout, loggingOut }: Props) {
  const { t, lang, setLang } = useI18n();
  const { pathname } = useLocation();
  const { mutate: savePrefs } = useSavePreferences();
  // The drawer remembers the route it was opened on, so any navigation closes it
  // without a state update inside an effect.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const setMenuOpen = (open: boolean) => setMenuPath(open ? pathname : null);
  const sheetRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // While the drawer is open: Escape closes it, Tab stays inside it, the page behind does not
  // scroll, and focus goes back to the menu button afterwards.
  useEffect(() => {
    if (!menuOpen) return;
    const sheet = sheetRef.current;
    const menuBtn = menuBtnRef.current;
    const focusables = () => Array.from(
      sheet?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
    );
    focusables()[0]?.focus();
    document.documentElement.classList.add('menu-open');
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuPath(null); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheet?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !sheet?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.documentElement.classList.remove('menu-open');
      menuBtn?.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  /**
   * Updates language preference in app state and saves it to the backend database.
   *
   * @param code target language code (e.g. en, he, ru)
   */
  const handleLangChange = (code: Lang) => {
    setLang(code);
    savePrefs({ lang: code });
  };

  return (
    <>
      <header className="top-nav dashboard-nav-header">
        <Link to="/dashboard" className="brand-logo-link" aria-label="Broker App">
          <img
            src={assetUrl('images/LOGO.png?v=6')}
            alt="Logo"
            className="brand-logo-img"
            width={160}
            height={40}
            decoding="async"
          />
        </Link>

        {/* Desktop navigation bar */}
        <nav className="desktop-nav-links" aria-label="Desktop Navigation">
          {NAV_LINKS.filter((item) => item.to !== '/dashboard').map(({ to, key }) => (
            <Link
              key={to}
              to={to}
              className={`nav-link ${pathname === to ? 'nav-link-active' : ''}`}
            >
              {t(key)}
            </Link>
          ))}
        </nav>

        {/* Header trailing actions */}
        <div className="header-actions-wrap">
          {/* Language toggle pills */}
          <div className="header-lang-pills">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                className={`btn ${lang === opt.code ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '4px 9px', fontSize: '0.8rem' }}
                onClick={() => handleLangChange(opt.code)}
                aria-label={`Switch to ${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Desktop sign out button */}
          <button
            type="button"
            className="btn btn-primary desktop-logout-btn"
            style={{ padding: '8px 14px' }}
            disabled={loggingOut}
            onClick={onLogout}
          >
            {loggingOut ? '...' : t('account.logout')}
          </button>

          {/* Mobile hamburger menu toggle button */}
          <button
            ref={menuBtnRef}
            type="button"
            className={`mobile-menu-btn ${menuOpen ? 'active' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={menuOpen}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </div>
      </header>

      {/* Mobile slide-over navigation drawer */}
      {menuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMenuOpen(false)}>
          <aside
            ref={sheetRef}
            className="mobile-drawer-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.menu')}
          >
            <div className="mobile-drawer-header">
              <Link to="/dashboard" onClick={() => setMenuOpen(false)}>
                <img
                  src={assetUrl('images/LOGO.png?v=6')}
                  alt="Logo"
                  width={130}
                  height={32}
                  decoding="async"
                />
              </Link>
              <button
                type="button"
                className="mobile-drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label={t('nav.closeMenu')}
              >
                ✕
              </button>
            </div>

            <div className="mobile-drawer-body">
              <nav className="mobile-drawer-links">
                {NAV_LINKS.map(({ to, key, icon }) => {
                  const isActive = pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`mobile-drawer-link ${isActive ? 'active' : ''}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="mobile-drawer-icon">{icon}</span>
                      <span className="mobile-drawer-text">{t(key)}</span>
                      {isActive && <span className="mobile-drawer-indicator">●</span>}
                    </Link>
                  );
                })}
              </nav>

              <div className="mobile-drawer-footer">
                <div className="mobile-drawer-lang">
                  <div className="text-xs text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('settings.language')}
                  </div>
                  <div className="flex-gap">
                    {LANG_OPTIONS.map((opt) => (
                      <button
                        key={opt.code}
                        type="button"
                        className={`btn ${lang === opt.code ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, padding: '7px 0', fontSize: '0.85rem' }}
                        onClick={() => handleLangChange(opt.code)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-outline-danger"
                  style={{ width: '100%', padding: '12px', marginTop: 16 }}
                  disabled={loggingOut}
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  {loggingOut ? '...' : t('account.logout')}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
