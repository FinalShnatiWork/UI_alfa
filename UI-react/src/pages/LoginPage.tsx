import { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiPostFormUrlEncoded } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { AuthHeader } from '@/components/AuthHeader';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, status } = useAuth();

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    document.title = t('titles.login');
  }, [t]);

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(from, { replace: true });
    }
  }, [status, navigate, from]);

  const onSubmit = async (data: FormData) => {
    const trimmedEmail = data.email.trim().toLowerCase();
    const body = new URLSearchParams();
    body.set('username', trimmedEmail);
    body.set('password', data.password);

    try {
      const res = await apiPostFormUrlEncoded('/api/auth/login', body);
      if (res.ok) {
        toast.show(t('alerts.authLoginOk'), { variant: 'success', duration: 1400 });
        await refresh();
        setTimeout(() => navigate(from, { replace: true }), 600);
        return;
      }

      let err: { error?: string } | null = null;
      try {
        err = await res.json();
      } catch {
        /* ignore */
      }
      if (err?.error === 'banned') {
        toast.show(t('alerts.authBanned'), { variant: 'error', duration: 5000 });
      } else {
        toast.show(t('alerts.authLoginFail'), { variant: 'error' });
      }
    } catch {
      toast.show(t('alerts.authLoginFail'), { variant: 'error' });
    }
  };

  const handleForgot = (e: React.MouseEvent) => {
    e.preventDefault();
    toast.show(t('alerts.passwordRecovery'), { variant: 'info' });
  };

  const handleGoogle = async () => {
    toast.show(t('alerts.googleLogin'), { variant: 'info', duration: 3200 });
    await refresh();
    setTimeout(() => navigate('/dashboard'), 1500);
  };

  return (
    <>
      <AuthHeader>
        <Link to="/register" className="btn btn-outline">
          {t('landing.signUp')}
        </Link>
      </AuthHeader>

      <div className="container" style={{ maxWidth: 450, marginTop: 50 }}>
        <div className="card text-center">
          <h2>{t('login.heading')}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{t('login.sub')}</p>

          <form
            className="text-left"
            onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}
          >
            <div className="form-group">
              <label htmlFor="loginEmail">{t('login.email')}</label>
              <input
                id="loginEmail"
                type="email"
                className="form-control"
                autoComplete="email"
                placeholder={t('login.emailPlaceholder')}
                {...register('email')}
              />
              {errors.email && (
                <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: 4, display: 'block' }}>
                  {errors.email.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="loginPassword">{t('login.password')}</label>
              <input
                id="loginPassword"
                type="password"
                className="form-control"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && (
                <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: 4, display: 'block' }}>
                  {errors.password.message}
                </span>
              )}
            </div>

            <div className="flex-between mb-20">
              <a
                href="#"
                onClick={handleForgot}
                style={{ color: 'var(--blue)', fontSize: '0.85rem', textDecoration: 'none' }}
              >
                {t('login.forgot')}
              </a>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ width: '100%', marginBottom: 20 }}
            >
              {isSubmitting ? '...' : t('login.submit')}
            </button>

            <div
              style={{
                borderTop: '1px solid var(--border-light)',
                margin: '20px 0',
                position: 'relative',
                textAlign: 'center',
              }}
            >
              <span
                style={{
                  background: 'var(--bg)',
                  padding: '0 10px',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  position: 'relative',
                  top: -10,
                }}
              >
                {t('common.or')}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-outline-dark"
              style={{ width: '100%' }}
              onClick={() => void handleGoogle()}
            >
              {t('login.google')}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
