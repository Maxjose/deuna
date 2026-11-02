/** Cierra un <dialog> modal al tocar fuera de su recuadro (en el fondo oscuro). */
export function isOwnDialogEvent(event:{target:EventTarget;currentTarget:EventTarget}){
  return event.target===event.currentTarget;
}
export function closeOnBackdrop(event: { target: EventTarget; currentTarget: HTMLDialogElement; clientX: number; clientY: number }) {
  const dialog = event.currentTarget;
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
}
