import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Lang } from '@/types/api';
import { useI18n } from '@/hooks/useI18n';
import { assetUrl } from '@/lib/assets';

const LANG_OPTIONS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

interface Props {
  children?: ReactNode;
}

/**
 * Header component for authentication views (login/register/landing).
 * Provides responsive brand linkage, action buttons, and language localization switcher.
 *
 * @param props children layout elements
 * @returns Top navigation header component
 */
export function AuthHeader({ children }: Props) {
  const { lang, setLang } = useI18n();

  return (
    <header className="top-nav auth-top-nav">
      <div className="auth-header-inner">
        <Link to="/landing" className="brand-logo-link auth-logo-link" aria-label="Broker App">
          <img
            src={assetUrl('images/LOGO.png?v=6')}
            alt="Logo"
            className="brand-logo-img"
            width={145}
            height={36}
            decoding="async"
          />
        </Link>

        <div className="auth-header-actions">
          {children && <div className="auth-header-children">{children}</div>}
          <div className="auth-header-lang">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                className={`btn ${lang === opt.code ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                onClick={() => setLang(opt.code)}
                aria-label={`Switch to ${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
