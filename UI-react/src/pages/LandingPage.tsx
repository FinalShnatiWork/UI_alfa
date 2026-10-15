import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { AuthHeader } from '@/components/AuthHeader';
import { assetUrl } from '@/lib/assets';

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
        <div className="flex-gap landing-header-actions">
          <Link to="/login" className="btn btn-outline landing-login-btn">
            {t('landing.logIn')}
          </Link>
          <Link to="/register" className="btn btn-primary landing-signup-btn">
            {t('landing.signUp')}
          </Link>
        </div>
      </AuthHeader>

      <div className="container text-center mt-20 landing-hero-container">
        <h1 className="landing-hero-title">{t('landing.hero')}</h1>
        <p className="landing-hero-sub">
          {t('landing.sub')}
        </p>

        <div className="landing-cta-group">
          <Link
            to="/register"
            className="btn btn-primary landing-cta-btn"
          >
            {t('landing.openAccount')}
          </Link>
          <Link
            to="/demo-register"
            className="btn btn-primary landing-cta-btn"
          >
            {t('landing.demoAccount')}
          </Link>
        </div>
      </div>

      <div style={{ width: '100%', marginBottom: 40, overflow: 'hidden' }}>
        <img
          src={assetUrl('images/tradingHomePAGE.png?v=3')}
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

      <div className="container text-center" style={{ padding: '0 20px 40px' }}>
        <div className="landing-stats-grid card">
          <div className="stat-card">
            <div className="value text-primary">14</div>
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('landing.assets')}
            </div>
          </div>
          <div className="stat-card">
            <div className="value text-primary" dir="ltr">0.015%</div>
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('landing.spread')}
            </div>
          </div>
          <div className="stat-card">
            <div className="value text-primary" dir="ltr">1:100</div>
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('landing.leverage')}
            </div>
          </div>
        </div>
      </div>

      <div
        className="container landing-mobile-container"
        style={{ padding: '0 20px 40px', maxWidth: 1100, margin: '0 auto' }}
      >
        <div
          className="landing-mobile-banner"
          style={{
            position: 'relative',
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid rgba(234, 179, 8, 0.22)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 35px rgba(234, 179, 8, 0.12)',
            background: '#04060a',
          }}
        >
          <img
            src={assetUrl('images/tradeedge-mobile.jpg')}
            alt="TradeEdge Mobile Trading App - Powerful trading. Seamless edge."
            loading="lazy"
            decoding="async"
            width={1024}
            height={571}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              aspectRatio: '1024 / 571',
              objectFit: 'cover',
            }}
          />
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
            src={assetUrl('images/players.png')}
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
