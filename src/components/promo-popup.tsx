"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { closeOnBackdrop } from "@/lib/dialog";

type Promo = { id: string; title: string; image_url: string; link_url: string | null };

/** Promoción emergente en Inicio: se muestra una vez por publicación; al cerrarla o tocarla no vuelve a salir. */
export function PromoPopup({ enabled }: { enabled: boolean }) {
  const client = useMemo(() => browserClient(), []);
  const dialog = useRef<HTMLDialogElement>(null), dismissed = useRef(false);
  const [promo, setPromo] = useState<Promo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void client.rpc("my_promo").then(({ data, error }) => {
      if (!alive || error || !data) return;
      const next = data as Promo, img = new Image();
      // Se abre cuando la imagen ya cargó, para que aparezca completa.
      img.onload = () => { if (alive) { dismissed.current = false; setPromo(next); } };
      img.src = next.image_url;
    });
    return () => { alive = false; };
  }, [client, enabled]);
  useEffect(() => { if (promo && !dialog.current?.open) dialog.current?.showModal(); }, [promo]);
  const dismiss = useCallback(() => {
    if (!promo || dismissed.current) return;
    dismissed.current = true;
    void client.rpc("dismiss_promo", { promo_id: promo.id });
  }, [client, promo]);
  if (!promo) return null;
  const image = <img src={promo.image_url} alt={promo.title} />;
  return <dialog ref={dialog} className="promo-popup" aria-label={promo.title} onClose={dismiss} onClick={closeOnBackdrop}>
    <button type="button" className="promo-popup-close" aria-label="Cerrar promoción" onClick={() => dialog.current?.close()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
    {promo.link_url ? <a href={promo.link_url} target="_blank" rel="noopener noreferrer" onClick={() => dialog.current?.close()}>{image}</a> : image}
  </dialog>;
}
