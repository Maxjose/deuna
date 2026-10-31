/**
 * Cliente mínimo de Tesoro Pagos (Banco del Tesoro) para validar pagos móviles desde el servidor.
 * Usa el formulario "Confirmar pago" del sitio, igual que una persona: inicia sesión con sucursal, caja y
 * clave (variables de entorno TESORO_SUCURSAL, TESORO_CAJA, TESORO_CLAVE) y lee el mensaje del resultado.
 */
export const TESORO_BASE = 'https://tesoropagos.bt.com.ve';
export type ValidationOutcome = 'verified' | 'not_found' | 'already_confirmed' | 'error' | 'unknown';
export type ValidationResult = { outcome: ValidationOutcome; message: string };
export type PaymentQuery = { amount: string; bank: string; phone: string; reference: string };

const decode = (text: string) =>
  text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&([aeiou])acute;/gi, (_, v: string) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' } as Record<string, string>)[v] ?? v)
    .replace(/&ntilde;/g, 'ñ');

/** Token CSRF del formulario indicado (o el primero de la página). */
export function csrfToken(html: string, formId?: string) {
  let scope = html;
  if (formId) {
    const start = html.indexOf(`id="${formId}"`);
    if (start >= 0) scope = html.slice(start, start + 4000);
  }
  return scope.match(/name="_token"\s+value="([^"]+)"/)?.[1] ?? scope.match(/value="([^"]+)"\s+name="_token"/)?.[1] ?? null;
}

/** Mensaje del aviso que el sitio muestra tras "Validar pago". */
export function validationMessage(html: string) {
  const matches = [...html.matchAll(/<p class="text-gray-600 text-lg font-medium mb-10">\s*([\s\S]*?)\s*<\/p>/g)];
  const text = matches.map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).find(Boolean);
  return text ?? null;
}

export function classifyValidation(html: string): ValidationResult {
  if (/name="password"/.test(html) && /name="box_number"/.test(html)) return { outcome: 'error', message: 'Sesión de Tesoro Pagos cerrada' };
  const message = validationMessage(html);
  if (!message) return { outcome: 'unknown', message: 'Tesoro Pagos no mostró un resultado' };
  if (/no encontrad/i.test(message)) return { outcome: 'not_found', message };
  if (/ya fue confirmad/i.test(message)) return { outcome: 'already_confirmed', message };
  if (/(confirmad|verificad|exitos|aprobad|valid)/i.test(message) && !/no |error|inv[aá]lid|falla/i.test(message)) return { outcome: 'verified', message };
  if (/error|intente|falla|inv[aá]lid/i.test(message)) return { outcome: 'error', message };
  return { outcome: 'unknown', message };
}

/** Sesión con cookies, sin seguir redirecciones automáticamente (para conservar las cookies de cada paso). */
class Session {
  private cookies = new Map<string, string>();
  private readonly timeoutMs: number;
  private readonly base: string;
  constructor(base: string, timeoutMs = 15000) { this.base = base; this.timeoutMs = timeoutMs; }
  private store(response: Response) {
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }
  private header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async request(path: string, init: { method?: string; form?: Record<string, string> } = {}, hops = 0): Promise<{ status: number; url: string; html: string }> {
    const url = path.startsWith('http') ? path : this.base + path;
    if (!url.startsWith(this.base + '/')) throw new Error('Redirección inesperada');
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (De1na verificador de pagos)',
        Accept: 'text/html,application/xhtml+xml',
        ...(this.cookies.size ? { Cookie: this.header() } : {}),
        ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: this.base, Referer: url } : {}),
      },
      body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    });
    this.store(response);
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (hops > 5) throw new Error('Demasiadas redirecciones');
      return this.request(new URL(location, url).toString(), {}, hops + 1);
    }
    return { status: response.status, url, html: await response.text() };
  }
}

export class TesoroClient {
  private session: Session;
  private formToken: string | null = null;

  static fromEnv() {
    const sucursal = process.env.TESORO_SUCURSAL, caja = process.env.TESORO_CAJA, clave = process.env.TESORO_CLAVE;
    if (!sucursal || !caja || !clave) return null;
    // TESORO_BASE_URL solo se usa en desarrollo/pruebas (servidor simulado); en producción siempre es el banco.
    const base = process.env.NODE_ENV !== 'production' && process.env.TESORO_BASE_URL ? process.env.TESORO_BASE_URL : TESORO_BASE;
    return new TesoroClient(sucursal, caja, clave, base);
  }
  private readonly sucursal: string;
  private readonly caja: string;
  private readonly clave: string;
  constructor(sucursal: string, caja: string, clave: string, base = TESORO_BASE) {
    this.sucursal = sucursal; this.caja = caja; this.clave = clave; this.session = new Session(base);
  }

  async login() {
    const page = await this.session.request('/login');
    const token = csrfToken(page.html);
    if (!token) throw new Error('No se pudo abrir el inicio de sesión de Tesoro Pagos');
    const result = await this.session.request('/login', { method: 'POST', form: { _token: token, security_code: this.sucursal, box_number: this.caja, password: this.clave } });
    if (/\/login(\?|$)/.test(new URL(result.url).pathname + new URL(result.url).search) || /name="box_number"/.test(result.html)) {
      throw new Error('Tesoro Pagos rechazó el inicio de sesión (revisa sucursal, caja y clave)');
    }
    await this.loadForm();
  }

  private async loadForm() {
    const page = await this.session.request('/pago-movil');
    this.formToken = csrfToken(page.html, 'form-confirmacion-pago') ?? csrfToken(page.html);
    if (!this.formToken) throw new Error('No se encontró el formulario de confirmación de pago');
  }

  async validate(query: PaymentQuery): Promise<ValidationResult> {
    if (!this.formToken) await this.loadForm();
    const form = { _token: this.formToken!, monto: query.amount, banco: query.bank, telefono: query.phone, referencia: query.reference };
    const result = await this.session.request('/pago-movil', { method: 'POST', form });
    this.formToken = csrfToken(result.html, 'form-confirmacion-pago') ?? this.formToken;
    return classifyValidation(result.html);
  }

  async logout() {
    try {
      const page = await this.session.request('/dashboard');
      const token = csrfToken(page.html);
      if (token) await this.session.request('/logout', { method: 'POST', form: { _token: token } });
    } catch { /* cerrar sesión es opcional */ }
  }
}
