import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiPostFormUrlEncoded, apiPostJson } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { saveUserProfile } from '@/lib/userProfile';
import { AuthHeader } from '@/components/AuthHeader';
import { PasswordStrength } from '@/components/PasswordStrength';

const schema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  idDoc: z.string().optional(),
  email: z.string().email('validation.email'),
  phone: z.string().optional(),
  password: z.string().min(8, 'validation.passwordMin'),
  terms: z.literal(true, { message: 'validation.terms' }),
  risk: z.literal(true, { message: 'validation.risk' }),
});
type FormData = z.infer<typeof schema>;

function FieldError({ message, tucked, roomy }: { message?: string; tucked?: boolean; roomy?: boolean }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <span className={`field-error${tucked ? ' tucked' : ''}${roomy ? ' roomy' : ''}`}>
      {t(message)}
    </span>
  );
}

/**
 * Shared registration form. A real account also asks for an ID document and a phone,
 * then sends the person to log in. A demo account signs in and opens the cabinet.
 */
export function RegisterForm({ kind }: { kind: 'real' | 'demo' }) {
  const real = kind === 'real';
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [passwordDraft, setPasswordDraft] = useState('');
  const id = (name: string) => (real ? `reg${name}` : `demo${name}`);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const trimmedEmail = real ? data.email.trim() : data.email.trim().toLowerCase();
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
          idDoc: real ? (data.idDoc?.trim() ?? '') : '',
          email: trimmedEmail,
          phone: real ? (data.phone?.trim() ?? '') : '',
        });
        toast.show(t('alerts.registerOk'), { variant: 'success', duration: real ? 2400 : 1800 });
        if (real) {
          setTimeout(() => navigate('/login'), 1800);
          return;
        }
        const body = new URLSearchParams();
        body.set('username', trimmedEmail);
        body.set('password', data.password);
        const loginRes = await apiPostFormUrlEncoded('/api/auth/login', body);
        if (loginRes.ok) {
          await refresh();
          setTimeout(() => navigate('/dashboard'), 800);
        } else {
          setTimeout(() => navigate('/login'), 1200);
        }
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

      <div className={`container register-shell${real ? '' : ' demo'}`}>
        <div className={real ? 'card' : 'card demo-register-card'}>
          {real ? (
            <>
              <h2 className="text-center">{t('register.heading')}</h2>
              <p className="text-center register-sub">{t('register.sub')}</p>
            </>
          ) : (
            <div className="demo-register-head">
              <span className="demo-register-badge">{t('demoRegister.badge')}</span>
              <h2>{t('demoRegister.heading')}</h2>
              <p>{t('demoRegister.sub')}</p>
            </div>
          )}

          <form className="text-left" noValidate onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}>
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor={id('FirstName')}>{t('register.firstName')}</label>
                <input
                  id={id('FirstName')}
                  type="text"
                  className="form-control"
                  placeholder={real ? undefined : t('register.firstName')}
                  autoComplete="given-name"
                  {...register('firstName')}
                />
              </div>
              <div className="form-group">
                <label htmlFor={id('LastName')}>{t('register.lastName')}</label>
                <input
                  id={id('LastName')}
                  type="text"
                  className="form-control"
                  placeholder={real ? undefined : t('register.lastName')}
                  autoComplete="family-name"
                  {...register('lastName')}
                />
              </div>
            </div>

            {real && (
              <div className="form-group">
                <label htmlFor={id('IdDoc')}>{t('register.idDoc')}</label>
                <input id={id('IdDoc')} type="text" className="form-control" autoComplete="off" {...register('idDoc')} />
              </div>
            )}

            <div className="form-group">
              <label htmlFor={id('Email')}>{t('login.email')}{real ? '' : ' *'}</label>
              <input
                id={id('Email')}
                type="email"
                dir="ltr"
                className="form-control"
                placeholder={real ? t('login.emailPlaceholder') : 'trader@sandbox.com'}
                autoComplete="email"
                {...register('email')}
              />
              <FieldError message={errors.email?.message} />
            </div>

            {real && (
              <div className="form-group">
                <label htmlFor={id('Phone')}>{t('register.phone')}</label>
                <input id={id('Phone')} type="tel" className="form-control" autoComplete="tel" {...register('phone')} />
              </div>
            )}

            <div className="form-group">
              <label htmlFor={id('Password')}>{t('login.password')}{real ? '' : ' *'}</label>
              <input
                id={id('Password')}
                type="password"
                className="form-control"
                placeholder="••••••••"
                autoComplete="new-password"
                {...register('password', { onChange: (e) => setPasswordDraft(e.target.value) })}
              />
              <PasswordStrength value={passwordDraft} />
              <FieldError message={errors.password?.message} />
            </div>

            <div className={real ? 'form-group flex-gap register-check' : `form-group flex-gap demo-check${errors.terms ? ' tight' : ''}`}>
              <input id={real ? 'terms' : 'demoTerms'} type="checkbox" {...register('terms')} />
              <label htmlFor={real ? 'terms' : 'demoTerms'}>{t('register.terms')}</label>
            </div>
            <FieldError message={errors.terms?.message} tucked roomy={!real} />

            <div className={real ? 'form-group flex-gap register-check' : `form-group flex-gap demo-check risk${errors.risk ? ' tight' : ''}`}>
              <input id={real ? 'risk' : 'demoRisk'} type="checkbox" {...register('risk')} />
              <label htmlFor={real ? 'risk' : 'demoRisk'}>{t('register.risk')}</label>
            </div>
            <FieldError message={errors.risk?.message} tucked roomy={!real} />

            <button
              type="submit"
              className={`btn btn-primary register-submit${real ? '' : ' demo'}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? '...' : t(real ? 'register.submit' : 'demoRegister.submit')}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
