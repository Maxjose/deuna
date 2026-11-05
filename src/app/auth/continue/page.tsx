import { redirect } from 'next/navigation';
import { AuthAppReturn } from '@/components/auth-app-return';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Volver a De1na', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (typeof params.code !== 'string' || !params.code || params.code.length > 2048) redirect('/login');
  return <AuthAppReturn code={params.code} next={params.next === '/reset-password' ? params.next : null} />;
}
