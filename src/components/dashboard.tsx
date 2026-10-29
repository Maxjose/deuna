"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
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
  const client = useMemo(() => browserClient(), []),
    [profile, setProfile] = useState<Profile | null>(null),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [trips, setTrips] = useState<Trip[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [page, setPage] = useState("home"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
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
    } catch {
      setMessage(
        "No se pudo completar la acción. El viaje puede haber cambiado; revisa disponibilidad, permisos y horario.",
      );
      await load();
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
  function card(t: Trip) {
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
        <p className="price-note">
          Piloto técnico · Tarifa pendiente · Pago directo al motorizado
        </p>
        {t.driver_id && <p>Motorizado #{t.driver_id.slice(0, 8)}</p>}
        {role === "driver" && t.status === "searching" && (
          <button
            className="primary"
            disabled={busy || !profile?.available || !profile?.approved}
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
              disabled={busy}
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
              disabled={busy}
              onClick={() => {
                if (confirm("¿Cancelar este viaje de prueba?"))
                  void act("cancel", { id: t.id });
              }}
            >
              Cancelar solicitud
            </button>
          )}
      </article>
    );
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          De<span>1</span>na
        </a>
        <span className="workspace">
          {role === "admin"
            ? "CENTRO DE OPERACIÓN"
            : role === "driver"
              ? "ESPACIO DEL MOTORIZADO"
              : "TU COMPAÑERO DE CAMINO"}
        </span>
        <nav>
          {[
            [
              "home",
              role === "admin"
                ? "Operación"
                : role === "driver"
                  ? "Solicitudes"
                  : "Pedir un viaje",
            ],
            ["history", "Historial"],
            ...(role === "admin"
              ? [
                  ["settings", "Cobertura y horarios"],
                  ["drivers", "Conductores"],
                ]
              : []),
          ].map(([p, label]) => (
            <button
              key={p}
              className={"nav-item " + (page === p ? "selected" : "")}
              onClick={() => setPage(p)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" />
          Nacimos en Mara
          <button
            className="text"
            onClick={async () => {
              const { error } = await client.auth.signOut();
              if (error)
                setMessage("No se pudo cerrar la sesión. Inténtalo de nuevo.");
              else window.location.assign("/login");
            }}
          >
            Cerrar sesión ↗
          </button>
        </div>
      </aside>
      <main>
        <header>
          <span>Mara, Zulia / Venezuela</span>
          <span className="muted">{email}</span>
        </header>
        <div className="demo-bar">
          PILOTO TÉCNICO · No habilitado para transporte real{" "}
          <button className="text" onClick={() => void load()}>
            Actualizar ↻
          </button>
        </div>
        <section className="content">
          <span className="eyebrow">MOVERTE SIN COMPLICARTE</span>
          <h1>
            {page === "settings"
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
            <p className="muted">Preparando tu espacio…</p>
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
              <button className="primary" disabled={busy}>
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
                      disabled={busy}
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
              <form
                className="trip-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act("request", {
                    origin: f.get("origin"),
                    destination: f.get("destination"),
                    zone: f.get("zone"),
                  });
                }}
              >
                <div className="service">
                  <span className="service-icon">↗</span>
                  <div>
                    <strong>De1na Moto</strong>
                    <small>Un viaje para ti</small>
                  </div>
                </div>
                <label>
                  Punto de recogida
                  <input
                    name="origin"
                    required
                    maxLength={150}
                    placeholder="¿Dónde te buscamos?"
                  />
                </label>
                <label>
                  Destino
                  <input
                    name="destination"
                    required
                    maxLength={150}
                    placeholder="¿A dónde quieres ir?"
                  />
                </label>
                <label>
                  Zona
                  <select name="zone" required>
                    <option value="">Selecciona una zona</option>
                    {settings?.zones.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <p className="price-note">
                  Prueba técnica. Aún no existe una tarifa ni se solicita
                  transporte real. La cobertura se valida por zona declarada.
                </p>
                <button
                  className="primary"
                  disabled={busy || !settings?.enabled}
                >
                  Solicitar viaje de prueba ↗
                </button>
              </form>
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
                    disabled={busy || !profile.approved}
                    onClick={() =>
                      void act("available", { available: !profile.available })
                    }
                  >
                    {profile.available ? "Desconectarme" : "Conectarme"}
                  </button>
                </>
              )}
              <div className="cards">
                {trips
                  .filter(
                    (t) =>
                      page === "history" ||
                      role === "admin" ||
                      t.driver_id === userId ||
                      (profile.approved &&
                        profile.available &&
                        t.status === "searching"),
                  )
                  .map(card)}
                {trips.length === 0 && (
                  <p className="empty">Aún no hay viajes para mostrar.</p>
                )}
              </div>
            </>
          )}
        </section>
        <footer>
          De1na · ¿Vamos? ¡De una!<span>Piloto técnico</span>
        </footer>
      </main>
    </div>
  );
}
