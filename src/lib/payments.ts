export type PaymentMethod = 'cash' | 'pago_movil';
export type PaymentSettings = {
  pago_movil_bank: string | null;
  pago_movil_phone: string | null;
  pago_movil_id: string | null;
  exchange_rate: number | string | null;
  exchange_rate_updated_at?: string | null;
};

export function rateValue(rate: number | string | null | undefined) {
  const value = typeof rate === 'string' ? Number(rate) : rate;
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

/** Monto en bolívares (redondeado a céntimos) del precio en centavos de USD. */
export function bsAmount(fareCents: number, rate: number | string | null | undefined) {
  const value = rateValue(rate);
  if (value == null || !Number.isFinite(fareCents)) return null;
  return Math.round(fareCents * value) / 100;
}

export function bs(amount: number) {
  return 'Bs. ' + new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function pagoMovilReady(settings: PaymentSettings | null | undefined) {
  return !!settings && !!settings.pago_movil_bank && !!settings.pago_movil_phone && !!settings.pago_movil_id && rateValue(settings.exchange_rate) != null;
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : phone;
}

export function formatIdNumber(id: string) {
  const match = id.toUpperCase().match(/^([VEJGP])(\d+)$/);
  return match ? `${match[1]}-${Number(match[2]).toLocaleString('es-VE')}` : id;
}

export function cleanReference(reference: string) {
  const digits = reference.replace(/\D/g, '');
  return /^\d{4,20}$/.test(digits) ? digits : null;
}
