import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {TesoroClient} from '../src/lib/tesoro.ts';

// Servidor simulado con el mismo flujo que Tesoro Pagos: CSRF, cookies de sesión, redirecciones y aviso en la página.
function mockTesoro() {
  const sessions = new Map(); let nextId = 1; const confirmed = new Set(); const log = [];
  const payments = [{monto: '20,00', banco: '0102', telefono: '04141234567', referencia: '434225'}];
  const server = http.createServer((req, res) => {
    const cookie = /laravel_session=(\d+)/.exec(req.headers.cookie || '')?.[1];
    let session = cookie && sessions.get(cookie);
    if (!session) { const id = String(nextId++); session = {id, token: 'csrf' + id, auth: false, flash: null}; sessions.set(id, session); res.setHeader('Set-Cookie', [`laravel_session=${id}; path=/; httponly`, 'XSRF-TOKEN=x; path=/']); }
    let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
      const form = Object.fromEntries(new URLSearchParams(body)); log.push(`${req.method} ${req.url}`);
      const redirect = (to) => { res.writeHead(302, {Location: to}); res.end(); };
      if (req.method === 'POST' && form._token !== session.token) { res.writeHead(419); return res.end('Page Expired'); }
      if (req.url === '/login' && req.method === 'GET') return res.end(`<form action="/login"><input type="hidden" name="_token" value="${session.token}"><input name="security_code"><input name="box_number"><input type="password" name="password"></form>`);
      if (req.url === '/login') { if (form.security_code === '02250101' && form.box_number === '02' && form.password === 'secreta') { session.auth = true; return redirect('/dashboard'); } return redirect('/login'); }
      if (!session.auth) return redirect('/login');
      if (req.url === '/dashboard') return res.end(`<form action="/logout"><input type="hidden" name="_token" value="${session.token}"></form>`);
      if (req.url === '/logout') { session.auth = false; return redirect('/login'); }
      if (req.url === '/pago-movil' && req.method === 'POST') {
        const hit = payments.find((p) => p.monto === form.monto && p.banco === form.banco && p.telefono === form.telefono && p.referencia === form.referencia);
        session.flash = !hit ? 'Pago Movil No encontrado' : confirmed.has(hit.referencia) ? 'Este pago ya fue confirmado anteriormente.' : (confirmed.add(hit.referencia), 'Pago Móvil confirmado exitosamente');
        return redirect('/pago-movil');
      }
      if (req.url === '/pago-movil') { const flash = session.flash; session.flash = null; return res.end(`<form id="form-confirmacion-pago" action="/pago-movil" method="POST"><input type="hidden" name="_token" value="${session.token}"></form>${flash ? `<div class="fixed"><p class="text-gray-600 text-lg font-medium mb-10"> ${flash} </p></div>` : ''}`); }
      res.writeHead(404); res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({server, base: `http://127.0.0.1:${server.address().port}`, log})));
}

test('Tesoro Pagos: inicia sesión, valida pagos y detecta reutilización', async () => {
  const {server, base, log} = await mockTesoro();
  try {
    const client = new TesoroClient('02250101', '02', 'secreta', base);
    await client.login();
    assert.equal((await client.validate({amount: '20,00', bank: '0102', phone: '04141234567', reference: '111111'})).outcome, 'not_found');
    assert.equal((await client.validate({amount: '20,00', bank: '0102', phone: '04141234567', reference: '434225'})).outcome, 'verified');
    assert.equal((await client.validate({amount: '20,00', bank: '0102', phone: '04141234567', reference: '434225'})).outcome, 'already_confirmed');
    await client.logout();
    assert.ok(log.includes('POST /logout'));
    await assert.rejects(new TesoroClient('02250101', '02', 'mala', base).login(), /rechazó el inicio de sesión/);
  } finally { server.close(); }
});
