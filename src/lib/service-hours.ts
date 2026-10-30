export function serviceIsOpen(settings: { enabled: boolean; open_time: string; close_time: string } | null, now = new Date()) {
  if (!settings?.enabled) return false;
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const open = settings.open_time.slice(0,5), close = settings.close_time.slice(0,5);
  return open === close || (open < close ? clock >= open && clock < close : clock >= open || clock < close);
}
