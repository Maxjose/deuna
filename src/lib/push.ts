export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(url.hostname) && url.pathname.length > 1;
  } catch { return false; }
}
