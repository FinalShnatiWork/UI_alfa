import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiPostJson } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { saveUserProfile } from '@/lib/userProfile';
import { AuthHeader } from '@/components/AuthHeader';

const CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
/** Every account is opened at 1:100 on the server. */
const LEVERAGES = ['1:100'] as const;

const schema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  idDoc: z.string().optional(),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  leverage: z.enum(LEVERAGES),
  terms: z.literal(true, { message: 'You must accept terms' }),
  risk: z.literal(true, { message: 'You must accept risk disclosure' }),
});
type FormData = z.infer<typeof schema>;

/**
 * Registration Page for registering new REAL broker client accounts.
 * Collects personal identification files, contact information, passwords, and currency settings.
 * The goal of this page is to securely enroll a real user account in the broker database.
 *
 * @returns Real account registration page layout
 */
export function RegisterPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

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

  useEffect(() => {
    document.title = t('titles.register');
  }, [t]);

  const onSubmit = async (data: FormData) => {
    const trimmedEmail = data.email.trim();
    const displayName =
      [data.firstName?.trim(), data.lastName?.trim()].filter(Boolean).join(' ').trim() ||
      trimmedEmail.split('@')[0];

    try {
      const res = await apiPostJson('/api/auth/register', {
        email: trimmedEmail,
        displayName,
        password: data.password,
      });
      if (res.status === 201) {
        saveUserProfile({
          firstName: data.firstName?.trim() ?? '',
          lastName: data.lastName?.trim() ?? '',
          idDoc: data.idDoc?.trim() ?? '',
          email: trimmedEmail,
          phone: data.phone?.trim() ?? '',
          currency: data.currency,
          leverage: data.leverage,
        });
        toast.show(t('alerts.registerOk'), { variant: 'success', duration: 2400 });
        setTimeout(() => navigate('/login'), 1800);
      } else if (res.status === 409) {
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

      <div className="container" style={{ maxWidth: 600, marginTop: 30 }}>
        <div className="card">
          <h2 className="text-center">{t('register.heading')}</h2>
          <p
            className="text-center"
            style={{ color: 'var(--text-secondary)', marginBottom: 20 }}
          >
            {t('register.sub')}
          </p>

          <form
            className="text-left"
            onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}
          >
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="regFirstName">{t('register.firstName')}</label>
                <input
                  id="regFirstName"
                  type="text"
                  className="form-control"
                  autoComplete="given-name"
                  {...register('firstName')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="regLastName">{t('register.lastName')}</label>
                <input
                  id="regLastName"
                  type="text"
                  className="form-control"
                  autoComplete="family-name"
                  {...register('lastName')}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="regIdDoc">{t('register.idDoc')}</label>
              <input
                id="regIdDoc"
                type="text"
                className="form-control"
                autoComplete="off"
                {...register('idDoc')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="regEmail">{t('login.email')}</label>
              <input
                id="regEmail"
                type="email"
                className="form-control"
                placeholder={t('login.emailPlaceholder')}
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
              <label htmlFor="regPhone">{t('register.phone')}</label>
              <input
                id="regPhone"
                type="tel"
                className="form-control"
                autoComplete="tel"
                {...register('phone')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="regPassword">{t('login.password')}</label>
              <input
                id="regPassword"
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
                <label htmlFor="regCurrency">{t('register.currency')}</label>
                <select
                  id="regCurrency"
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
                <label htmlFor="regLeverage">{t('register.leverage')}</label>
                <select
                  id="regLeverage"
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

            <div className="form-group flex-gap">
              <input
                id="terms"
                type="checkbox"
                {...register('terms')}
              />
              <label htmlFor="terms" style={{ margin: 0 }}>
                {t('register.terms')}
              </label>
            </div>
            {errors.terms && (
              <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: -8, marginBottom: 8, display: 'block' }}>
                {errors.terms.message}
              </span>
            )}

            <div className="form-group flex-gap">
              <input
                id="risk"
                type="checkbox"
                {...register('risk')}
              />
              <label htmlFor="risk" style={{ margin: 0 }}>
                {t('register.risk')}
              </label>
            </div>
            {errors.risk && (
              <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: -8, marginBottom: 8, display: 'block' }}>
                {errors.risk.message}
              </span>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ width: '100%', marginTop: 10 }}
            >
              {isSubmitting ? '...' : t('register.submit')}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
