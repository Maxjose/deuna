import { createClient } from '@supabase/supabase-js';

export function recoveryClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Servicio no disponible.');
  // Email may open outside the app, without the browser that requested it.
  return createClient(url, key, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function sendRecoveryEmail(email: string, origin: string) {
  return recoveryClient().auth.resetPasswordForEmail(email, {
    redirectTo: origin + '/auth/callback?next=/reset-password',
  });
}

export function recoveryTokens(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (params.has('error') || params.has('error_code') || params.get('type') !== 'recovery' || !access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}
