import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSearchUrl, localPlaces,mergeSearchPlaces,placeDistanceMeters } from '../src/lib/journey.ts';
import { serviceIsOpen } from '../src/lib/service-hours.ts';
test('búsqueda prioriza la recogida en Zulia y limita país y región', () => {
  const url = placeSearchUrl('https://photon.komoot.io/api/', 'Plaza', { lat: 10.65, lng: -71.6 });
  assert.equal(url.searchParams.get('countrycode'), 'VE');
  assert.equal(url.searchParams.get('lat'), '10.65');
  assert.equal(url.searchParams.get('bbox'), '-73.5,8.3,-70.5,12.6');
  assert.equal(placeSearchUrl(url.origin, 'Plaza', {lat:40,lng:-3}).searchParams.get('lat'), '11.087');
});
test('descarta países y estados ajenos y ordena por cercanía', () => {
  const feature = (name, lat, lng, countrycode='VE',state='Zulia') => ({ properties:{name,countrycode,state}, geometry:{coordinates:[lng,lat]} });
  const body = {features:[feature('Lejos',9,-71), feature('Cerca',11.08,-71.6),feature('España',40,-3,'ES','Madrid'),feature('Colombia',11,-72,'CO'),feature('Otro estado',9,-71,'VE','Mérida')]};
  assert.deepEqual(localPlaces(body, null).map(p=>p.label),['Cerca, Zulia','Lejos, Zulia']);
});
test('horario coincide con servidor, incluyendo medianoche y 24 horas', () => {
  const settings={enabled:true,open_time:'06:00:00',close_time:'22:00:00'};
  assert.equal(serviceIsOpen(settings,new Date('2026-10-30T03:47:00Z')), false);
  assert.equal(serviceIsOpen({...settings,close_time:'05:00:00'},new Date('2026-10-30T03:47:00Z')), true);
  assert.equal(serviceIsOpen({...settings,close_time:'06:00:00'}), true);
  assert.equal(serviceIsOpen({...settings,enabled:false}), false);
});
test('áreas de búsqueda se amplían alrededor del usuario sin salir del rango regional',()=>{
 const center={lat:11.087,lng:-71.603};
 const box=radius=>placeSearchUrl('https://photon.komoot.io/api/','pizzería',center,radius).searchParams.get('bbox').split(',').map(Number);
 const small=box(5),medium=box(20),large=box(80);
 assert.ok(small[0]>medium[0]&&medium[0]>large[0]);assert.ok(small[2]<medium[2]&&medium[2]<large[2]);
 const edge=placeSearchUrl('https://photon.komoot.io/api/','pizza',{lat:12.59,lng:-73.49},80).searchParams.get('bbox').split(',').map(Number);
 assert.ok(edge[0]>=-73.5&&edge[3]<=12.6);
});
test('mezcla por cercanía antes de limitar, aunque el catálogo tenga ocho resultados lejanos',()=>{
 const center={lat:11.087,lng:-71.603};
 const catalog=Array.from({length:8},(_,i)=>({label:`Lejos ${i}`,point:{lat:11.5+i*.01,lng:-71.6}}));
 const close={label:'Pizzería cercana',point:{lat:11.088,lng:-71.603}};
 const merged=mergeSearchPlaces(catalog,[close],center);
 assert.equal(merged.length,8);assert.equal(merged[0],close);
 assert.ok(placeDistanceMeters(close.point,center)<200);
});
