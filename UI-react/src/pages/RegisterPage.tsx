import { useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { RegisterForm } from '@/components/RegisterForm';

/** Real account: ID document and phone, then the login page. */
export function RegisterPage() {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t('titles.register');
  }, [t]);
  return <RegisterForm kind="real" />;
}
