import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useSavePreferences } from '@/hooks/useApi';
import type { Lang } from '@/types/api';
import { assetUrl } from '@/lib/assets';

const LANG_OPTIONS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

interface Props {
  titleKey: string;
  backTo?: string;
}

/**
 * Centered page header component featuring a Back navigation link and language switcher.
 * Optimized for both desktop and mobile viewports without overlapping elements.
 *
 * @param props titleKey to resolve and optional backTo navigation route path
 * @returns Centered header component with Back action and language toggles
 */
export function BackPageHeader({ titleKey, backTo = '/dashboard' }: Props) {
  const { t, lang, setLang } = useI18n();
  const { mutate: savePrefs } = useSavePreferences();

  const handleLangChange = (code: Lang) => {
    setLang(code);
    savePrefs({ lang: code });
  };

  return (
    <header className="top-nav back-page-top-nav">
      <div className="back-nav-leading">
        <Link to={backTo} className="brand-logo-link back-nav-logo" aria-label="Broker App">
          <img src={assetUrl('images/LOGO.png?v=6')} alt="Logo" width={140} height={35} decoding="async" />
        </Link>
        <Link to={backTo} className="btn btn-outline header-back" aria-label={t('common.back')}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="header-back-label">{t('common.back')}</span>
        </Link>
      </div>

      <h2 className="back-nav-title">{t(titleKey)}</h2>

      <div className="back-nav-trailing">
        {LANG_OPTIONS.map((opt) => (
          <button
            key={opt.code}
            type="button"
            className={`btn ${lang === opt.code ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
            onClick={() => handleLangChange(opt.code)}
            aria-label={`Switch to ${opt.label}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </header>
  );
}
