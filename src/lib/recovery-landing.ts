// Supabase can fall back to Site URL when a redirect is absent or not allowlisted.
export function recoveryLanding(pathname: string, hash: string) {
  if (pathname === '/reset-password') return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const type = params.get('type');
  if (type === 'recovery' || (!type && params.has('access_token') && params.has('refresh_token')) || params.get('error_code') === 'otp_expired') {
    return '/reset-password' + hash;
  }
  return null;
}
