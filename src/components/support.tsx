"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {writeAppHash} from '@/lib/app-navigation';
import {supportRoute,supportHash,type SupportView} from '@/lib/support-navigation';
import {AppIcon} from './app-icon';
type Thread={id:string;subject:string;status:'waiting'|'active'|'resolved';assigned_to:string|null;user_id:string;updated_at:string;name?:string;role?:string;unread?:number};
type Message={seq:number;id:string;sender_id:string;staff:boolean;body:string;created_at:string};
type Profile={id:string;name:string;email:string;phone:string|null;role:string;approved:boolean;suspended:boolean;available:boolean;plan:{status:string;paid_until:string|null}|null;documents_ready:boolean|null;documents_exempt:boolean;active_trip:string|null};
const STATUS={waiting:'En espera',active:'En atención',resolved:'Resuelto'};
const PLANS:Record<string,string>={active:'Activo',expiring:'Por vencer',grace:'En gracia',expired:'Vencido',none:'Sin plan',not_applicable:'No requiere plan'};
const FAQ=[
 ['Viajes',[['¿Cómo solicito un viaje?','Selecciona la recogida y el destino, espera a que cargue el precio, elige el transporte y el método de pago disponible y confirma la solicitud.'],['¿Cómo contacto a mi conductor?','Cuando tengas un conductor asignado, abre tu viaje y utiliza Mensaje o Llamar.'],['¿Cómo cancelo una solicitud?','Abre tu viaje y pulsa Cancelar viaje. Según la etapa, se puede solicitar un motivo o la confirmación de la otra persona.']]],
 ['Pagos',[['¿A quién le pago el viaje?','Consulta el método indicado en el viaje. Si aparece pago directo al conductor, coordina el pago con él. Solo utiliza las opciones habilitadas por De1na.'],['¿Qué hago si un pago no aparece confirmado?','Revisa el monto, método y referencia. Si continúa pendiente, solicita soporte e indica el código del viaje y los datos de la operación, sin compartir claves ni códigos de seguridad.']]],
 ['Cuenta y aplicación',[['¿Cómo recupero mi contraseña?','En Iniciar sesión selecciona la recuperación de contraseña y revisa tu correo. También comprueba la carpeta de spam.'],['¿Por qué no recibo notificaciones?','Revisa internet y los permisos de notificación de De1na en el teléfono. Si forzaste la detención desde los ajustes, vuelve a abrir la app.'],['¿Dónde cambio mis datos?','En Cuenta → Tu información puedes actualizar los datos disponibles de tu perfil.']]],
] as const;
const DRIVER_FAQ=[['¿Por qué no puedo conectarme?','Verifica que tu cuenta esté aprobada, que tengas registrados los datos de tu moto y cobro y que tus documentos estén aprobados. Si tu cuenta utiliza un plan, revisa también su vigencia.'],['¿Cómo adjunto mis documentos?','En Cuenta → Documentos adjunta cada requisito. Administración debe aprobarlos. Si reemplazas un archivo aprobado, el nuevo vuelve a revisión.'],['¿Por qué me desconectó la app?','Puede ocurrir por inactividad o falta de señal de la app. Revisa la conexión y vuelve a conectarte cuando estés disponible. Las autorizaciones especiales dependen de administración.']] as const;
export function Support({userId,role}:{userId:string;role:string}){
 const admin=role==='admin',client=useMemo(()=>browserClient(),[]);
 const [view,setView]=useState<SupportView>('help');
 const root=useRef<HTMLElement>(null);
 const go=(next:SupportView,id='')=>{
  if(admin){setSelected(id);return;}
  writeAppHash(window,supportHash(next,id));setView(next);setSelected(next==='chat'?id:'');setRequesting(false);setError('');
 };
 useEffect(()=>{
  if(admin)return;
  const sync=()=>{const route=supportRoute(window.location.hash);setView(route.view);setSelected(route.id);setRequesting(false);};
  sync();window.addEventListener('popstate',sync);window.addEventListener('hashchange',sync);
  return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('hashchange',sync);};
 },[admin]);
 useEffect(()=>{
  if(admin)return;
  const frame=requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:'instant'});root.current?.closest('main')?.scrollTo({top:0,behavior:'instant'});root.current?.closest('.content')?.scrollTo({top:0,behavior:'instant'});});
  return()=>cancelAnimationFrame(frame);
 },[view,admin]);
 const [threads,setThreads]=useState<Thread[]>([]),[selected,setSelected]=useState(''),[thread,setThread]=useState<Thread|null>(null),[messages,setMessages]=useState<Message[]>([]),[profile,setProfile]=useState<Profile|null>(null);
 const [filter,setFilter]=useState('waiting'),[page,setPage]=useState(0),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[draft,setDraft]=useState(''),[subject,setSubject]=useState(''),[requesting,setRequesting]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[more,setMore]=useState(false);
 const listVersion=useRef(0),chatVersion=useRef(0),log=useRef<HTMLDivElement>(null),nearBottom=useRef(true),pending=useRef<{id:string;body:string;thread:string}|null>(null);
 const loadList=useCallback(async()=>{
  const version=++listVersion.current;
  const {data,error}=await client.rpc('support',{action:'list',payload:{status:filter,page,search}});
  if(version!==listVersion.current)return;
  if(error)setError('No pudimos actualizar las conversaciones.');else setThreads(data.items);
  setLoading(false);
 },[client,filter,page,search]);
 const loadChat=useCallback(async(before?:number)=>{
  if(!selected)return;
  const version=++chatVersion.current;
  const {data,error}=await client.rpc('support',{action:'fetch',payload:{id:selected,...(before?{before}:{})}});
  if(version!==chatVersion.current)return;
  if(error){setError('No pudimos actualizar la conversación.');return;}
  setThread(data.thread);setProfile(data.profile||null);
  setMessages(previous=>Array.from(new Map([...previous,...data.messages].map((m:Message)=>[m.id,m])).values()).sort((a,b)=>a.seq-b.seq));
  if(before||!messages.length)setMore(data.messages.length===100);
 },[client,selected,messages.length]);
 useEffect(()=>{setThread(null);setMessages([]);setProfile(null);setDraft('');setMore(false);pending.current=null;nearBottom.current=true;return()=>{chatVersion.current++;};},[selected]);
 useEffect(()=>{
  let active=true,running=false;
  const refresh=async()=>{if(!active||running||document.hidden)return;running=true;try{await Promise.all([loadList(),loadChat()]);}finally{running=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),4000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
  return()=>{active=false;listVersion.current++;chatVersion.current++;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);};
 },[loadList,loadChat]);
 const last=messages.at(-1)?.seq;
 useEffect(()=>{if(nearBottom.current&&log.current)log.current.scrollTop=log.current.scrollHeight;},[last]);
 async function act(action:string,payload:Record<string,unknown>={}){
  if(busy)return;setBusy(true);setError('');
  try{
   const {data,error}=await client.rpc('support',{action,payload:{id:selected,...payload}});
   if(error)throw error;
   if(action==='request'){go('chat',data.id);setSubject('');}
   if(action==='send'){pending.current=null;setDraft('');nearBottom.current=true;}
   await Promise.all([loadList(),action==='request'?Promise.resolve():loadChat()]);
  }catch(e){const message=(e as {message?:string}).message;setError(message==='Conversacion no disponible'?'Otro agente ya tomó la conversación. Actualiza la lista.':message==='Espera atencion'?'Espera a que soporte tome tu solicitud antes de escribir.':message==='Limite de solicitudes'?'Alcanzaste el límite de solicitudes de hoy. Revisa tus conversaciones.':'No pudimos completar la acción. Reintenta; tu mensaje no se duplicará.');}
  finally{setBusy(false);}
 }
 const canSend=thread?.status==='active'&&(!admin||thread.assigned_to===userId);
 return <section className="support-center" ref={root} data-support-view={admin?'admin':view}>
  {!admin&&view!=='help'&&<button type="button" className="text support-back" disabled={busy} onClick={()=>go(view==='chat'?'inbox':'help')}><AppIcon name="back"/>{view==='chat'?'Tus conversaciones':'Ayuda y soporte'}</button>}
  {!admin&&view==='help'&&<><p>Encuentra una respuesta o solicita atención de nuestro equipo.</p><div className="support-faq">{FAQ.map(([category,items])=><section key={category}><h3>{category}</h3>{items.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">⌄</span></summary><p>{a}</p></details>)}</section>)}{role==='driver'&&<section><h3>Conductores</h3>{DRIVER_FAQ.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">⌄</span></summary><p>{a}</p></details>)}</section>}</div><button type="button" className="primary" disabled={busy} onClick={()=>go('inbox')}>Hablar con soporte<AppIcon name="messages"/></button>
  </>}
  {error&&<p className="chat-error" role="alert">{error}<button className="text" onClick={()=>{void loadList();void loadChat();}}>Actualizar</button></p>}
  {admin&&<><div className="service-tabs" aria-label="Estado de soporte">{Object.entries(STATUS).map(([value,label])=><button type="button" className={filter===value?'is-active':''} aria-pressed={filter===value} key={value} onClick={()=>{setFilter(value);setPage(0);}}>{label}</button>)}</div><form className="admin-records-search" onSubmit={e=>{e.preventDefault();setSearch(query.trim());setPage(0);}}><label>Buscar por nombre, correo o motivo<input value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/></label><button className="secondary">Buscar</button></form></>}
  {(admin||view!=='help')&&<div className={'support-workspace'+(!admin?' support-user-workspace':'')}>{(admin||view==='inbox')&&<aside className="support-inbox" aria-label="Conversaciones"><h2>{admin?'Solicitudes':'Tus conversaciones'}</h2>{loading&&<p role="status">Cargando…</p>}{!loading&&!threads.length&&<p>No hay conversaciones en esta vista.</p>}{threads.map(t=><button type="button" key={t.id} className={'support-thread '+(selected===t.id?'is-selected':'')} disabled={busy} onClick={()=>go('chat',t.id)}><strong>{admin?t.name:STATUS[t.status]}</strong><span>{t.subject}</span><small>{STATUS[t.status]} · {new Date(t.updated_at).toLocaleString('es-VE')}{!!t.unread&&` · ${t.unread} sin leer`}</small></button>)}{!admin&&!threads.some(t=>t.status!=='resolved')&&!requesting&&<button type="button" className="primary support-new-request" disabled={busy} onClick={()=>setRequesting(true)}>Nueva solicitud</button>}
   {requesting&&<form className="support-request" onSubmit={e=>{e.preventDefault();void act('request',{subject});}}><label>Cuéntanos qué sucede<textarea required minLength={5} maxLength={2000} value={subject} disabled={busy} onChange={e=>setSubject(e.target.value)}/></label><button className="primary" disabled={busy||subject.trim().length<5}>{busy?'Enviando…':'Solicitar atención'}</button><button type="button" className="text" disabled={busy} onClick={()=>setRequesting(false)}>Cancelar</button></form>}
<div className="catalog-pages"><button type="button" className="secondary" disabled={!page||busy} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>{page+1}</span><button type="button" className="secondary" disabled={threads.length<20||busy} onClick={()=>setPage(n=>n+1)}>Siguiente</button></div></aside>}
  {(admin||view==='chat')&&<div className="support-conversation">{!selected?<p>Selecciona una conversación para ver sus detalles.</p>:!thread?<p role="status">Abriendo conversación…</p>:<>
   <header><h3>{STATUS[thread.status]}</h3><p>{thread.subject}</p><small>Solicitud #{thread.id.slice(0,8)}</small></header>
   {admin&&profile&&<details className="support-profile" open><summary>Perfil de {profile.name}</summary><dl><dt>Cuenta</dt><dd>{profile.role==='driver'?'Conductor':'Pasajero'} · {profile.email}</dd><dt>Teléfono</dt><dd>{profile.phone||'Sin registrar'}</dd><dt>Estado</dt><dd>{profile.suspended?'Suspendida':profile.role!=='driver'?'Activa':profile.approved?'Aprobada':'Sin aprobar'}{profile.available?' · Disponible':''}</dd>{profile.plan&&<><dt>Plan</dt><dd>{PLANS[profile.plan.status]||profile.plan.status}{profile.plan.paid_until?` · Hasta ${new Date(profile.plan.paid_until).toLocaleDateString('es-VE')}`:''}</dd><dt>Documentos</dt><dd>{profile.documents_exempt?'Exención activa':profile.documents_ready?'Aprobados':'Incompletos o pendientes'}</dd></>}{profile.active_trip&&<><dt>Viaje activo</dt><dd>{profile.active_trip}</dd></>}</dl></details>}
   {thread.status==='waiting'&&<div className="availability-notice"><p>{admin?'La conversación comenzará cuando un agente la tome.':'Tu solicitud está en espera. Podrás escribir cuando un agente de soporte la tome.'}</p><button className={admin?'primary':'secondary'} disabled={busy} onClick={()=>void act(admin?'claim':'cancel')}>{admin?'Tomar conversación':'Cancelar solicitud'}</button></div>}
   {admin&&thread.status==='active'&&<div className="document-actions">{thread.assigned_to===userId?<><button className="secondary" disabled={busy} onClick={()=>void act('resolve')}>Marcar como resuelto</button><button className="text" disabled={busy} onClick={()=>void act('release')}>Devolver a la espera</button></>:<p>Esta conversación está siendo atendida por otro agente.</p>}</div>}
   <div className="chat-messages support-messages" ref={log} role="log" aria-label="Mensajes de soporte" aria-live="polite" onScroll={e=>{const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>{more&&<button className="secondary" onClick={()=>void loadChat(messages[0]?.seq)}>Ver mensajes anteriores</button>}{messages.map(m=><article key={m.id} className={'chat-bubble '+(m.sender_id===userId?'mine':'')}><small>{m.staff?'Soporte':'Usuario'}</small><p>{m.body}</p><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('es-VE')}</time></article>)}</div>
   {canSend&&<form className="chat-compose" onSubmit={e=>{e.preventDefault();const body=draft.trim();if(!body)return;if(!pending.current||pending.current.body!==body||pending.current.thread!==selected)pending.current={id:crypto.randomUUID(),body,thread:selected};void act('send',{body,message_id:pending.current.id});}}><label className="sr-only" htmlFor="support-message">Mensaje a soporte</label><textarea id="support-message" value={draft} maxLength={2000} disabled={busy} onChange={e=>setDraft(e.target.value)} placeholder="Escribe un mensaje"/><button className="primary" disabled={busy||!draft.trim()}>{busy?'Enviando…':'Enviar'}</button></form>}
   {thread.status==='resolved'&&<p role="status">Conversación resuelta. Si necesitas más ayuda, puedes solicitar una nueva atención.</p>}
  </>}</div>}</div>}
 </section>;
}
