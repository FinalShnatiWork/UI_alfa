import { useEffect } from 'react';
import { getUserProfile } from '@/lib/userProfile';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { Skeleton } from '@/components/Skeleton';
import { useBrokerOverview, useAuthMe } from '@/hooks/useApi';
import { useLogout } from '@/hooks/useLogout';

/**
 * Formatting utility to return a dash symbol if string is null or empty.
 *
 * @param value raw input value
 * @returns formatted string or dash
 */
function displayOrDash(value: unknown): string {
  if (value == null) return '—';
  const s = String(value).trim();
  return s || '—';
}

/**
 * Account page displaying currently logged-in user profile attributes,
 * security credentials, and registration files.
 * The goal of this page is to view user personal credentials and log out.
 *
 * @returns Account view page element
 */
export function AccountPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { logout, loggingOut } = useLogout();

  const { data: me, isLoading: meLoading } = useAuthMe();
  const { data: overview, isLoading: overviewLoading } = useBrokerOverview();

  const isLoading = meLoading || overviewLoading;

  useEffect(() => {
    document.title = t('titles.account');
  }, [t]);

  const profile = getUserProfile();

  const displayName = me?.displayName || (profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() : '') || '—';
  const email = me?.email || displayOrDash(profile?.email);
  const phone = displayOrDash(profile?.phone);
  const idDoc = displayOrDash(profile?.idDoc);
  const pan = overview?.tradingAccountId ? String(overview.tradingAccountId) : displayOrDash(profile?.uid);
  const uidLine = overview?.tradingAccountId
    ? t('account.uidFormat', { uid: String(overview.tradingAccountId) })
    : profile?.uid
      ? t('account.uidFormat', { uid: String(profile.uid) })
      : t('account.uid');

  const handleEdit = () => {
    toast.show(t('alerts.comingSoon'), { variant: 'info' });
  };

  const handleLogout = () => {
    toast.show(t('alerts.authLoggedOut'), { variant: 'success' });
    void logout();
  };

  return (
    <>
      <BackPageHeader titleKey="account.title" />

      <div className="container mt-20" style={{ maxWidth: 600 }}>
        <div className="card text-center" style={{ position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: '50%',
              background: '#3c328f',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.2rem',
              margin: '30px auto 15px',
              position: 'relative',
              border: '4px solid var(--bg)',
              fontWeight: 'bold',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <p className="text-secondary text-sm mb-5">{t('account.clientName')}</p>
          {isLoading ? (
            <Skeleton width={160} height={24} style={{ margin: '8px auto' }} />
          ) : (
            <h2 className="font-bold">{displayName}</h2>
          )}
          {isLoading ? (
            <Skeleton width={120} height={16} style={{ margin: '6px auto' }} />
          ) : (
            <p className="text-secondary text-sm">{uidLine}</p>
          )}
        </div>

        <div className="card text-left">
          <h3
            className="mb-20 text-xl border-bottom"
            style={{ paddingBottom: 10, borderBottom: '2px solid var(--border-light)' }}
          >
            {t('account.personal')}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li
              className="flex-between"
              style={{ padding: '15px 0', borderBottom: '1px solid var(--border-light)' }}
            >
              <span className="font-bold">{t('account.idPassport')}</span>
              {isLoading ? <Skeleton width={80} height={14} /> : <span className="text-secondary">{idDoc}</span>}
            </li>
            <li
              className="flex-between"
              style={{ padding: '15px 0', borderBottom: '1px solid var(--border-light)' }}
            >
              <span className="font-bold">{t('account.email')}</span>
              {isLoading ? <Skeleton width={140} height={14} /> : <span className="text-secondary dir-ltr">{email}</span>}
            </li>
            <li
              className="flex-between"
              style={{ padding: '15px 0', borderBottom: '1px solid var(--border-light)' }}
            >
              <span className="font-bold">{t('account.phone')}</span>
              {isLoading ? <Skeleton width={100} height={14} /> : <span className="text-secondary dir-ltr">{phone}</span>}
            </li>
            <li className="flex-between" style={{ padding: '15px 0' }}>
              <span className="font-bold">{t('account.pan')}</span>
              {isLoading ? <Skeleton width={60} height={14} /> : <span className="text-secondary dir-ltr">{pan}</span>}
            </li>
          </ul>
        </div>

        <div className="flex-gap flex-col" style={{ width: '100%' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: 15, fontSize: '1.1rem' }}
            onClick={handleEdit}
          >
            {t('account.edit')}
          </button>
          <button
            type="button"
            className="btn btn-outline-dark"
            disabled={loggingOut}
            style={{ width: '100%', padding: 15, fontSize: '1.1rem' }}
            onClick={() => void handleLogout()}
          >
            {loggingOut ? '...' : t('account.logout')}
          </button>
        </div>
      </div>
    </>
  );
}
