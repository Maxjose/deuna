'use client';

import { useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { recoveryClient, recoveryTokens, sendRecoveryEmail } from '@/lib/supabase/recovery';

export function PasswordRecovery() {
  const client = useRef<ReturnType<typeof recoveryClient> | null>(null);
  const initialization = useRef<Promise<string> | null>(null);
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!initialization.current) initialization.current = (async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(window.location.search);
      window.history.replaceState(window.history.state, '', window.location.pathname);
      const recovery = recoveryClient();
      client.current = recovery;
      let tokens = recoveryTokens(hash);
      if (!hash && !params.has('error') && params.get('session') === '1') {
        // Compatibility with already-sent PKCE links opened in the original browser.
        const { data: { session } } = await browserClient().auth.getSession();
        if (session) tokens = { access_token: session.access_token, refresh_token: session.refresh_token };
      }
      if (params.has('error') || !tokens) throw new Error('invalid_link');
      const { error } = await recovery.auth.setSession(tokens);
      if (error) throw error;
      const { data: { user }, error: userError } = await recovery.auth.getUser();
      if (userError || !user?.email) throw new Error('invalid_link');
      return user.email;
    })();
    initialization.current.then(value => {
      if (active) { setEmail(value); setState('ready'); }
    }).catch(() => { if (active) setState('invalid'); });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setMessage('');
    if (state === 'ready' && form.get('password') !== form.get('confirmation')) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      if (state === 'ready') {
        if (!client.current) throw new Error('invalid_link');
        const { error } = await client.current.auth.updateUser({ password: String(form.get('password') || '') });
        if (error) throw error;
        setState('done');
      } else {
        const { error } = await sendRecoveryEmail(String(form.get('email') || ''), window.location.origin);
        if (error) throw error;
        setMessage('Si existe una cuenta con ese correo, recibirás un nuevo enlace. Revisa también la carpeta de spam.');
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'same_password') setMessage('Elige una contraseña diferente a la anterior.');
      else if (code === 'weak_password') setMessage('Utiliza una contraseña más segura, de al menos 8 caracteres.');
      else if (['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt'].includes(code || '')) {
        setState('invalid'); setMessage('El enlace ya no es válido. Solicita uno nuevo.');
      } else setMessage('No pudimos completar la solicitud. Revisa tu conexión e inténtalo de nuevo.');
    } finally { setBusy(false); }
  }

  return <main className="email-confirmation-page"><section className="email-confirmation-card">
    <div className="email-confirmation-brand"><img src="/icons/icon-192.png" width="46" height="46" alt="" /><span>De<span>1</span>na</span></div>
    <p className="eyebrow">RECUPERA TU ACCESO</p>
    <h1>{state === 'done' ? 'Contraseña actualizada' : state === 'invalid' ? 'Solicita un nuevo enlace' : 'Cambia tu contraseña'}</h1>
    {state === 'checking' ? <p role="status">Verificando tu enlace…</p> : state === 'done' ? <p role="status">Tu contraseña se guardó correctamente. Puedes cerrar esta página y volver a De1na para iniciar sesión con tu nueva contraseña.</p> : <>
      <p>{state === 'ready' ? `Elige una nueva contraseña para ${email}.` : 'Este enlace no es válido o ya venció. Escribe tu correo para recibir otro y cambiar tu contraseña desde este navegador.'}</p>
      <form className="password-recovery-form" onSubmit={submit}>
        {state === 'ready' ? <>
          <label>Nueva contraseña<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
          <label>Confirmar contraseña<input name="confirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
        </> : <label>Correo electrónico<input name="email" type="email" required maxLength={120} autoComplete="email" /></label>}
        <button className="primary" disabled={busy} aria-busy={busy}>{busy ? <><span className="auth-submit-spinner" aria-hidden="true" /><span className="sr-only">Procesando solicitud</span></> : state === 'ready' ? 'Guardar contraseña' : 'Enviar nuevo enlace'}</button>
      </form>
      {message && <p role="status">{message}</p>}
    </>}
    <small>¿Vamos? ¡De una!</small>
  </section></main>;
}
