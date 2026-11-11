import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next =
    request.nextUrl.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/dashboard";
  const target = new URL(next === '/reset-password' ? next : '/auth/confirmation', request.url);
  if (code) {
    const client = await serverClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (next === '/reset-password') target.searchParams.set(error ? 'error' : 'session', error ? 'invalid_link' : '1');
  }
  // A redirect without a fragment preserves implicit recovery tokens for the browser.
  if ((!code && next !== '/reset-password') || request.nextUrl.searchParams.has('error')) target.searchParams.set('error','invalid_link');
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
}
