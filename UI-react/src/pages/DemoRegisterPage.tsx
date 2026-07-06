import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiPostJson, apiPostFormUrlEncoded } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { saveUserProfile } from '@/lib/userProfile';
import { AuthHeader } from '@/components/AuthHeader';
import { useAuth } from '@/hooks/useAuth';

const CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
const LEVERAGES = ['1:100', '1:50', '1:500'] as const;

const schema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  leverage: z.enum(['1:100', '1:50', '1:500']),
  terms: z.literal(true, { message: 'You must accept terms' }),
  risk: z.literal(true, { message: 'You must accept risk disclosure' }),
});
type FormData = z.infer<typeof schema>;

/**
 * Registration page for creating DEMO trading accounts.
 * Validates fields via Zod, sets up local storage profile values, registers user credentials on the backend,
 * and signs the user in.
 * The goal of this page is to establish a demo account configuration for paper trading simulation.
 *
 * @returns Demo registration form page layout
 */
export function DemoRegisterPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    document.title = t('titles.demoRegister');
  }, [t]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      currency: 'USD',
      leverage: '1:100',
    },
  });

  const onSubmit = async (data: FormData) => {
    const trimmedEmail = data.email.trim().toLowerCase();
    const displayName =
      [data.firstName?.trim(), data.lastName?.trim()].filter(Boolean).join(' ').trim() ||
      trimmedEmail.split('@')[0];

    try {
      // 1. Register the user
      const registerRes = await apiPostJson('/api/auth/register', {
        email: trimmedEmail,
        displayName,
        password: data.password,
      });

      if (registerRes.status === 201) {
        // Save profile locally
        saveUserProfile({
          firstName: data.firstName?.trim() ?? '',
          lastName: data.lastName?.trim() ?? '',
          idDoc: '',
          email: trimmedEmail,
          phone: '',
          currency: data.currency,
          leverage: data.leverage,
        });

        toast.show(t('alerts.registerOk'), { variant: 'success', duration: 1800 });

        // 2. Perform Automatic Login for a seamless experience
        const body = new URLSearchParams();
        body.set('username', trimmedEmail);
        body.set('password', data.password);

        const loginRes = await apiPostFormUrlEncoded('/api/auth/login', body);
        if (loginRes.ok) {
          await refresh();
          setTimeout(() => navigate('/dashboard'), 800);
        } else {
          // If auto login fails for some reason, redirect to manual login
          setTimeout(() => navigate('/login'), 1200);
        }
      } else if (registerRes.status === 409) {
        toast.show(t('alerts.authRegisterConflict'), { variant: 'warning' });
      } else {
        toast.show(t('alerts.authRegisterFail'), { variant: 'error' });
      }
    } catch {
      toast.show(t('alerts.authRegisterFail'), { variant: 'error' });
    }
  };

  return (
    <>
      <AuthHeader>
        <Link to="/login" className="btn btn-outline">
          {t('landing.logIn')}
        </Link>
      </AuthHeader>

      <div className="container" style={{ maxWidth: 550, marginTop: 40 }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(3, 5, 9, 0.7) 0%, rgba(7, 11, 20, 0.7) 100%)',
          border: '1px solid rgba(250, 204, 21, 0.25)', // Elegant subtle gold boundary for demo environment
          boxShadow: '0 10px 40px rgba(234, 179, 8, 0.05)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 25 }}>
            <span style={{
              background: 'rgba(234, 179, 8, 0.15)',
              color: 'var(--accent)',
              padding: '6px 14px',
              borderRadius: '30px',
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'inline-block',
              marginBottom: 12
            }}>
              Sandbox Environment
            </span>
            <h2 style={{ marginBottom: 8 }}>{t('demoRegister.heading')}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {t('demoRegister.sub')}
            </p>
          </div>

          <form
            className="text-left"
            onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}
          >
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="demoFirstName">{t('register.firstName')}</label>
                <input
                  id="demoFirstName"
                  type="text"
                  className="form-control"
                  placeholder="John"
                  autoComplete="given-name"
                  {...register('firstName')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="demoLastName">{t('register.lastName')}</label>
                <input
                  id="demoLastName"
                  type="text"
                  className="form-control"
                  placeholder="Doe"
                  autoComplete="family-name"
                  {...register('lastName')}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="demoEmail">{t('login.email')} *</label>
              <input
                id="demoEmail"
                type="email"
                className="form-control"
                placeholder="trader@sandbox.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: 4, display: 'block' }}>
                  {errors.email.message}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="demoPassword">{t('login.password')} *</label>
              <input
                id="demoPassword"
                type="password"
                className="form-control"
                placeholder="••••••••"
                autoComplete="new-password"
                {...register('password')}
              />
              {errors.password && (
                <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: 4, display: 'block' }}>
                  {errors.password.message}
                </span>
              )}
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="demoCurrency">{t('register.currency')}</label>
                <select
                  id="demoCurrency"
                  className="form-control"
                  {...register('currency')}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="demoLeverage">{t('register.leverage')}</label>
                <select
                  id="demoLeverage"
                  className="form-control"
                  {...register('leverage')}
                >
                  {LEVERAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group flex-gap" style={{ marginBottom: errors.terms ? 8 : 16 }}>
              <input
                id="demoTerms"
                type="checkbox"
                {...register('terms')}
              />
              <label htmlFor="demoTerms" style={{ margin: 0, fontSize: '0.85rem' }}>
                {t('register.terms')}
              </label>
            </div>
            {errors.terms && (
              <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: -8, marginBottom: 12, display: 'block' }}>
                {errors.terms.message}
              </span>
            )}

            <div className="form-group flex-gap" style={{ marginBottom: errors.risk ? 8 : 20 }}>
              <input
                id="demoRisk"
                type="checkbox"
                {...register('risk')}
              />
              <label htmlFor="demoRisk" style={{ margin: 0, fontSize: '0.85rem' }}>
                {t('register.risk')}
              </label>
            </div>
            {errors.risk && (
              <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: -8, marginBottom: 12, display: 'block' }}>
                {errors.risk.message}
              </span>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ width: '100%', marginTop: 5, padding: '16px 20px' }}
            >
              {isSubmitting ? '...' : t('demoRegister.submit')}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
