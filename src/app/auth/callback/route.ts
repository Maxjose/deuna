import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next =
    request.nextUrl.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/dashboard";
  if (code) {
    // Password recovery still needs the original app's PKCE session.
    if (next === '/reset-password' && request.nextUrl.searchParams.get('complete') !== '1' && /Android/i.test(request.headers.get('user-agent') || '')) {
      const recovery=new URL('/auth/continue',request.url);
      recovery.searchParams.set('code',code);recovery.searchParams.set('next',next);
      const response=NextResponse.redirect(recovery);
      response.headers.set('Cache-Control','private, no-store');
      response.headers.set('Referrer-Policy','no-referrer');
      return response;
    }
    const client = await serverClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error && next === '/reset-password') return NextResponse.redirect(new URL(next, request.url));
  }
  const target = new URL('/auth/confirmation', request.url);
  if (!code || request.nextUrl.searchParams.has('error')) target.searchParams.set('error','invalid_link');
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
}
