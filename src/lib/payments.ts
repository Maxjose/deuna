export type PaymentMethod = 'cash' | 'pago_movil' | 'wallet' | 'binance';
export type PaymentSettings = {
  pago_movil_bank: string | null;
  pago_movil_phone: string | null;
  pago_movil_id: string | null;
  exchange_rate: number | string | null;
  exchange_rate_updated_at?: string | null;
  pago_movil_enabled?: boolean;
  binance_enabled?: boolean;
  binance_pay_id?: string | null;
  binance_pay_link?: string | null;
  wallet_topup_enabled?: boolean;
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
  return !!settings && settings.pago_movil_enabled !== false && !!settings.pago_movil_bank && !!settings.pago_movil_phone && !!settings.pago_movil_id && rateValue(settings.exchange_rate) != null;
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
  return digits.length>=6 ? digits.slice(-6) : null;
}

/** Bancos de Venezuela (código SUDEBAN) para indicar desde dónde se hizo el pago móvil. */
export const VE_BANKS: [string, string][] = [
  ['0102', 'Banco de Venezuela'], ['0104', 'Venezolano de Crédito'], ['0105', 'Mercantil'], ['0108', 'BBVA Provincial'],
  ['0114', 'Bancaribe'], ['0115', 'Banco Exterior'], ['0128', 'Banco Caroní'], ['0134', 'Banesco'], ['0137', 'Sofitasa'],
  ['0138', 'Banco Plaza'], ['0146', 'Bangente'], ['0151', 'BFC Banco Fondo Común'], ['0156', '100% Banco'], ['0157', 'DelSur'],
  ['0163', 'Banco del Tesoro'], ['0166', 'Banco Agrícola de Venezuela'], ['0168', 'Bancrecer'], ['0169', 'R4 Banco Microfinanciero'],
  ['0171', 'Banco Activo'], ['0172', 'Bancamiga'], ['0173', 'Banco Internacional de Desarrollo'], ['0174', 'Banplus'],
  ['0175', 'Banco Digital de los Trabajadores'], ['0177', 'Banfanb'], ['0178', 'N58 Banco Digital'], ['0191', 'Banco Nacional de Crédito'],
];
export const bankName = (code: string | null | undefined) => VE_BANKS.find(([c]) => c === code)?.[1] ?? code ?? '';

export type PaymentStatus = 'checking' | 'verified' | 'review' | 'rejected';
/** Estado visible del pago móvil (para todos se muestra "Pendiente" hasta verificarse). */
export function paymentStatusLabel(status: string | null | undefined, hasReference: boolean) {
  if (!hasReference) return { label: 'Esperando referencia', tone: 'waiting' as const };
  if (status === 'verified') return { label: 'Pago verificado', tone: 'ok' as const };
  if (status === 'rejected') return { label: 'Pago rechazado', tone: 'bad' as const };
  if (status === 'checking') return { label: 'Verificando pago…', tone: 'waiting' as const };
  return { label: 'Pago pendiente de revisión', tone: 'review' as const };
}

export function cleanPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return /^0\d{10}$/.test(digits) ? digits : null;
}

/** Monto en Bs escrito por el usuario ("1.234,56" o "1234.56"). */
export function parseBs(text: string) {
  const raw = text.trim().replace(/\s|Bs\.?/gi, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const value = Number(normalized);
  return /^\d+(\.\d{1,2})?$/.test(normalized) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** Binance Pay disponible: activado por la administración y con Pay ID configurado. */
export function binanceReady(settings: PaymentSettings | null | undefined) {
  return !!settings && settings.binance_enabled === true && !!settings.binance_pay_id;
}
