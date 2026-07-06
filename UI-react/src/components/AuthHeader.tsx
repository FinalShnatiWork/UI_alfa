import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Lang } from '@/types/api';
import { useI18n } from '@/hooks/useI18n';

const LANG_OPTIONS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

interface Props {
  children?: ReactNode;
}

/**
 * Header component for authentication views (login/register).
 * Provides logo brand linkage and general language localization switcher buttons.
 *
 * @param props children layout elements
 * @returns Top navigation header component
 */
export function AuthHeader({ children }: Props) {
  const { lang, setLang } = useI18n();

  return (
    <header className="top-nav">
      <Link to="/landing" className="brand-logo-link" aria-label="Broker App">
        <img src="/images/LOGO.png?v=6" alt="" width={160} height={40} decoding="async" />
      </Link>
      {children}
      <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 4 }}>
        {LANG_OPTIONS.map((opt) => (
          <button
            key={opt.code}
            type="button"
            className={`btn ${lang === opt.code ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
            onClick={() => setLang(opt.code)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </header>
  );
}
