import type { MapPoint } from './destination';
export type NavigationFix = MapPoint & { accuracy:number; timestamp:number };
export function usableFix(fix:NavigationFix,now:number){
 return Number.isFinite(fix.lat)&&Math.abs(fix.lat)<=90&&Number.isFinite(fix.lng)&&Math.abs(fix.lng)<=180&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=100&&Number.isFinite(fix.timestamp)&&now-fix.timestamp<=20000&&fix.timestamp<=now+5000;
}
export function refreshNavigationRoute(previous:{point:MapPoint;at:number}|null,next:MapPoint,now:number){
 if(!previous)return true;
 const radians=Math.PI/180,lat=(next.lat-previous.point.lat)*radians,lng=(next.lng-previous.point.lng)*radians;
 const a=Math.sin(lat/2)**2+Math.cos(previous.point.lat*radians)*Math.cos(next.lat*radians)*Math.sin(lng/2)**2;
 const meters=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
 return now-previous.at>=30000&&meters>=50;
}
