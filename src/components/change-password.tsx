"use client";
import {useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {Toast,useNotice} from './toast';

export function ChangePassword(){
 const [busy,setBusy]=useState(false);
 const {message,notify}=useNotice('change-password');
 return <form className="trip-card" onSubmit={async e=>{
  e.preventDefault();if(busy)return;
  const form=e.currentTarget,values=new FormData(form);
  const current=String(values.get('current')||''),password=String(values.get('password')||''),confirm=String(values.get('confirm')||'');
  if(password.length<8){notify('Usa al menos 8 caracteres.');return;}
  if(password!==confirm){notify('Las contraseñas nuevas no coinciden.');return;}
  if(password===current){notify('Elige una contraseña diferente a la actual.');return;}
  setBusy(true);
  try{
   const {error}=await browserClient().auth.updateUser({password,current_password:current});
   if(error){
    notify(error.code==='reauthentication_needed'?'Por seguridad, vuelve a iniciar sesión e intenta de nuevo.':error.code==='weak_password'?'Elige una contraseña más segura.':'No pudimos cambiar la contraseña. Revisa la contraseña actual e inténtalo de nuevo.');
    return;
   }
   form.reset();notify('Tu contraseña se actualizó.');
  }catch{notify('No pudimos cambiar la contraseña. Revisa tu conexión.');}
  finally{setBusy(false);}
 }}>
  <h2>Cambiar contraseña</h2>
  <label>Contraseña actual<input name="current" type="password" autoComplete="current-password" required disabled={busy}/></label>
  <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy}/></label>
  <label>Confirmar nueva contraseña<input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy}/></label>
  <p className="muted">Usa al menos 8 caracteres y una contraseña que no utilices en otros sitios.</p>
  <button className="primary" disabled={busy}>{busy?'Actualizando…':'Actualizar contraseña'}</button>
  <Toast message={message}/>
 </form>;
}
