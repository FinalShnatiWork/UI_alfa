import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useSavePreferences } from '@/hooks/useApi';
import type { Lang } from '@/types/api';
import { assetUrl } from '@/lib/assets';

const NAV_LINKS = [
  { to: '/positions', key: 'nav.positions' },
  { to: '/charts', key: 'nav.charts' },
  { to: '/analyzer', key: 'nav.analyzer' },
  { to: '/finance', key: 'nav.finance' },
  { to: '/history', key: 'nav.history' },
  { to: '/pricing', key: 'nav.pricing' },
  { to: '/account', key: 'nav.account' },
  { to: '/settings', key: 'nav.settings' },
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
 * Displays navigation links, language selector buttons, and the sign out action.
 *
 * @param props onLogout function and loggingOut indicator flag
 * @returns Primary authenticated layout top navigation bar
 */
export function DashboardHeader({ onLogout, loggingOut }: Props) {
  const { t, lang, setLang } = useI18n();
  const { pathname } = useLocation();
  const { mutate: savePrefs } = useSavePreferences();

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
    <header className="top-nav">
      <Link to="/dashboard" className="brand-logo-link" aria-label="Broker App">
        <img src={assetUrl('images/LOGO.png?v=6')} alt="Logo" width={160} height={40} decoding="async" />
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1 }}>
        {NAV_LINKS.map(({ to, key }) => (
          <Link
            key={to}
            to={to}
            style={{
              fontWeight: pathname === to ? 700 : undefined,
              color: pathname === to ? 'var(--primary)' : undefined,
              textDecoration: 'none',
            }}
          >
            {t(key)}
          </Link>
        ))}
      </nav>

      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              className={`btn ${lang === opt.code ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              onClick={() => handleLangChange(opt.code)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '8px 14px' }}
          disabled={loggingOut}
          onClick={onLogout}
        >
          {loggingOut ? '...' : t('account.logout')}
        </button>
      </div>
    </header>
  );
}
