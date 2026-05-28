import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPostFormUrlEncoded } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { AuthHeader } from '@/components/AuthHeader';

export function LandingPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = t('titles.landing');
    // Dev smoke check: ping backend so we know API is reachable.
    apiGet('/api/health')
      .then(() => toast.show('API: OK', { variant: 'success', duration: 1400 }))
      .catch(() => {
        /* backend optional during static UI work */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDemo = async (e: React.MouseEvent) => {
    e.preventDefault();
    toast.show(t('alerts.demoOk'), { variant: 'success', duration: 1800 });

    const body = new URLSearchParams();
    body.set('username', 'demo@broker.local');
    body.set('password', 'demo123');

    try {
      const res = await apiPostFormUrlEncoded('/api/auth/login', body);
      if (res.ok) {
        setTimeout(() => navigate('/dashboard'), 600);
        return;
      }
      try {
        const err = await res.json();
        if (err?.error === 'banned') {
          toast.show(t('alerts.authBanned'), { variant: 'error', duration: 5000 });
          return;
        }
      } catch {
        /* ignore */
      }
      // Fallback: send to login if demo auth isn't available.
      setTimeout(() => navigate('/login'), 600);
    } catch {
      setTimeout(() => navigate('/login'), 600);
    }
  };

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
          className="landing-sub-en"
          lang="en"
          dir="ltr"
          style={{
            color: 'var(--text-secondary)',
            fontSize: '1.1rem',
            marginBottom: 30,
          }}
        >
          Trade Forex, Stocks, Commodities &amp; Crypto — Connected to MetaTrader 5
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
          <a
            href="#"
            onClick={handleDemo}
            className="btn btn-primary"
            style={{ padding: '15px 30px', fontSize: '1.1rem' }}
          >
            {t('landing.demoAccount')}
          </a>
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
