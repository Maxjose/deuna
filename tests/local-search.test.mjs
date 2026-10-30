import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSearchUrl, localPlaces } from '../src/lib/journey.ts';
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
