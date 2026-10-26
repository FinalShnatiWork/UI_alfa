import { useI18n } from '@/hooks/useI18n';

/** Shown while typing. The server still accepts any password of 8 characters or more. */
export function PasswordStrength({ value }: { value: string }) {
  const { t } = useI18n();
  if (!value) return null;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  const key = score <= 1 ? 'password.weak' : score <= 3 ? 'password.fair' : 'password.strong';
  return (
    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4, display: 'block' }}>
      {t(key)}
    </span>
  );
}
