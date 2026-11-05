export function authReturnLinks(code: string, next: string | null = null) {
  const params = new URLSearchParams({ code, complete: '1' });
  if (next === '/reset-password') params.set('next', next);
  const callback = `/auth/callback?${params}`;
  const fallback = `https://www.de1na.app${callback}`;
  return {
    callback,
    app: `intent://de1na.app${callback}#Intent;scheme=https;package=com.de1na.app;S.browser_fallback_url=${encodeURIComponent(fallback)};end`,
  };
}
