import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { usePreferences, useSavePreferences } from '@/hooks/useApi';
import { Skeleton } from '@/components/Skeleton';
import { apiPostJson } from '@/lib/api';
import type { Lang } from '@/types/api';

type Theme = 'dark' | 'light' | 'system';

/**
 * Internal helper to set theme styles to document elements and persist selection to local storage.
 *
 * @param theme style parameter theme name
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  borderBottom?: boolean;
}

/**
 * Helper row toggle layout component rendering checkbox control switch.
 *
 * @param props styling/functional parameters of toggle
 * @returns ToggleRow container element
 */
function ToggleRow({ label, description, checked, onChange, disabled, borderBottom = true }: ToggleRowProps) {
  return (
    <div
      className="flex-between"
      style={{
        padding: '15px 0',
        borderBottom: borderBottom ? '1px solid var(--border-light)' : undefined,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div>
        <div className="font-bold">{label}</div>
        <div className="text-sm text-secondary">{description}</div>
      </div>
      <div style={{ direction: 'ltr' }}>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
      </div>
    </div>
  );
}

/**
 * Settings Page managing user preferences (Language selection, UI Dark/Light Theme modes,
 * two-factor authentication toggles, and email reports parameters).
 * The goal of this page is to save preferences to local storage and sync settings to the server database.
 *
 * @returns Settings page view layout
 */
export function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();

  const { data: prefs, isLoading: prefsLoading } = usePreferences();
  const { mutate: savePrefs } = useSavePreferences();

  const [pushNotif, setPushNotif] = useState(true);
  const [emailReports, setEmailReports] = useState(true);
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  // Hydrate from DB once loaded
  useEffect(() => {
    if (!prefs) return;
    if ('pushNotif' in prefs) setPushNotif(prefs.pushNotif === 'true');
    if ('emailReports' in prefs) setEmailReports(prefs.emailReports === 'true');
    if ('theme' in prefs) {
      const t = prefs.theme as Theme;
      setThemeState(t);
      applyTheme(t);
    }
  }, [prefs]);

  useEffect(() => {
    document.title = t('titles.settings');
  }, [t]);

  function handleToggle(key: string, setter: (v: boolean) => void) {
    return (v: boolean) => {
      setter(v);
      savePrefs(
        { [key]: String(v) },
        {
          onSuccess: () => toast.show(t('alerts.settingsOk'), { variant: 'success' }),
          onError: () => toast.show(t('alerts.settingsFail') || 'Save failed', { variant: 'error' }),
        },
      );
    };
  }

  function handleLangChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const l = e.target.value as Lang;
    setLang(l);
    savePrefs({ lang: l });
  }

  function handleThemeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as Theme;
    setThemeState(value);
    applyTheme(value);
    savePrefs(
      { theme: value },
      { onSuccess: () => toast.show(t('alerts.settingsOk'), { variant: 'success' }) },
    );
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      toast.show(t('settings.passwordShort'), { variant: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.show(t('settings.passwordMismatch'), { variant: 'error' });
      return;
    }
    setPwBusy(true);
    const res = await apiPostJson('/api/auth/password', { currentPassword, newPassword });
    setPwBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: string }));
      toast.show(
        data.error === 'wrong_password' ? t('settings.wrongPassword') : t('settings.passwordFailed'),
        { variant: 'error' },
      );
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwOpen(false);
    toast.show(t('settings.passwordSaved'), { variant: 'success' });
  }

  return (
    <>
      <BackPageHeader titleKey="settings.pageTitle" />

      <div className="container mt-20" style={{ maxWidth: 600 }}>

        {/* Security */}
        <div className="card text-left">
          <h3
            className="mb-20 text-xl font-bold mt-20"
            style={{ borderBottom: '2px solid var(--border-light)', paddingBottom: 20 }}
          >
            {t('settings.security')}
          </h3>

          {prefsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
              <Skeleton height={48} />
              <Skeleton height={48} />
            </div>
          ) : (
            <>
              <ToggleRow
                label={t('settings.twofa')}
                description={t('settings.unavailable')}
                checked={false}
                onChange={() => undefined}
                disabled
              />
              <ToggleRow
                label={t('settings.biometric')}
                description={t('settings.unavailable')}
                checked={false}
                onChange={() => undefined}
                disabled
                borderBottom={false}
              />
            </>
          )}

          <div className="mt-20">
            {pwOpen ? (
              <div className="flex-gap flex-col">
                <label className="font-bold" htmlFor="currentPassword">{t('settings.currentPassword')}</label>
                <input id="currentPassword" type="password" className="form-control" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                <label className="font-bold" htmlFor="newPassword">{t('settings.newPassword')}</label>
                <input id="newPassword" type="password" className="form-control" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <label className="font-bold" htmlFor="confirmPassword">{t('settings.confirmPassword')}</label>
                <input id="confirmPassword" type="password" className="form-control" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <button type="button" className="btn btn-primary" disabled={pwBusy} onClick={() => void handleChangePassword()}>
                  {pwBusy ? '...' : t('settings.savePassword')}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setPwOpen(false)}>
                  {t('account.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => setPwOpen(true)}
              >
                {t('settings.changePassword')}
              </button>
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="card text-left">
          <h3
            className="mb-20 text-xl font-bold mt-20"
            style={{ borderBottom: '2px solid var(--border-light)', paddingBottom: 20 }}
          >
            {t('settings.notifications')}
          </h3>

          {prefsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
              <Skeleton height={48} />
              <Skeleton height={48} />
            </div>
          ) : (
            <>
              <ToggleRow
                label={t('settings.push')}
                description={t('settings.pushDesc')}
                checked={pushNotif}
                onChange={handleToggle('pushNotif', setPushNotif)}
              />
              <ToggleRow
                label={t('settings.emailReports')}
                description={t('settings.emailReportsDesc')}
                checked={emailReports}
                onChange={handleToggle('emailReports', setEmailReports)}
                borderBottom={false}
              />
            </>
          )}
        </div>

        {/* General */}
        <div className="card text-left">
          <h3
            className="mb-20 text-xl font-bold mt-20"
            style={{ borderBottom: '2px solid var(--border-light)', paddingBottom: 20 }}
          >
            {t('settings.general')}
          </h3>

          <div className="form-group mb-20">
            <label className="font-bold" htmlFor="langSelect">
              {t('settings.language')}
            </label>
            <select
              id="langSelect"
              className="form-control"
              style={{ padding: 10, fontSize: '1.1rem' }}
              value={lang}
              onChange={handleLangChange}
            >
              <option value="en">{t('settings.langEn')}</option>
              <option value="ru">{t('settings.langRu')}</option>
              <option value="he">{t('settings.langHe')}</option>
            </select>
          </div>

          <div className="form-group mb-0">
            <label className="font-bold" htmlFor="themeSelect">
              {t('settings.theme')}
            </label>
            <select
              id="themeSelect"
              className="form-control"
              style={{ padding: 10, fontSize: '1.1rem' }}
              value={theme}
              onChange={handleThemeChange}
            >
              <option value="dark">{t('settings.themeDark')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="system">{t('settings.themeSystem')}</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
