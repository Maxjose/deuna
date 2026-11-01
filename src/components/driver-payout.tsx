"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { VE_BANKS, cleanPhone } from "@/lib/payments";
import { Toast, useNotice } from "./toast";

type Payout = { bank: string; id_number: string; phone: string };

/** Conductor: datos de pago móvil para recibir sus pagos (banco, cédula y teléfono). */
export function DriverPayout() {
  const client = browserClient();
  const [data, setData] = useState<Payout>({ bank: "", id_number: "", phone: "" });
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const { message, notify } = useNotice("driver-payout");
  useEffect(() => {
    void client.auth.getUser().then(({ data: { user } }) => {
      const saved = user?.user_metadata?.payout as Partial<Payout> | undefined;
      if (saved) setData({ bank: saved.bank || "", id_number: saved.id_number || "", phone: saved.phone || "" });
      setLoaded(true);
    });
  }, [client]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const id = data.id_number.replace(/[^0-9]/g, ""), phone = cleanPhone(data.phone);
    if (!data.bank) { notify("Selecciona tu banco."); return; }
    if (!/^\d{5,9}$/.test(id)) { notify("Escribe una cédula válida, solo números."); return; }
    if (!phone) { notify("Escribe un teléfono válido, por ejemplo 0412 1234567."); return; }
    setBusy(true);
    const { error } = await client.auth.updateUser({ data: { payout: { bank: data.bank, id_number: id, phone } } });
    setBusy(false);
    if (error) { notify("No pudimos guardar tu cuenta. Inténtalo de nuevo."); return; }
    setData({ bank: data.bank, id_number: id, phone });
    notify("Tu cuenta de pago móvil se guardó.");
  }
  return (
    <form className="trip-card" onSubmit={save}>
      <h2>Pago móvil</h2>
      <p className="muted">Registra la cuenta donde quieres recibir tus pagos.</p>
      <label>Banco
        <select value={data.bank} disabled={!loaded || busy} onChange={(e) => setData({ ...data, bank: e.target.value })} required>
          <option value="">Selecciona tu banco</option>
          {VE_BANKS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
        </select>
      </label>
      <label>Cédula<input inputMode="numeric" placeholder="12345678" value={data.id_number} disabled={!loaded || busy} onChange={(e) => setData({ ...data, id_number: e.target.value })} required /></label>
      <label>Teléfono<input type="tel" inputMode="tel" placeholder="0412 1234567" value={data.phone} disabled={!loaded || busy} onChange={(e) => setData({ ...data, phone: e.target.value })} required /></label>
      <button className="primary" disabled={!loaded || busy}>{busy ? "Guardando…" : "Guardar cuenta"}</button>
      <Toast message={message} />
    </form>
  );
}
