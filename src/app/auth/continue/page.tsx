import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Volver a De1na', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (typeof params.code !== 'string' || !params.code || params.code.length > 2048) redirect('/auth/confirmation');
  const query=new URLSearchParams({code:params.code});
  if(params.next==='/reset-password')query.set('next',params.next);
  redirect(`/auth/callback?${query}`);
}
