import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { AuthHeader } from '@/components/AuthHeader';

/**
 * Welcome marketing landing page for the TradeAdge Broker Platform.
 * Displays call to action buttons to direct users to register, log in, or try the demo mode.
 * The goal of this page is to serve as the initial entrance interface of the website application.
 *
 * @returns Landing page layout
 */
export function LandingPage() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = t('titles.landing');
  }, [t]);


  return (
    <>
      <AuthHeader>
        <div className="flex-gap">
          <Link to="/login" className="btn btn-outline">
            {t('landing.logIn')}
          </Link>
          <Link to="/register" className="btn btn-primary">
            {t('landing.signUp')}
          </Link>
        </div>
      </AuthHeader>

      <div className="container text-center mt-20" style={{ padding: '60px 20px 20px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 10 }}>{t('landing.hero')}</h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '1.1rem',
            marginBottom: 30,
          }}
        >
          {t('landing.sub')}
        </p>

        <div
          className="flex flex-gap"
          style={{ justifyContent: 'center', marginBottom: 40 }}
        >
          <Link
            to="/register"
            className="btn btn-primary"
            style={{ padding: '15px 30px', fontSize: '1.1rem' }}
          >
            {t('landing.openAccount')}
          </Link>
          <Link
            to="/demo-register"
            className="btn btn-primary"
            style={{ padding: '15px 30px', fontSize: '1.1rem' }}
          >
            {t('landing.demoAccount')}
          </Link>
        </div>
      </div>

      <div style={{ width: '100%', marginBottom: 60, overflow: 'hidden' }}>
        <img
          src="/images/tradingHomePAGE.png?v=3"
          alt=""
          loading="lazy"
          decoding="async"
          width={1920}
          height={1080}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            aspectRatio: '16 / 9',
            objectFit: 'cover',
          }}
        />
      </div>

      <div className="container text-center" style={{ padding: '0 20px 60px' }}>
        <div className="stats-grid grid-3 card">
          <div className="stat-card">
            <div className="value text-primary">200+</div>
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('landing.assets')}
            </div>
          </div>
          <div className="stat-card">
            <div className="value text-primary">0.0</div>
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('landing.spread')}
            </div>
          </div>
          <div className="stat-card">
            <div className="value text-primary">1:500</div>
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('landing.leverage')}
            </div>
          </div>
        </div>
      </div>

      <div
        className="container text-center"
        style={{ padding: '60px 20px', maxWidth: 1000, margin: '0 auto' }}
      >
        <h2 style={{ fontSize: '2.2rem', marginBottom: 40, fontWeight: 700 }}>
          {t('landing.whyTitle')}
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 30,
            marginBottom: 60,
            textAlign: 'left',
          }}
        >
          <div className="card" style={{ padding: 30, borderTop: '4px solid var(--primary)' }}>
            <h3 className="text-primary mb-10" style={{ fontSize: '1.3rem' }}>
              {t('landing.security.title')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {t('landing.security.text')}
            </p>
          </div>
          <div className="card" style={{ padding: 30, borderTop: '4px solid var(--primary)' }}>
            <h3 className="text-primary mb-10" style={{ fontSize: '1.3rem' }}>
              {t('landing.execution.title')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {t('landing.execution.text')}
            </p>
          </div>
          <div className="card" style={{ padding: 30, borderTop: '4px solid var(--primary)' }}>
            <h3 className="text-primary mb-10" style={{ fontSize: '1.3rem' }}>
              {t('landing.commissions.title')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {t('landing.commissions.text')}
            </p>
          </div>
        </div>

        <div
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          }}
        >
          <img
            src="/images/players.png"
            alt="Our Players / Team"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              objectFit: 'cover',
            }}
          />
        </div>
      </div>
    </>
  );
}
