"use client";
import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native';
import { authReturnLinks } from '@/lib/auth-return';

export function AuthAppReturn({ code, next }: { code: string; next: string | null }) {
  const links = authReturnLinks(code, next);
  useEffect(() => {
    // Exchange inside the original WebView, where the PKCE verifier is stored.
    if (isNativeApp()) window.location.replace(links.callback);
  }, [links.callback]);
  return <main className="content"><section className="trip-card">
    <img src="/icons/icon-192.png" width="64" height="64" alt="De1na" />
    <h1>Continúa en De1na</h1>
    <p>Vuelve a la aplicación para completar la confirmación de tu correo o la recuperación de tu cuenta.</p>
    <p><a className="primary" href={links.app} referrerPolicy="no-referrer">Volver a la aplicación</a></p>
    <p><a href={links.callback} referrerPolicy="no-referrer">Continuar en el navegador</a></p>
    <p className="muted">Si abriste el correo en otro dispositivo, puedes volver a De1na e iniciar sesión con tu correo y contraseña.</p>
  </section></main>;
}
