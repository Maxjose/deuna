"use client";
import { useEffect, useState } from "react";
import { AppIcon } from "./app-icon";

const banners = [
  { title: "Tu negocio, más cerca", text: "Un espacio para conectar con quienes se mueven por aquí.", icon: "package" as const },
  { title: "Lo bueno está cerca", text: "Aquí encontrarás promociones de negocios locales.", icon: "ride" as const },
  { title: "Novedades en tu camino", text: "Este espacio está reservado para próximos anunciantes.", icon: "calendar" as const },
];

export function PromoBanners({ hidden = false }: { hidden?: boolean }) {
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (hidden || interacting || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex(current => (current + 1) % banners.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [hidden, interacting, reducedMotion]);
  return <section className="promo-carousel" aria-label="Promociones y publicidad" aria-roledescription="carrusel"
    onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
    onFocusCapture={() => setInteracting(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setInteracting(false); }}>
    <div className="promo-window">
      <div className="promo-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {banners.map((banner, i) => <article key={banner.title} className={`promo-banner promo-banner-${i}`} aria-hidden={index !== i}>
          <div><small>ESPACIO PUBLICITARIO</small><h3>{banner.title}</h3><p>{banner.text}</p></div>
          <span className="promo-art" aria-hidden="true"><AppIcon name={banner.icon} /></span>
        </article>)}
      </div>
    </div>
    <div className="promo-controls">
      <div className="promo-dots">{banners.map((banner, i) => <button key={banner.title} type="button" aria-label={`Ver banner ${i + 1}`} aria-pressed={index === i} onClick={() => setIndex(i)}><span /></button>)}</div>
    </div>
  </section>;
}
