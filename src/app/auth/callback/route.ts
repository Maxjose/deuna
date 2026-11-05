import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next =
    request.nextUrl.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/dashboard";
  if (code) {
    if (request.nextUrl.searchParams.get('complete') !== '1' && /Android/i.test(request.headers.get('user-agent') || '')) {
      const handoff = new URL('/auth/continue', request.url);
      handoff.searchParams.set('code', code);
      if (next === '/reset-password') handoff.searchParams.set('next', next);
      const response = NextResponse.redirect(handoff);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    }
    const client = await serverClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
