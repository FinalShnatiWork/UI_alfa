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
 * Used across sub-screens like Charts, Finance, Settings, History, and Analyzer.
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
    <header className="top-nav header-centered">
      <div className="header-leading">
        <Link to={backTo} className="brand-logo-link" aria-label="Broker App">
          <img src={assetUrl('images/LOGO.png?v=6')} alt="Logo" width={160} height={40} decoding="async" />
        </Link>
        <Link to={backTo} className="btn btn-outline header-back" aria-label={t('common.back')}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>{t('common.back')}</span>
        </Link>
      </div>
      <h2 className="header-page-title">{t(titleKey)}</h2>
      <div
        className="header-trailing"
        style={{
          position: 'absolute',
          insetInlineEnd: 32,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          gap: 4,
          zIndex: 2,
        }}
      >
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
    </header>
  );
}
