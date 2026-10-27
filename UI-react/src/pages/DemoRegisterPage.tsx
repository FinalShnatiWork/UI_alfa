import { useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { RegisterForm } from '@/components/RegisterForm';

/** Demo account: no ID or phone. After registration the person is signed in. */
export function DemoRegisterPage() {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t('titles.demoRegister');
  }, [t]);
  return <RegisterForm kind="demo" />;
}
