"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { AppIcon } from "./app-icon";
import { InstallApp } from "./install-app";
import { PasskeySecurity } from "./passkey-security";
import { RideWaiting } from "./ride-waiting";
import { RideRequest } from "./ride-request";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  role: "passenger" | "driver" | "admin";
  approved: boolean;
  available: boolean;
};
type Trip = {
  id: string;
  origin: string;
  destination: string;
  zone: string;
  status: string;
  passenger_id: string;
  driver_id: string | null;
};
type Settings = {
  id: number;
  enabled: boolean;
  open_time: string;
  close_time: string;
  zones: string[];
};
const labels: Record<string, string> = {
  searching: "Buscando motorizado",
  assigned: "Motorizado en camino",
  arrived: "Motorizado en la recogida",
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
  const client = useMemo(() => browserClient(), []),
    [profile, setProfile] = useState<Profile | null>(null),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [trips, setTrips] = useState<Trip[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [page, setPage] = useState("home"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [cancelId, setCancelId] = useState<string | null>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    const [p, t, s] = await Promise.all([
      client.from("profiles").select("id,role,approved,available"),
      client
        .from("trips")
        .select("id,origin,destination,zone,status,passenger_id,driver_id")
        .order("created_at", { ascending: false })
        .limit(100),
      client.from("service_settings").select("*").eq("id", 1).single(),
    ]);
    if (p.error || t.error || s.error) {
      setMessage(
        "No se pudo cargar la operación. Comprueba la conexión y la configuración del servicio.",
      );
      return;
    }
    setProfiles(p.data);
    setProfile(p.data.find((p) => p.id === userId) || null);
    setTrips(t.data);
    setSettings(s.data);
  }, [client, userId]);
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
    } catch {
      setMessage(
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
      const value = window.location.hash.slice(1);
      const allowed =
        profile?.role === "admin"
          ? ["home", "history", "settings", "drivers", "account"]
          : ["home", "history", "account"];
      setPage(allowed.includes(value) ? value : "home");
    };
    syncPage();
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
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
    window.location.hash = value;
    setPage(value);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const tabs =
    role === "passenger"
      ? [
          ["history", "Viajes"],
          ["home", "Viajar"],
          ["account", "Cuenta"],
        ]
      : [
          [
            "home",
            role === "admin"
              ? "Inicio"
              : role === "driver"
                ? "Solicitudes"
                : "Viajar",
          ],
          ["history", "Viajes"],
          ...(role === "admin"
            ? [
                ["drivers", "Equipo"],
                ["settings", "Servicio"],
              ]
            : []),
          ["account", "Cuenta"],
        ];
  const visibleTrips = trips.filter((t) =>
    page === "history"
      ? role === "admin" || t.passenger_id === userId || t.driver_id === userId
      : role === "admin" ||
        (t.driver_id === userId &&
          !["finished", "cancelled"].includes(t.status)) ||
        (profile?.approved && profile.available && t.status === "searching"),
  );
  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) setMessage("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    else {
      router.replace("/login");
      router.refresh();
    }
  }
  function card(t: Trip) {
    if (role === "passenger" && page === "home" && t.status === "searching")
      return (
        <RideWaiting
          origin={t.origin}
          destination={t.destination}
          busy={busy || offline}
          onCancel={() => setCancelId(t.id)}
        />
      );
    return (
      <article className="trip-card" key={t.id}>
        <div className="row">
          <span className="pill green">{labels[t.status]}</span>
          <small>#{t.id.slice(0, 6)}</small>
        </div>
        <div className="route">
          <div>
            <i>●</i>
            <span>
              <small>RECOGIDA</small>
              {t.origin}
            </span>
          </div>
          <div>
            <i>↗</i>
            <span>
              <small>DESTINO</small>
              {t.destination}
            </span>
          </div>
        </div>
        <p className="muted">{t.zone}</p>
        {t.driver_id && <p>Motorizado #{t.driver_id.slice(0, 8)}</p>}
        {role === "driver" && t.status === "searching" && (
          <button
            className="primary"
            disabled={
              busy || offline || !profile?.available || !profile?.approved
            }
            onClick={() => void act("accept", { id: t.id })}
          >
            Aceptar viaje ↗
          </button>
        )}
        {role === "driver" &&
          t.driver_id === userId &&
          ["assigned", "arrived", "ongoing"].includes(t.status) && (
            <button
              className="primary"
              disabled={busy || offline}
              onClick={() => void act("advance", { id: t.id })}
            >
              {
                {
                  assigned: "Ya llegué",
                  arrived: "Iniciar viaje",
                  ongoing: "Finalizar viaje",
                }[t.status]
              }{" "}
              ↗
            </button>
          )}
        {role === "passenger" &&
          t.passenger_id === userId &&
          ["searching", "assigned", "arrived"].includes(t.status) && (
            <button
              className="secondary"
              disabled={busy || offline}
              onClick={() => {
                setCancelId(t.id);
              }}
            >
              Cancelar solicitud
            </button>
          )}
      </article>
    );
  }
  return (
    <div
      className={
        "shell " +
        (page === "home" && role === "passenger" ? "ride-screen" : "")
      }
    >
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
          {tabs.map(([p, label]) => (
            <button
              key={p}
              className={
                "nav-item " +
                (page === p ? "selected " : "") +
                (p === "home" && role === "passenger" ? "nav-ride" : "")
              }
              aria-current={page === p ? "page" : undefined}
              onClick={() => navigate(p)}
            >
              <AppIcon
                name={p === "home" && role === "passenger" ? "ride" : p}
              />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" />
          Mara, Zulia
        </div>
      </aside>
      <main>
        <header className="app-header">
          <a
            className="header-brand"
            href="/dashboard"
            aria-label="De1na, inicio"
          >
            <img src="/icons/icon-192.png" width="46" height="46" alt="" />
            <span className="header-wordmark">
              De<span>1</span>na
            </span>
          </a>
        </header>
        {offline && (
          <div className="connection-banner" role="status">
            Sin conexión. Reconéctate para consultar o actualizar viajes.
          </div>
        )}
        <section className="content" key={page} aria-busy={busy}>
          <span className="eyebrow">MOVERTE SIN COMPLICARTE</span>
          <h1>
            {page === "account"
              ? "Tu espacio."
              : page === "settings"
                ? "Cerca, a tu manera."
                : page === "drivers"
                  ? "Personas que nos mueven."
                  : page === "history"
                    ? "Cada vuelta cuenta."
                    : role === "passenger"
                      ? "¿Pa’ dónde vamos?"
                      : "Vamos de una."}
          </h1>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
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
          ) : page === "account" ? (
            <div className="account-stack">
              <article className="trip-card account-card">
                <div className="avatar">{email[0]?.toUpperCase()}</div>
                <h2>Tu cuenta De1na</h2>
                <p className="account-email">{email}</p>
                <span className="pill green">
                  {role === "admin"
                    ? "Administrador"
                    : role === "driver"
                      ? "Motorizado"
                      : "Pasajero"}
                </span>
              </article>
              <PasskeySecurity />
              <article className="trip-card">
                <InstallApp />
              </article>
              <button
                className="secondary signout"
                onClick={() => void signOut()}
              >
                Cerrar sesión
              </button>
            </div>
          ) : page === "settings" && settings ? (
            <form
              className="trip-card"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("settings", {
                  enabled: f.has("enabled"),
                  open_time: f.get("open"),
                  close_time: f.get("close"),
                  zones: String(f.get("zones"))
                    .split("\n")
                    .map((z) => z.trim())
                    .filter(Boolean),
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
                Hora de Venezuela. Horas iguales representan 24 horas.
              </p>
              <label>
                Zonas (una por línea)
                <textarea
                  name="zones"
                  rows={5}
                  required
                  defaultValue={settings.zones.join("\n")}
                />
              </label>
              <button className="primary" disabled={busy || offline}>
                Guardar configuración
              </button>
            </form>
          ) : page === "drivers" ? (
            <div className="cards">
              {profiles.map((p) => (
                <article className="trip-card" key={p.id}>
                  <h2>Usuario #{p.id.slice(0, 8)}</h2>
                  <p>
                    {p.role} · {p.approved ? "Aprobado" : "Sin aprobar"}
                  </p>
                  {p.role !== "admin" && (
                    <button
                      className="secondary"
                      disabled={busy || offline}
                      onClick={() =>
                        void act("driver", { id: p.id, approved: !p.approved })
                      }
                    >
                      {p.approved ? "Suspender" : "Aprobar como motorizado"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : page === "home" && role === "passenger" ? (
            mine ? (
              card(mine)
            ) : (
              <RideRequest
                zones={settings?.zones || []}
                enabled={settings?.enabled || false}
                busy={busy}
                offline={offline}
                onRequest={async (payload) => {
                  if (!(await act("request", payload)))
                    throw new Error("No se pudo solicitar");
                }}
              />
            )
          ) : (
            <>
              {role === "driver" && page === "home" && (
                <>
                  <p className="muted">
                    {profile.approved
                      ? "Activa tu disponibilidad para aceptar viajes."
                      : "Tu perfil está pendiente de aprobación."}
                  </p>
                  <button
                    className="primary"
                    disabled={busy || offline || !profile.approved}
                    onClick={() =>
                      void act("available", { available: !profile.available })
                    }
                  >
                    {profile.available ? "Desconectarme" : "Conectarme"}
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
              <div className="cards">
                {visibleTrips.map(card)}
                {visibleTrips.length === 0 && (
                  <div className="empty">
                    <span className="empty-icon">
                      <AppIcon name="history" />
                    </span>
                    <h2>Todo tranquilo por aquí</h2>
                    <p>Los viajes aparecerán en este espacio.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>
      <dialog
        ref={cancelDialog}
        className="action-sheet"
        aria-label="Confirmar cancelación del viaje"
        onClose={() => setCancelId(null)}
      >
        <div className="sheet-handle" />
        <h2>¿Cancelar este viaje?</h2>
        <p className="muted">
          Tu solicitud dejará de estar disponible para los motorizados.
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
