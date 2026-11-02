"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { browserClient } from "@/lib/supabase/client";
import {loadReputation,loadTripContact,type TripContact} from "@/lib/participant-data";
import {clearParticipantCache,participantKey,readParticipant,subscribeParticipant} from "@/lib/participant-cache";
import {TripProgress} from "./trip-progress";
import { AppIcon } from "./app-icon";
import { NavIndicator } from "./nav-indicator";
import { TripChat } from "./trip-chat";
import { TripSound } from "./trip-sound";
import { TripCancellation,TripCompletion,DriverReputation,TripPerson,TripContactButton } from './trip-resolution';
import { DriverNavigation } from "./driver-navigation";
import { PassengerPayment, PaymentSettingsForm, TripPaymentNote } from "./trip-payment";
import { AdminPayments } from "./admin-payments";
import type { PaymentSettings } from "@/lib/payments";
import { DriverSharingStatus, PassengerLiveMap, useDriverLocationSharing } from "./live-location";
import { AdminRecords } from "./admin-records";
import { NotificationInbox } from "./notification-inbox";
import { FavoritePlaces, useFavoritePlaces } from "./favorite-places";
import { AdminThemeToggle, useAdminTheme } from "./admin-theme-toggle";
import { InstallApp } from "./install-app";
import { PasskeySecurity } from "./passkey-security";
import { ChangePassword } from "./change-password";
import { DriverPayout } from "./driver-payout";
import { SettleWithWallet, WalletSettings, WalletView, useWallet } from "./wallet";
import { RideWaiting } from "./ride-waiting";
import { RideRequest } from "./ride-request";
import { PushPreferences } from "./push-preferences";
import { PaymentPreferences } from './payment-preferences';
import { PushCampaigns } from "./push-campaigns";
import { PlacesCatalog } from "./places-catalog";
import { disconnectPushDevice } from "@/lib/push-device";
import { Toast, useNotice } from "./toast";
import { closeOnBackdrop } from "@/lib/dialog";
import { parseStoredPlace } from "@/lib/journey";
import { FareSettings } from "./fare-settings";
import { DriverAvailability, AvailabilitySettings } from "./driver-availability";
import { usd, type FareSettings as FareConfig } from "@/lib/fare";
import { useRouter } from "next/navigation";
import { writeAppHash } from "@/lib/app-navigation";

type Profile = {
  id: string;
  role: "passenger" | "driver" | "admin";
  approved: boolean;
  available: boolean;
  suspended: boolean;
};
type Trip = {
  id: string;
  created_at?: string;
  origin: string;
  destination: string;
  zone: string | null;
  fare_cents: number | null;
  distance_meters: number | null;
  status: string;
  passenger_id: string;
  driver_id: string | null;
  passenger_name?: string;
  driver_name?: string;
  cancel_requested?: boolean;
  payment_method?: string | null;
  exchange_rate?: number | string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  payment_note?: string | null;
};
type Settings = FareConfig & PaymentSettings & {
  id: number;
  enabled: boolean;
  open_time: string;
  close_time: string;
};
const passengerHeadlines: Record<string, string> = {
  searching: "Estamos buscando quién te lleve",
  assigned: "¡Listo! Ya van por ti",
  arrived: "¡Tu DeUna llegó!",
  ongoing: "¡Vamos en camino!",
};
const labels: Record<string, string> = {
  searching: "Buscando conductor",
  assigned: "Conductor en camino",
  arrived: "Conductor en la recogida",
  ongoing: "Viaje en curso",
  finished: "Viaje finalizado",
  cancelled: "Cancelado",
};
export function Dashboard({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  const router = useRouter();
  const savedPlaces=useFavoritePlaces(userId);
  const [setupHome,setSetupHome]=useState(false);
  const [accountSection,setAccountSection]=useState("overview");
  const [moreOpen,setMoreOpen]=useState(false);
  const [historyFilter,setHistoryFilter]=useState<"all"|"finished"|"cancelled">("all");
  const [historyPage,setHistoryPage]=useState(0);
  const [historyDate,setHistoryDate]=useState("");
  const [settingsSection,setSettingsSection]=useState<"hours"|"fares"|"payment"|"drivers">("hours");
  const [balance,setBalance]=useState<Balance>({amount_cents:0,trips:[]});
  const [walletRole,setWalletRole]=useState(false);
  const {wallet,reload:reloadWallet}=useWallet(walletRole);
  const [detailTrip,setDetailTrip]=useState<string|null>(null);
  const detailDialog=useRef<HTMLDialogElement>(null),dateDialog=useRef<HTMLDialogElement>(null);
  const moreDialog=useRef<HTMLDialogElement>(null);
  const dragStart=useRef<number|null>(null);
  useEffect(()=>{if(moreOpen)moreDialog.current?.showModal();else moreDialog.current?.close();},[moreOpen]);
  const openSection=(section:string)=>{
    setPage('account');setAccountSection(section);setMoreOpen(false);
    writeAppHash(window,section==="overview"?"account":`account/${section}`);
  };
  const {theme:adminTheme,toggleTheme}=useAdminTheme(userId);
  const client = useMemo(() => browserClient(), []),
    [profile, setProfile] = useState<Profile | null>(null),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [trips, setTrips] = useState<Trip[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [page, setPage] = useState("home"),
    [displayName, setDisplayName] = useState(""),
    [draftName, setDraftName] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [cancelId, setCancelId] = useState<string | null>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const acceptDialog = useRef<HTMLDialogElement>(null);
  const [acceptTrip,setAcceptTrip]=useState<Trip|null>(null);
  useEffect(()=>{if(acceptTrip)acceptDialog.current?.showModal();},[acceptTrip]);
  const signOutDialog = useRef<HTMLDialogElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [emailVerified,setEmailVerified]=useState(false);
  const [serviceOpen,setServiceOpen]=useState(false);
  const { message, notify: setMessage } = useNotice(page === "account" ? `account-${accountSection}` : page);
  const noticeRef=useRef(setMessage);
  noticeRef.current=setMessage;
  const load = useCallback(async () => {
    const notifyFailure=noticeRef.current;
    const [p, t, s, service] = await Promise.all([
      client.from("profiles").select("id,role,approved,available,suspended"),
      client
        .from("trips")
        .select("id,created_at,origin,destination,zone,status,passenger_id,driver_id,fare_cents,distance_meters,cancel_requested,payment_method,exchange_rate,payment_reference,payment_status,payment_note")
        .order("created_at", { ascending: false })
        .limit(100),
      client.from("service_settings").select("*").eq("id", 1).single(),
      client.rpc('service_status'),
    ]);
    if (p.error || t.error || s.error || service.error) {
      notifyFailure(
        "No se pudo cargar la operación. Comprueba la conexión y la configuración del servicio.",
      );
      return;
    }
    const own=p.data.find(person=>person.id===userId);
    const occupied=t.data.some(trip=>trip.driver_id===userId&&['assigned','arrived','ongoing'].includes(trip.status));
    const contacts=own?.suspended?[]:t.data.filter(trip=>own?.role!=='admin'&&(trip.passenger_id===userId&&trip.driver_id||trip.driver_id===userId||own?.role==='driver'&&own.approved&&own.available&&!occupied&&trip.status==='searching'));
    await Promise.allSettled([loadReputation(client,userId,userId),...contacts.map(trip=>loadTripContact(client,userId,trip.id))]);
    setProfiles(p.data);
    setProfile(p.data.find((p) => p.id === userId) || null);
    setTrips(t.data);
    setSettings(s.data);
    setServiceOpen(service.data?.open===true);
    setWalletRole(own?.role==='passenger');
    const debt=await client.rpc('my_balance');
    if(!debt.error&&debt.data)setBalance(debt.data as Balance);
  }, [client, userId]);
  useEffect(()=>{void reloadWallet();},[trips,reloadWallet]);
  useEffect(() => {
    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (!active) return;
      const meta = data.user?.user_metadata;
      setEmailVerified(!!data.user?.email_confirmed_at);
      const name = typeof meta?.display_name === "string" ? meta.display_name : "";
      setDisplayName(name);
      setDraftName(name);
      setPhone(typeof meta?.contact_phone === "string" ? meta.contact_phone : "");
    });
    return () => { active = false; };
  }, [client]);
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const name = draftName.trim().replace(/\s+/g, " ");
    if (!name || name.length > 80 || phone.trim().length > 30) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.updateUser({ data: { display_name: name, contact_phone: phone.trim() } });
      if (error) throw error;
      setDisplayName(name);
      setDraftName(name);
      setMessage("Tus datos se guardaron.");
    } catch {
      setMessage("No pudimos guardar tus datos. Inténtalo de nuevo.");
    } finally { setBusy(false); }
  }
  useEffect(() => {
    void load();
    const channel = client
      .channel("operation")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_settings" },
        () => void load(),
      )
      .subscribe();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      void client.removeChannel(channel);
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [client, load]);
  async function act(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.rpc("operate", { action, payload });
      if (error) throw error;
      await load();
      setMessage("Cambio guardado.");
      return true;
    } catch (error) {
      if (action === 'request') {
        const failure = error as { message?: string; code?: string };
        const messages: Record<string, string> = {
          'Servicio cerrado': 'El servicio no está disponible en este momento. Fuera del horario habitual necesitamos un conductor disponible.',
          'Solo pasajeros': 'Para solicitar un viaje debes entrar con una cuenta de pasajero.',
          'Cotizacion vencida': 'El precio venció. Actualiza la cotización antes de solicitar.',
          'Cotizacion invalida': 'No pudimos validar el precio. Actualiza la cotización.',
          'Cotizacion requerida': 'Vuelve a calcular la ruta y su precio antes de solicitar.',
          'Saldo pendiente': 'Tienes un saldo pendiente. Envía la referencia del pago para volver a solicitar viajes.',
        };
        await load();
        throw new Error(messages[failure.message || ''] || (failure.code === '23505' ? 'Ya tienes una solicitud activa o esta cotización ya fue utilizada. Revisa tus viajes.' : 'No se pudo solicitar el viaje. Comprueba tu conexión y vuelve a intentar.'));
      }
      setMessage((error as {message?:string}).message==='Falta referencia de pago'?'El pasajero aún no envía la referencia del pago móvil.':
        "No se pudo completar la acción. El viaje puede haber cambiado; revisa disponibilidad, permisos y horario.",
      );
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const role = profile?.role || "passenger",
    mine = trips.find(
      (t) =>
        t.passenger_id === userId &&
        !["finished", "cancelled"].includes(t.status),
    );
  useEffect(() => {
    const syncPage = () => {
      const [value, section = "overview"] = window.location.hash.slice(1).split("/");
      const allowed =
        profile?.role === "admin"
          ? ["home", "history", "payments", "settings", "places", "drivers", "users", "notifications", "account"]
          : ["home", "history", "messages", "account"];
      setPage(allowed.includes(value) ? value : "home");
      setAccountSection(value === "account" && ["info","security","wallet","balance","favorites","payout","payment-data","preferences"].includes(section) ? section : "overview");
      setMoreOpen(false);
    };
    syncPage();
    window.addEventListener("hashchange", syncPage);
    window.addEventListener("popstate", syncPage);
    return () => {window.removeEventListener("hashchange", syncPage);window.removeEventListener("popstate", syncPage);};
  }, [profile?.role]);
  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) void load();
    };
    setOffline(!navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [load]);
  useEffect(() => {
    if (cancelId) cancelDialog.current?.showModal();
  }, [cancelId]);
  const navigate = (value: string) => {
    writeAppHash(window,value);
    setPage(value);
    setAccountSection("overview");
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const tabs: [string, string, string][] =
    role === "admin"
      ? [
          ["home", "Inicio", "Operación"],
          ["history", "Viajes", "Operación"],
          ["payments", "Pagos", "Operación"],
          ["drivers", "Equipo", "Personas"],
          ["users", "Usuarios", "Personas"],
          ["settings", "Servicio", "Configuración"],
          ["places", "Lugares", "Configuración"],
          ["notifications", "Avisos", "Configuración"],
          ["account", "Cuenta", "Tu cuenta"],
        ]
      : [
          ["home", role === "driver" ? "Solicitudes" : "Inicio", ""],
          ["history", "Viajes", ""],
          ["messages", "Mensajes", ""],
          ["account", "Cuenta", ""],
        ];
  const moreDescriptions: Record<string, string> = {
    drivers: "Conductores y aprobaciones",
    users: "Pasajeros registrados",
    settings: "Horario, tarifas y solicitudes",
    places: "Catálogo de destinos",
    notifications: "Notificaciones y campañas",
    account: displayName || email,
  };
  const moreTabs = role === "admin" ? tabs.slice(3) : [];
  const inMore = moreTabs.some(([p]) => p === page);
  const driverActive=role==='driver'?trips.find(t=>t.driver_id===userId&&['assigned','arrived','ongoing'].includes(t.status)):undefined;
  const sharing = useDriverLocationSharing(driverActive && profile?.approved && !profile.suspended ? driverActive.id : null);
  const currentTrip = role === "passenger" ? mine : driverActive;
  const driverDisconnected = role === "driver" && page === "home" && !profile?.available && !driverActive;
  const chatActive = !!currentTrip?.driver_id && ["assigned", "arrived", "ongoing"].includes(currentTrip.status);
  const serviceLabel = !settings ? "Cargando servicio" : !settings.enabled ? "Servicio pausado" : serviceOpen ? "Servicio abierto" : "Fuera de horario";
  const pageTitle =
    page === "account"
      ? ({overview:"Tu espacio",info:"Tu información",security:"Seguridad",favorites:"Lugares favoritos",payout:"Mis cuentas",balance:"Saldo pendiente",wallet:"Mi saldo","payment-data":"Mis datos de pago móvil",preferences:"Configuración"}[accountSection] || "Tu espacio")
      : ({history:"Viajes",payments:"Pagos",drivers:"Equipo",users:"Usuarios",settings:"Servicio",places:"Lugares",notifications:"Avisos",messages:"Mensajes"} as Record<string,string>)[page] ||
        (role === "driver" ? "Solicitudes" : "Inicio");
  const ownTrips = trips.filter((t) => t.passenger_id === userId || t.driver_id === userId).length;
  const pageContext =
    page === "account"
      ? "Tu cuenta"
      : page === "history"
        ? role === "admin" ? `${trips.length} viajes recientes` : `${ownTrips} ${ownTrips === 1 ? "viaje" : "viajes"}`
        : page === "payments"
          ? "Pago móvil · verificación con el banco"
        : ["drivers", "users"].includes(page)
          ? "Personas"
          : ["settings", "places", "notifications"].includes(page)
            ? "Configuración"
            : role === "admin"
              ? `Operaciones · ${serviceLabel}`
              : role === "driver"
                ? profile?.available ? "Conectado · Recibiendo solicitudes" : "Desconectado"
                : serviceLabel;
  const visibleTrips = trips.filter((t) =>
    page === "history"
      ? (role === "admin" || t.passenger_id === userId || t.driver_id === userId) && (historyFilter === "all" || t.status === historyFilter) && (!historyDate || localDay(t.created_at) === historyDate)
      : driverActive ? t.id===driverActive.id : role === "admin" ||
        (t.driver_id === userId &&
          !["finished", "cancelled"].includes(t.status)) ||
        (profile?.approved && profile.available && t.status === "searching"),
  );
  const historyPages=Math.max(1,Math.ceil(visibleTrips.length/5));
  const currentHistoryPage=Math.min(historyPage,historyPages-1);
  const pagedTrips=page==='history'?visibleTrips.slice(currentHistoryPage*5,currentHistoryPage*5+5):visibleTrips;
  function openSignOut() {
    signOutDialog.current?.showModal();
    signOutDialog.current?.focus();
  }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
    try { await disconnectPushDevice(); }
    catch { setMessage("No pudimos desconectar las notificaciones del dispositivo. Inténtalo de nuevo."); return; }
    const { error } = await client.auth.signOut();
    if (error) setMessage("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    else {
      clearParticipantCache(userId);
      router.replace("/login");
      router.refresh();
    }
    } catch { setMessage("No se pudo cerrar la sesión. Inténtalo de nuevo."); }
    finally { setSigningOut(false); signOutDialog.current?.close(); }
  }
  function pendingBalance() {
    const debtTrips = trips.filter(t => balance.trips.includes(t.id));
    if (balance.amount_cents <= 0) return <article className="trip-card pending-balance is-clear"><h2>Estás al día</h2><p className="muted">No tienes pagos pendientes.</p></article>;
    return <article className="trip-card pending-balance">
      <span className="pending-balance-eyebrow">SALDO PENDIENTE</span>
      <strong className="pending-balance-amount">{usd(balance.amount_cents)}</strong>
      <p>No pudimos verificar {balance.trips.length === 1 ? "el pago de un viaje" : `los pagos de ${balance.trips.length} viajes`}. Envía la referencia correcta del pago móvil para volver a solicitar viajes.</p>
      {debtTrips.map(t => <div key={t.id} className="pending-balance-trip">
        <small>{t.created_at ? new Date(t.created_at).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" }) : ""} · {parseStoredPlace(t.destination).label.split(",")[0]}</small>
        {t.fare_cents != null && <SettleWithWallet tripId={t.id} fareCents={t.fare_cents} balanceCents={wallet?.balance_cents ?? 0} onDone={() => { setMessage("Pagaste con tu saldo. ¡Estás al día!"); void load(); void reloadWallet(); }} />}
        <PassengerPayment trip={t} settings={settings} offline={offline} />
      </div>)}
      <p className="muted">Si ya pagaste y el monto sigue apareciendo, la verificación puede tardar unos minutos. Si persiste, escríbenos.</p>
    </article>;
  }
  function card(t: Trip, detail = false) {
    const compact = page === "history" && !detail;
    const destinationName = parseStoredPlace(t.destination).label;
    if (role === "passenger" && page === "home" && ["searching","assigned","arrived","ongoing"].includes(t.status))
      return (
        <RideWaiting
          payment={<PassengerPayment trip={t} settings={settings} offline={offline} />}
          tripId={t.id} status={t.status} viewerId={userId} onMessage={()=>navigate('messages')} cancelPending={!!t.cancel_requested} onCancellation={(action,approved)=>act(action,{id:t.id,approved})}
            fareCents={t.fare_cents}
          origin={t.origin}
          destination={t.destination}
          busy={busy || offline}
          onCancel={() => setCancelId(t.id)}
        />
      );
    return (
      <article className="trip-card" key={t.id}>
        {page === "home" && role !== "admin" && ["assigned", "arrived", "ongoing"].includes(t.status) && (
          <TripProgress status={t.status} headline={role === "passenger" ? passengerHeadlines[t.status] : undefined} />
        )}
        {page === "home" && role === "passenger" && t.passenger_id === userId && t.driver_id && ["assigned", "arrived", "ongoing"].includes(t.status) && (
          <PassengerLiveMap tripId={t.id} status={t.status} origin={t.origin} destination={t.destination} />
        )}
        {page === "home" && role === "driver" && t.driver_id === userId && ["assigned", "arrived", "ongoing"].includes(t.status) && (
          <DriverSharingStatus state={sharing.state} background={sharing.background} />
        )}
        <div className="row">
          <span className={"pill " + (t.status === "cancelled" ? "cancelled" : "green")}>{labels[t.status]}</span>
          <small>#{t.id.slice(0, 6)}</small>
        </div>
        {compact ? (
          <div className="trip-summary-destination">
            <small>DESTINO</small>
            <strong title={destinationName}>{destinationName.split(",")[0]}</strong>
          </div>
        ) : <div className="route">
          <div>
            <i>●</i>
            <span>
              <small>RECOGIDA</small>
              {parseStoredPlace(t.origin).label}
            </span>
          </div>
          <div>
            <i>↗</i>
            <span>
              <small>DESTINO</small>
              {parseStoredPlace(t.destination).label}
            </span>
          </div>
        </div>}
        {!compact && t.zone && <p className="muted">{t.zone}</p>}
        {t.fare_cents != null && <p>{t.status === "cancelled" ? <del className="cancelled-fare" aria-label={`Precio cancelado: ${usd(t.fare_cents)}`}>{usd(t.fare_cents)}</del> : <strong>{usd(t.fare_cents)}</strong>}{!compact && <> · {((t.distance_meters || 0) / 1000).toFixed(2)} km</>}</p>}
        {role === "passenger" && t.passenger_id === userId && (page === "home" || (page === "history" && t.status === "finished" && t.payment_method === "pago_movil" && !t.payment_reference)) && (
          <PassengerPayment trip={t} settings={settings} offline={offline} />
        )}
        {(role === "driver" && (page === "home" || t.driver_id === userId)) && <TripPaymentNote trip={t} viewer="driver" />}
        {role === "admin" && <TripPaymentNote trip={t} viewer="admin" />}
        {t.passenger_name && <p className="trip-person"><small>Solicitado por</small><strong>{t.passenger_name}</strong></p>}
        {role==='driver'&&<TripPerson viewerId={userId} tripId={t.id} label="Pasajero"/>}
        {role==='passenger'&&t.driver_id&&<TripPerson viewerId={userId} tripId={t.id} label="Conductor"/>}
        {role==='passenger'&&t.passenger_id===userId&&['assigned','arrived','ongoing'].includes(t.status)&&<div className="trip-contact-row"><button className="primary trip-chat-button" onClick={()=>navigate('messages')}><AppIcon name="messages"/>Mensaje a mi conductor</button><TripContactButton tripId={t.id} viewerId={userId}/></div>}
        {t.driver_id && role==='admin' && <p className="trip-person"><small>Conductor</small><strong>{t.driver_name || `#${t.driver_id.slice(0, 8)}`}</strong></p>}
        {role === "driver" && t.status === "searching" && (
          <button
            className="primary"
            disabled={
              busy || offline || !profile?.available || !profile?.approved
            }
            onClick={() => setAcceptTrip(t)}
          >
            Aceptar viaje ↗
          </button>
        )}
        {role === "driver" &&
          page === "home" &&
          t.driver_id === userId &&
          ["assigned", "arrived", "ongoing"].includes(t.status) && (
            <DriverNavigation advanceBlocked={t.status==='arrived'&&t.payment_method==='pago_movil'&&!t.payment_reference?'Esperando que el pasajero envíe la referencia del pago móvil para iniciar el viaje.':undefined} contact={<TripContactButton tripId={t.id} viewerId={userId}/>} origin={t.origin} destination={t.destination} status={t.status} busy={busy||offline} onOpenChat={()=>navigate('messages')} onAdvance={()=>void act('advance',{id:t.id})}><DriverSharingStatus state={sharing.state} background={sharing.background} /><TripCancellation pending={!!t.cancel_requested} passenger={false} busy={busy||offline} onAction={(action,approved)=>act(action,{id:t.id,approved})}/></DriverNavigation>
          )}
        {role === "passenger" &&
          t.cancel_requested && <TripCancellation pending passenger busy={busy||offline} onAction={(action,approved)=>act(action,{id:t.id,approved})}/>}
        {role === "passenger" &&
          t.passenger_id === userId &&
          ["searching", "assigned", "arrived"].includes(t.status) && (
            <button
              className="text danger trip-cancel-link"
              disabled={busy || offline}
              onClick={() => {
                setCancelId(t.id);
              }}
            >
              Cancelar viaje
            </button>
          )}
      </article>
    );
  }
  return (
    <div
      data-admin-theme={role === "admin" ? adminTheme : undefined}
      className={
        "shell " + (page === "history" ? "history-screen " : "") + (role === "driver" && page === "history" ? "driver-history " : "") + (page === "messages" ? "messages-screen " : "") + (role === "admin" ? "admin-shell " : "") +
        (page === "home" && role === "passenger" ? "ride-screen " : "") + (page === "home" && role === "driver" ? "driver-home " : "") + (currentTrip && page !== "home" ? "has-trip-card" : "")
      }
    >
      <TripSound userId={userId} trips={trips} />
      <aside className="sidebar">
        <a className="brand" href="/dashboard">
          <img
            className="brand-icon"
            src="/icons/icon-192.png"
            width="40"
            height="40"
            alt=""
          />
          De<span>1</span>na
        </a>
        <span className="workspace">
          {role === "admin"
            ? "TU CENTRO DE OPERACIÓN"
            : role === "driver"
              ? "TU DÍA EN MOVIMIENTO"
              : "MOVERTE SIN COMPLICARTE"}
        </span>
        <nav aria-label="Navegación principal">
          <NavIndicator page={page}/>
          {tabs.map(([p, label, group], index) => (
            <Fragment key={p}>
              {group && group !== tabs[index - 1]?.[2] && <span className="nav-group">{group}</span>}
              <button
                className={
                  "nav-item " +
                  (page === p ? "selected " : "") +
                  (moreTabs.some(([extra]) => extra === p) ? "nav-extra " : "")
                }
                aria-current={page === p ? "page" : undefined}
                onClick={() => navigate(p)}
              >
                <AppIcon name={p} />
                <span>{label}</span>
                {p === "messages" && chatActive && <i className="nav-dot" aria-label="Conversación activa" />}
              </button>
            </Fragment>
          ))}
          {role === "admin" && (
            <button
              className={"nav-item nav-more " + (inMore ? "selected" : "")}
              aria-haspopup="dialog"
              aria-current={inMore ? "page" : undefined}
              onClick={() => setMoreOpen(true)}
            >
              <AppIcon name="more" />
              <span>Más</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" />
          Mara, Zulia
        </div>
      </aside>
      <main>
        <header className="app-header">
          {role === "admin" && <div className="admin-desktop-header">
            <div className="admin-header-title"><span>DE1NA / OPERACIONES</span><strong>Panel de administración</strong></div>
            <div className="admin-header-actions">
              <span className={"admin-service-status " + (serviceOpen ? "is-open" : "")}><i />{serviceLabel}</span>
              <button className="admin-user-button" onClick={()=>navigate('account')} aria-label="Abrir mi cuenta"><span className="admin-user-avatar">{(displayName || email)[0]?.toUpperCase()}</span><span>{displayName || email}</span><AppIcon name="account" /></button>
            </div>
          </div>}
          <a
            className="header-brand"
            href="/dashboard"
            aria-label="De1na Beta, inicio"
          >
            <img src="/icons/icon-192.png" width="46" height="46" alt="" />
            <span className="header-wordmark">
              De<span>1</span>na
            </span>
            <span className="beta-badge">Beta</span>
          </a>
          {role === "admin" && <AdminThemeToggle theme={adminTheme} onToggle={toggleTheme} />}
          <NotificationInbox userId={userId} />
        </header>
        {offline && (
          <div className="connection-banner" role="status">
            Sin conexión. Reconéctate para consultar o actualizar viajes.
          </div>
        )}
        {profile?.role==='driver'&&profile.approved&&!profile.suspended&&<DriverAvailability available={profile.available} occupied={!!driverActive} onRefresh={load}/>}
        <section className={"content" + (role === "admin" ? ` admin-page-${page}` : "")} key={page} aria-busy={busy}>
          {page === "home" && role === "passenger" && (
            <>
              <span className={"page-context " + (serviceOpen ? "is-open" : "")}>{settings && <i />}{settings ? serviceLabel : "\u00a0"}</span>
              <h1 className="home-greeting">{displayName ? `Hola, ${displayName.split(" ")[0]}.` : "Hola."}</h1>
              {balance.amount_cents > 0 && (
                <button type="button" className="balance-alert" onClick={() => { openSection("balance"); window.scrollTo({ top: 0, behavior: "instant" }); }}>
                  <span className="balance-alert-icon" aria-hidden="true">!</span>
                  <span><strong>Tienes un saldo pendiente de {usd(balance.amount_cents)}</strong><small>Solvéntalo para seguir disfrutando del servicio.</small></span>
                  <AppIcon name="arrow" />
                </button>
              )}
            </>
          )}
          {page === "account" && accountSection !== "overview" ? <div className="account-section-heading">
            <button type="button" className="account-back" aria-label="Volver a tu cuenta" onClick={()=>openSection("overview")}><AppIcon name="back" /></button>
            <div><span className="page-context">{pageContext}</span><h1>{pageTitle}</h1></div>
          </div> : !(page === "home" && role === "passenger") && page !== "messages" && <>
          <span className={"page-context " + (page === "home" && role === "admin" && serviceOpen || page === "home" && role === "driver" && profile?.available ? "is-open" : "")}>{page === "home" && role !== "passenger" && <i />}{pageContext}</span>
          {page === "history" ? <div className="history-title-row"><h1>{pageTitle}</h1><button type="button" className={"history-calendar" + (historyDate ? " is-active" : "")} aria-label={historyDate ? `Filtrando por ${dayTitle(historyDate)}. Cambiar fecha` : "Buscar viajes por fecha"} onClick={() => { dateDialog.current?.showModal(); dateDialog.current?.focus({ preventScroll: true }); }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button></div> : <h1>{pageTitle}</h1>}
          {page === "history" && historyDate && <button type="button" className="history-date-chip" onClick={() => setHistoryDate("")}>{dayTitle(historyDate)} <span aria-hidden="true">✕</span><span className="sr-only">Quitar filtro de fecha</span></button>}
          </>}
          {!profile ? (
            <div
              className="skeleton-group"
              role="status"
              aria-label="Cargando tu espacio"
            >
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : profile.suspended ? (
            <article className="trip-card"><h2>Cuenta suspendida</h2><p>Tu cuenta no puede realizar operaciones. Contacta con la administración para revisar su estado.</p><button className="secondary" onClick={openSignOut}>Cerrar sesión</button></article>
          ) : page === "messages" && role !== "admin" ? (
            <TripChat userId={userId} refresh={trips} offline={offline} role={role}/>
          ) : page === "account" ? (
            <div className={"account-stack " + (accountSection === "overview" ? "account-overview" : "account-subsection")}>
              {accountSection==="overview"&&<>
              <article className="trip-card account-card">
                <div className="avatar">{(displayName || email)[0]?.toUpperCase()}</div>
                <h2>{displayName || "Tu cuenta"}</h2>
                <DriverReputation viewerId={userId} personId={userId}/>
                <p className="account-email">{email}</p>
                <span className="pill green">
                  {role === "admin"
                    ? "Administrador"
                    : role === "driver"
                      ? "Conductor"
                      : "Pasajero"}
                </span>
              </article>
              <div className="account-menu">
                {[["info","Tu información","account"],["security","Seguridad","key"],...(role==="passenger"?[["wallet",wallet?`Mi saldo · ${usd(wallet.balance_cents)}`:"Mi saldo","wallet"],["balance",balance.amount_cents>0?`Saldo pendiente · ${usd(balance.amount_cents)}`:"Saldo pendiente","payments"],["favorites","Lugares favoritos","places"],["payment-data","Mis datos de pago móvil","payments"]]:role==="driver"?[["payout","Mis cuentas","payments"]]:[]),["preferences","Configuración","settings"]].map(([section,title,icon])=><button key={section} className="secondary account-menu-item" onClick={()=>openSection(section)}><AppIcon name={icon}/><span>{title}</span><AppIcon name="arrow"/></button>)}
              </div>
              <button className="secondary signout" onClick={openSignOut}>Cerrar sesión</button>
              </>}
              {accountSection==="info"&&
              <form className="trip-card" onSubmit={saveProfile}>
                <h2>Tus datos</h2>
                <label>Nombre
                  <input name="name" autoComplete="name" value={draftName} onChange={(e) => setDraftName(e.target.value)} required maxLength={80} />
                </label>
                <label>Correo electrónico
                  <span className="account-email-field">
                    <input type="email" autoComplete="email" value={email} readOnly aria-describedby={emailVerified?'account-email-verified':undefined}/>
                    {emailVerified&&<span id="account-email-verified" className="email-verified" role="img" aria-label="Correo verificado" title="Correo verificado"><AppIcon name="check"/></span>}
                  </span>
                </label>
                <label>Teléfono de contacto
                  <input name="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
                </label>
                <button className="primary" disabled={busy || offline || !draftName.trim()}>{busy ? "Guardando…" : "Guardar datos"}</button>
              </form>}
              {accountSection==="security"&&<><ChangePassword /><PasskeySecurity /></>}
              {accountSection==="payout"&&role==="driver"&&<DriverPayout />}
              {accountSection==="payment-data"&&role==="passenger"&&<PaymentPreferences />}
              {accountSection==="balance"&&role==="passenger"&&pendingBalance()}
              {accountSection==="wallet"&&role==="passenger"&&<WalletView wallet={wallet} settings={settings} onChanged={()=>void reloadWallet()} />}
              {accountSection==="favorites"&&role==="passenger"&&<FavoritePlaces userId={userId} favorites={savedPlaces.favorites} onSave={savedPlaces.reload} setupHome={setupHome} onSetupHandled={()=>setSetupHome(false)}/>}
              {accountSection==="preferences"&&<><PushPreferences /><InstallApp /></>}
            </div>
          ) : page === "payments" && role === "admin" ? (
            <AdminPayments onMessage={setMessage} />
          ) : page === "places" && role === "admin" ? (
            <PlacesCatalog />
          ) : page === "notifications" && role === "admin" ? (
            <PushCampaigns />
          ) : page === "settings" && settings ? (
            <div className="service-settings">
            <div className="service-tabs" role="tablist" aria-label="Secciones del servicio">
              {([["hours","Horario","history"],["fares","Tarifas","moto"],["payment","Pago móvil y tasa","payments"],["drivers","Conductores","drivers"]] as const).map(([value,label,icon])=>(
                <button key={value} type="button" role="tab" aria-selected={settingsSection===value} className={settingsSection===value?"is-active":""} onClick={()=>setSettingsSection(value)}><AppIcon name={icon}/><span>{label}</span></button>
              ))}
            </div>
            <div className="service-panel" role="tabpanel" key={settingsSection}>
            {settingsSection==="payment"&&<div className="settings-grid"><PaymentSettingsForm settings={settings} busy={busy || offline} onSaved={(text) => { setMessage(text); void load(); }} /><WalletSettings enabled={!!(settings as {wallet_topup_enabled?:boolean}).wallet_topup_enabled} onSaved={text=>{setMessage(text);void load();}} /></div>}
            {settingsSection==="fares"&&<FareSettings settings={settings} busy={busy || offline} onSave={payload => void act('fares', payload)} />}
            {settingsSection==="drivers"&&<AvailabilitySettings />}
            {settingsSection==="hours"&&<form
              className="trip-card"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("settings", {
                  enabled: f.has("enabled"),
                  open_time: f.get("open"),
                  close_time: f.get("close"),
                });
              }}
            >
              <label className="check">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={settings.enabled}
                />
                Habilitar solicitudes de prueba
              </label>
              <div className="two">
                <label>
                  Apertura
                  <input
                    name="open"
                    type="time"
                    required
                    defaultValue={settings.open_time.slice(0, 5)}
                  />
                </label>
                <label>
                  Cierre
                  <input
                    name="close"
                    type="time"
                    required
                    defaultValue={settings.close_time.slice(0, 5)}
                  />
                </label>
              </div>
              <p className="muted">
                Hora de Venezuela. Durante este horario el servicio permanece abierto. Fuera de él, abre solo si hay un conductor disponible y sin viaje activo. Horas iguales representan 24 horas. Deshabilitar las solicitudes pausa todo el servicio.
              </p>
              <button className="primary" disabled={busy || offline}>
                Guardar configuración
              </button>
            </form>}
            </div>
            </div>
          ) : role === "admin" && (page === "drivers" || page === "users" || page === "history") ? (
            <AdminRecords viewerId={userId} key={page} section={page === "drivers" ? "team" : page === "users" ? "users" : "trips"} busy={busy || offline} refresh={profiles} onDriver={(id,approved)=>act("driver",{id,approved})} renderTrip={card}/>
          ) : page === "home" && role === "passenger" ? (
            mine ? (
              card(mine)
            ) : (
              <RideRequest
                walletCents={wallet?.balance_cents ?? 0}
                home={savedPlaces.favorites.find(place=>place.kind==='home')}
                work={savedPlaces.favorites.find(place=>place.kind==='work')}
                onManagePlaces={()=>openSection('favorites')}
                homeLoading={savedPlaces.loading}
                homeError={savedPlaces.error}
                onSetupHome={()=>{setSetupHome(true);openSection('favorites');}}
                enabled={serviceOpen}
                busy={busy}
                offline={offline}
                payment={settings}
                onRequest={async (payload) => {
                  if (!(await act("request", payload)))
                    throw new Error("No se pudo solicitar");
                }}
              />
            )
          ) : (
            <>
              {role === "driver" && page === "home" && !driverActive && (
                <>
                  <button
                    className="primary"
                    disabled={connecting || busy || offline || !profile.approved || !!driverActive}
                    aria-busy={connecting}
                    aria-label={connecting ? "Conectando" : undefined}
                    onClick={async () => {
                      if (connecting) return;
                      if (profile.available) { void act("available", { available: false }); return; }
                      setConnecting(true);
                      try { await Promise.all([act("available", { available: true }), new Promise(resolve=>setTimeout(resolve,1000))]); }
                      finally { setConnecting(false); }
                    }}
                  >
                    {connecting ? <span className="refreshing" role="status" aria-label="Conectando"><AppIcon name="refresh" /></span> : profile.available ? "Desconectarme" : "Conectarme"}
                  </button>
                </>
              )}
              {role === "admin" && page === "home" && (
                <div className="stats-grid">
                  {[
                    [
                      trips.filter(
                        (t) => !["finished", "cancelled"].includes(t.status),
                      ).length,
                      "Viajes activos",
                    ],
                    [
                      profiles.filter(
                        (p) => p.role === "driver" && p.approved && p.available,
                      ).length,
                      "Disponibles",
                    ],
                    [
                      trips.filter((t) => t.status === "finished").length,
                      "Completados",
                    ],
                  ].map(([n, label]) => (
                    <article key={label}>
                      <strong>{n}</strong>
                      <span>{label}</span>
                    </article>
                  ))}
                </div>
              )}
              {page === "history" && (
                <div className="history-filters" role="group" aria-label="Filtrar viajes">
                  {([["all","Todos"],["finished","Finalizados"],["cancelled","Cancelados"]] as const).map(([value,label])=>(
                    <button key={value} type="button" aria-pressed={historyFilter===value} onClick={()=>{setHistoryFilter(value);setHistoryPage(0);}}>{label}</button>
                  ))}
                </div>
              )}
              <div className={"cards " + (page === "history" ? "history-list" : "")}>
                {page === "history" ? groupByDay(visibleTrips).map(([day, items]) => (
                  <section key={day} className="history-day">
                    <h2>{dayTitle(day)}</h2>
                    {items.map(t => (
                      <button key={t.id} type="button" className="history-row" onClick={() => { setDetailTrip(t.id); requestAnimationFrame(() => { detailDialog.current?.showModal(); detailDialog.current?.focus({ preventScroll: true }); }); }}>
                        <span className={"history-dot " + (t.status === "cancelled" ? "is-cancelled" : t.status === "finished" ? "is-done" : "")} aria-hidden="true" />
                        <span className="history-row-main">
                          <strong>{role === "admin" ? (t.passenger_name || "Pasajero") : <PeerName tripId={t.id} viewerId={userId} fallback={role === "driver" ? "Pasajero" : "Conductor"} />}</strong>
                          <small>{labels[t.status]} · {t.created_at ? new Date(t.created_at).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" }) : ""}</small>
                        </span>
                        <span className="history-row-price">{t.fare_cents != null ? (t.status === "cancelled" ? <del>{usd(t.fare_cents)}</del> : usd(t.fare_cents)) : "—"}</span>
                      </button>
                    ))}
                  </section>
                )) : pagedTrips.map(t => card(t))}
                {visibleTrips.length === 0 && (
                  <div className="empty">
                    <span className="empty-icon">
                      <AppIcon name={driverDisconnected ? "power" : "history"} />
                    </span>
                    <h2>{driverDisconnected ? "Estás desconectado" : "Todo tranquilo por aquí"}</h2>
                    <p>{driverDisconnected ? (profile.approved ? "Activa tu disponibilidad para aceptar viajes." : "Tu perfil está pendiente de aprobación.") : "Los viajes aparecerán en este espacio."}</p>
                  </div>
                )}
              </div>
              {false&&<nav className="history-pagination" aria-label="Páginas de viajes">
                <button type="button" aria-label="Página anterior" disabled={currentHistoryPage===0} onClick={()=>setHistoryPage(currentHistoryPage-1)}><AppIcon name="back"/></button>
                <span aria-live="polite"><strong>{currentHistoryPage+1}</strong><span> / {historyPages}</span></span>
                <button type="button" aria-label="Página siguiente" disabled={currentHistoryPage===historyPages-1} onClick={()=>setHistoryPage(currentHistoryPage+1)}><AppIcon name="back"/></button>
              </nav>}
            </>
          )}
        </section>
      </main>
      {currentTrip && page !== "home" && !profile?.suspended && (
        <button type="button" className="active-trip-card" onClick={() => navigate("home")}>
          <span className="active-trip-icon"><AppIcon name="moto" /></span>
          <span className="active-trip-text">
            <strong>{role === "passenger" ? passengerHeadlines[currentTrip.status] || labels[currentTrip.status] : labels[currentTrip.status]}</strong>
            <small className={currentTrip.cancel_requested ? "alert" : ""}>
              {currentTrip.cancel_requested
                ? role === "passenger" ? "Tu conductor pide cancelar · Revisar" : "Solicitud de cancelación pendiente · Revisar"
                : `Hacia ${parseStoredPlace(currentTrip.destination).label.split(",")[0]} · Ver viaje`}
            </small>
          </span>
          <AppIcon name="arrow" />
        </button>
      )}
      {role === "admin" && (
        <dialog
          ref={moreDialog}
          className="action-sheet more-sheet"
          aria-label="Más secciones"
          onClose={() => setMoreOpen(false)}
          onClick={(e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) setMoreOpen(false); } }}
          onTouchStart={(e) => { dragStart.current = e.touches[0].clientY; }}
          onTouchMove={(e) => { if (dragStart.current == null) return; const dy = Math.max(0, e.touches[0].clientY - dragStart.current); e.currentTarget.classList.add("is-dragging"); e.currentTarget.style.transform = `translateY(${dy}px)`; }}
          onTouchEnd={(e) => { const sheet = e.currentTarget; const dy = dragStart.current == null ? 0 : e.changedTouches[0].clientY - dragStart.current; dragStart.current = null; sheet.classList.remove("is-dragging"); sheet.style.transform = ""; if (dy > 70) setMoreOpen(false); }}
        >
          <div className="sheet-handle" />
          {moreTabs.map(([p, label, group], index) => (
            <Fragment key={p}>
              {group !== moreTabs[index - 1]?.[2] && <span className="more-group">{group}</span>}
              <button type="button" className={"more-item " + (page === p ? "selected" : "")} aria-current={page === p ? "page" : undefined} onClick={() => navigate(p)}>
                <span className="more-icon"><AppIcon name={p} /></span>
                <span><strong>{label}</strong><small>{moreDescriptions[p]}</small></span>
              </button>
            </Fragment>
          ))}
        </dialog>
      )}
      <Toast message={message} />
      {role!=='admin'&&!profile?.suspended&&<TripCompletion refresh={trips} onDone={()=>navigate('home')}/>}
      <dialog ref={acceptDialog} className="action-sheet" aria-labelledby="accept-title" onClose={()=>setAcceptTrip(null)} onCancel={e=>{if(busy)e.preventDefault();}}>
        <div className="sheet-handle"/>
        <h2 id="accept-title">¿Aceptar este viaje?</h2>
        {acceptTrip&&<><p><strong>Recogida:</strong> {parseStoredPlace(acceptTrip.origin).label}</p><p><strong>Destino:</strong> {parseStoredPlace(acceptTrip.destination).label}</p>{acceptTrip.fare_cents!=null&&<p><strong>{usd(acceptTrip.fare_cents)}</strong></p>}<TripPaymentNote trip={acceptTrip} viewer="driver" /></>}
        <button className="primary" disabled={busy||offline} onClick={async()=>{if(acceptTrip){const accepted=await act('accept',{id:acceptTrip.id});if(accepted)acceptDialog.current?.close();}}}>{busy?'Aceptando…':'Sí, aceptar viaje'}</button>
        <button className="secondary" disabled={busy} onClick={()=>acceptDialog.current?.close()}>Volver a solicitudes</button>
        <Toast message={message}/>
      </dialog>
      <dialog ref={detailDialog} tabIndex={-1} className="action-sheet trip-detail-sheet" aria-label="Detalle del viaje" onClick={closeOnBackdrop} onClose={() => setDetailTrip(null)}>
        <div className="sheet-handle" />
        {(() => { const t = trips.find(x => x.id === detailTrip); return t ? <>{t.created_at && <p className="muted trip-detail-date">{new Date(t.created_at).toLocaleString("es-VE", { dateStyle: "full", timeStyle: "short" })}</p>}{card(t, true)}</> : null; })()}
        <button className="secondary" onClick={() => detailDialog.current?.close()}>Cerrar</button>
      </dialog>
      <dialog ref={dateDialog} tabIndex={-1} className="action-sheet" aria-labelledby="history-date-title" onClick={closeOnBackdrop}>
        <div className="sheet-handle" />
        <h2 id="history-date-title">Buscar por fecha</h2>
        <label>Fecha del viaje<input type="date" value={historyDate} max={localDay(new Date().toISOString())} onChange={e => setHistoryDate(e.target.value)} /></label>
        <button className="primary" onClick={() => dateDialog.current?.close()}>Ver viajes</button>
        {historyDate && <button className="text" onClick={() => { setHistoryDate(""); dateDialog.current?.close(); }}>Mostrar todas las fechas</button>}
      </dialog>
      <dialog ref={signOutDialog} tabIndex={-1} className="action-sheet" aria-labelledby="signout-title" onCancel={e => { if (signingOut) e.preventDefault(); }}>
        <div className="sheet-handle" />
        <h2 id="signout-title">¿Cerrar sesión?</h2>
        <p className="muted">Tendrás que iniciar sesión de nuevo para usar tu cuenta.</p>
        <button className="primary" disabled={signingOut} onClick={() => signOutDialog.current?.close()}>Seguir en mi cuenta</button>
        <button className="secondary danger" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Cerrando sesión…" : "Sí, cerrar sesión"}</button>
      </dialog>
      <dialog
        ref={cancelDialog}
        className="action-sheet trip-cancel-sheet"
        aria-label="Confirmar cancelación del viaje"
        onClose={() => setCancelId(null)}
      >
        <div className="sheet-handle" />
        <h2>¿Cancelar este viaje?</h2>
        <p className="muted">
          Tu solicitud dejará de estar disponible para los conductores.
        </p>
        <button
          className="primary"
          onClick={() => cancelDialog.current?.close()}
        >
          Seguir con el viaje
        </button>
        <button
          className="secondary danger"
          onClick={() => {
            if (cancelId) void act("cancel", { id: cancelId });
            cancelDialog.current?.close();
          }}
        >
          Sí, cancelar solicitud
        </button>
      </dialog>
    </div>
  );
}

type Balance = { amount_cents: number; trips: string[] };
/** Día local (AAAA-MM-DD) de una fecha. */
function localDay(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayTitle(day: string) {
  if (!day) return "Sin fecha";
  const today = localDay(new Date().toISOString()), yesterday = localDay(new Date(Date.now() - 86400000).toISOString());
  if (day === today) return "Hoy";
  if (day === yesterday) return "Ayer";
  const [y, m, d] = day.split("-").map(Number);
  const text = new Date(y, m - 1, d).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function groupByDay<T extends { created_at?: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) { const day = localDay(item.created_at); groups.set(day, [...(groups.get(day) || []), item]); }
  return [...groups];
}
function PeerName({ tripId, viewerId, fallback }: { tripId: string; viewerId: string; fallback: string }) {
  const key = participantKey(viewerId, "trip", tripId);
  const person = useSyncExternalStore(useCallback((l: () => void) => subscribeParticipant(key, l), [key]), useCallback(() => readParticipant<TripContact>(key), [key]), () => null);
  useEffect(() => { void loadTripContact(browserClient(), viewerId, tripId).catch(() => {}); }, [viewerId, tripId]);
  return <>{person?.name || fallback}</>;
}
