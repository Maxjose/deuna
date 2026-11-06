import {serverClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export const metadata={title:'Confirmación de correo · De1na',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const client=await serverClient();
 const {data:{user}}=await client.auth.getUser();
 const verified=!!user?.email_confirmed_at,invalid=params.error==='invalid_link'&&!verified;
 return <main className="email-confirmation-page"><section className="email-confirmation-card">
  <div className="email-confirmation-brand"><img src="/icons/icon-192.png" width="46" height="46" alt=""/><span>De<span>1</span>na</span></div>
  <span className={'email-confirmation-symbol'+(verified?' is-confirmed':'')} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={verified?'m5 12 4 4L19 6':'M3 5h18v14H3ZM3 5l9 8 9-8'}/></svg></span>
  <p className="eyebrow">TU CUENTA DE1NA</p>
  <h1>{verified?'Correo confirmado':invalid?'Revisa tu enlace':'Confirmación de correo'}</h1>
  <p>{verified?'Tu correo ya está verificado. Puedes cerrar esta página y volver a De1na para iniciar sesión.':invalid?'Este enlace no contiene una confirmación válida. Abre el correo más reciente que te enviamos y utiliza su enlace de confirmación.':'Vuelve a De1na e intenta iniciar sesión con tu correo y contraseña. Si todavía aparece «Correo no verificado», abre el enlace del correo de confirmación más reciente.'}</p>
  <div className="email-confirmation-note">Si necesitas otro enlace, revisa también la carpeta de spam y verifica que estés usando el correo con el que creaste tu cuenta.</div>
  <small>¿Vamos? ¡De una!</small>
 </section></main>;
}
