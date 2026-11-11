import { PasswordRecovery } from '@/components/password-recovery';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cambiar contraseña · De1na', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default function Reset() {
  return <PasswordRecovery />;
}
