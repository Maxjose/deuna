"use client";
import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { VE_BANKS, cleanPhone } from "@/lib/payments";
import { Toast, useNotice } from "./toast";

type DriverData = { vehicle: { plate: string; model: string; color: string } | null; payout: { bank: string; id_number: string; phone: string } | null };
const ERRORS: Record<string, string> = {
  "Placa inválida": "Escribe una placa válida (5 a 8 letras y números).", "Completa modelo y color": "Completa el modelo y el color.",
  "Placa ya registrada": "Esa placa ya está registrada por otro conductor.", "Cédula ya registrada": "Esa cédula ya está registrada por otro conductor.",
  "Banco inválido": "Selecciona tu banco.", "Cédula inválida": "Escribe una cédula válida, solo números.", "Teléfono inválido": "Escribe un teléfono válido, por ejemplo 0412 1234567.",
};

function useDriverData() {
  const client = useMemo(() => browserClient(), []);
  const [data, setData] = useState<DriverData | null>(null);
  useEffect(() => { void client.rpc("my_driver_data").then(({ data }) => setData((data as DriverData) ?? { vehicle: null, payout: null })); }, [client]);
  return { client, data, setData };
}

/** Conductor: datos de pago móvil para recibir pagos (banco, cédula y teléfono). La cédula es única entre conductores. */
export function DriverPayout() {
  const { client, data, setData } = useDriverData();
  const [form, setForm] = useState({ bank: "", id_number: "", phone: "" }), [busy, setBusy] = useState(false);
  const { message, notify } = useNotice("driver-payout");
  useEffect(() => { if (data?.payout) setForm(data.payout); }, [data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(form.phone);
    if (!phone) { notify(ERRORS["Teléfono inválido"]); return; }
    setBusy(true);
    const { data: next, error } = await client.rpc("save_my_payout", { bank: form.bank, id_number: form.id_number, phone });
    setBusy(false);
    if (error) { notify(ERRORS[error.message] || "No pudimos guardar tu cuenta. Inténtalo de nuevo."); return; }
    setData(next as DriverData); notify("Tu cuenta de pago móvil se guardó.");
  }
  const loaded = data !== null;
  return (
    <form className="trip-card" onSubmit={save}>
      <h2>Pago móvil</h2>
      <p className="muted">Registra la cuenta donde quieres recibir tus pagos. Es necesaria para que la administración apruebe tu cuenta.</p>
      <label>Banco
        <select value={form.bank} disabled={!loaded || busy} onChange={(e) => setForm({ ...form, bank: e.target.value })} required>
          <option value="">Selecciona tu banco</option>
          {VE_BANKS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
        </select>
      </label>
      <label>Cédula<input inputMode="numeric" placeholder="12345678" value={form.id_number} disabled={!loaded || busy} onChange={(e) => setForm({ ...form, id_number: e.target.value })} required /></label>
      <label>Teléfono<input type="tel" inputMode="tel" placeholder="0412 1234567" value={form.phone} disabled={!loaded || busy} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
      <button className="primary" disabled={!loaded || busy}>{busy ? "Guardando…" : "Guardar cuenta"}</button>
      <Toast message={message} />
    </form>
  );
}

/** Conductor: datos de la moto (placa única, modelo y color). Se muestran al pasajero cuando le asignan el viaje. */
export function DriverVehicle() {
  const { client, data, setData } = useDriverData();
  const [form, setForm] = useState({ plate: "", model: "", color: "" }), [busy, setBusy] = useState(false);
  const { message, notify } = useNotice("driver-vehicle");
  useEffect(() => { if (data?.vehicle) setForm(data.vehicle); }, [data]);
  const loaded = data !== null;
  return (
    <form className="trip-card" onSubmit={async e => {
      e.preventDefault(); setBusy(true);
      const { data: next, error } = await client.rpc("save_my_vehicle", form);
      setBusy(false);
      if (error) { notify(ERRORS[error.message] || "No pudimos guardar los datos de tu moto."); return; }
      setData(next as DriverData); notify("Los datos de tu moto se guardaron.");
    }}>
      <h2>Mi moto</h2>
      <p className="muted">El pasajero verá estos datos para reconocerte al llegar. Son necesarios para que la administración apruebe tu cuenta.</p>
      <label>Placa<input value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value.toUpperCase() })} placeholder="AB123CD" maxLength={10} autoCapitalize="characters" required disabled={!loaded || busy} /></label>
      <div className="two">
        <label>Modelo<input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Bera SBR" maxLength={60} required disabled={!loaded || busy} /></label>
        <label>Color<input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Rojo" maxLength={30} required disabled={!loaded || busy} /></label>
      </div>
      <button className="primary" disabled={!loaded || busy}>{busy ? "Guardando…" : "Guardar moto"}</button>
      <Toast message={message} />
    </form>
  );
}
