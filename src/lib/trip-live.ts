import { parseStoredPlace } from './journey';
import { etaMinutes } from './live-location';

export function tripLiveSummary(trip: {status:string;origin:string;destination:string}, location: {latitude:number;longitude:number;accuracy:number;recorded_at:string}|null, now=Date.now(), driver=false) {
  const status=trip.status;
  const target=parseStoredPlace(status==='ongoing'?trip.destination:trip.origin).point;
  const age=location?now-Date.parse(location.recorded_at):Infinity;
  const eta=location&&target&&age>=-5000&&age<=30000&&location.accuracy<=100
    &&Number.isFinite(location.latitude)&&Math.abs(location.latitude)<=90&&Number.isFinite(location.longitude)&&Math.abs(location.longitude)<=180
    ?etaMinutes({lat:location.latitude,lng:location.longitude},target):null;
  const title=driver?(status==='assigned'?'Recoger al pasajero':status==='arrived'?'En la recogida':'Llevar al pasajero'):(status==='assigned'?'Tu motorizado está en camino':status==='arrived'?'Tu motorizado llegó':'En camino a tu destino');
  const body=driver?(status==='arrived'?'Espera al pasajero para iniciar el viaje.':`${parseStoredPlace(status==='ongoing'?trip.destination:trip.origin).label}${eta!==null?' · '+eta+' min aprox.':''}`):(status==='arrived'?'Prepárate para salir.':eta!==null?`Llegada aproximada: ${eta} min`:'Esperando una ubicación reciente del motorizado.');
  return {status,title,body,eta:status==='arrived'?null:eta};
}
