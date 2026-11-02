import type { MapPoint } from './destination';
export type NavigationFix = MapPoint & { accuracy:number; timestamp:number };
export function googleNavigationUrl(destination:MapPoint|null){
 if(!destination||!Number.isFinite(destination.lat)||!Number.isFinite(destination.lng)||Math.abs(destination.lat)>90||Math.abs(destination.lng)>180)return null;
 const url=new URL('https://www.google.com/maps/dir/');
 url.search=new URLSearchParams({api:'1',destination:`${destination.lat},${destination.lng}`,travelmode:'driving',dir_action:'navigate'}).toString();
 return url.toString();
}
export function usableFix(fix:NavigationFix,now:number){
 return Number.isFinite(fix.lat)&&Math.abs(fix.lat)<=90&&Number.isFinite(fix.lng)&&Math.abs(fix.lng)<=180&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=1500&&Number.isFinite(fix.timestamp)&&now-fix.timestamp<=30000&&fix.timestamp<=now+5000;
}
/** Acepta señal imprecisa (interiores, ubicación aproximada); la ruta se recalcula al mejorar la precisión. */
export function refreshNavigationRoute(previous:{point:MapPoint;at:number;accuracy?:number}|null,next:MapPoint&{accuracy?:number},now:number){
 if(!previous)return true;
 if((previous.accuracy??0)>150&&(next.accuracy??Infinity)<=100)return true;
 const radians=Math.PI/180,lat=(next.lat-previous.point.lat)*radians,lng=(next.lng-previous.point.lng)*radians;
 const a=Math.sin(lat/2)**2+Math.cos(previous.point.lat*radians)*Math.cos(next.lat*radians)*Math.sin(lng/2)**2;
 const meters=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
 return now-previous.at>=30000&&meters>=50;
}
