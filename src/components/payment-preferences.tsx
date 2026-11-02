"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {VE_BANKS,cleanPhone,formatPhone} from '@/lib/payments';
import {loadPaymentPreferences} from '@/lib/payment-preferences';
import {Toast,useNotice} from './toast';

export function PaymentPreferences(){
 const client=useMemo(()=>browserClient(),[]);
 const [bank,setBank]=useState(''),[phone,setPhone]=useState(''),[userId,setUserId]=useState(''),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[saving,setSaving]=useState(false);
 const {message,notify}=useNotice('payment-preferences');
 const load=useCallback(async()=>{
  setLoading(true);setFailed(false);
  try{const saved=await loadPaymentPreferences(client);setUserId(saved.userId);setBank(saved.bank);setPhone(formatPhone(saved.phone));}
  catch{setFailed(true);}finally{setLoading(false);}
 },[client]);
 useEffect(()=>{void load();},[load]);
 return <form className="trip-card" onSubmit={async e=>{
  e.preventDefault();if(saving||!userId)return;
  const clean=cleanPhone(phone);
  if(!clean||!VE_BANKS.some(([code])=>code===bank)){notify('Revisa el banco y el teléfono de pago móvil.');return;}
  setSaving(true);
  try{const {error}=await client.from('passenger_payment_preferences').upsert({user_id:userId,bank,phone:clean});if(error)throw error;notify('Tus datos de pago móvil se guardaron.');}
  catch{notify('No pudimos guardar tus datos de pago móvil.');}finally{setSaving(false);}
 }}>
  <h2>Mis datos de pago móvil</h2>
  <p className="muted">Guarda el banco y el teléfono desde los que sueles pagar. Se completarán en tus próximos viajes, incluso en otro dispositivo.</p>
  {loading?<p role="status">Cargando tus datos…</p>:failed?<button type="button" className="secondary" onClick={()=>void load()}>Reintentar</button>:<>
   <label>Mi banco<select value={bank} required disabled={saving} onChange={e=>setBank(e.target.value)}><option value="">Elige tu banco</option>{VE_BANKS.map(([code,name])=><option key={code} value={code}>{name} ({code})</option>)}</select></label>
   <label>Mi teléfono de pago móvil<input type="tel" autoComplete="tel" inputMode="tel" required maxLength={14} placeholder="0412-1234567" value={phone} disabled={saving} onChange={e=>setPhone(e.target.value)}/></label>
   <p className="muted">Proponemos el teléfono de tu perfil si todavía no tienes uno guardado aquí. Puedes usar otro. Al pagar podrás cambiar estos datos sin modificar tus preferencias.</p>
   <button className="primary" disabled={saving}>{saving?'Guardando…':'Guardar datos de pago móvil'}</button>
  </>}
  <Toast message={message}/>
 </form>;
}
