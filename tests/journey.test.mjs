import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeRoute,decodePlaces,parseStoredPlace} from '../src/lib/journey.ts';
test('ruta GeoJSON conserva el orden latitud/longitud para Leaflet',()=>{
 assert.deepEqual(decodeRoute({code:'Ok',routes:[{geometry:{coordinates:[[-71.60,11.08],[-71.61,11.09]]}}]}),[[11.08,-71.60],[11.09,-71.61]]);
});
test('una ruta fallida o inválida no se dibuja como un recorrido válido',()=>{
 for(const value of [{code:'NoRoute'},{code:'Ok',routes:[]},{code:'Ok',routes:[{geometry:{coordinates:[[0,0],[null,11]]}}]},{code:'Ok',routes:[{geometry:{coordinates:[[0,0],[200,100]]}}]}])assert.throws(()=>decodeRoute(value));
});
test('resultados de lugares inválidos se omiten y el texto queda limitado',()=>{
 const result=decodePlaces({features:[null,{geometry:{coordinates:[-71.6,11.08]},properties:{name:'Plaza',city:'El Moján'}},{geometry:{coordinates:[999,999]},properties:{name:'Inválido'}}]});
 assert.equal(result.length,1);assert.deepEqual(result[0],{label:'Plaza, El Moján',point:{lat:11.08,lng:-71.6}});
});
test('espera recupera los puntos guardados y mantiene compatibilidad con viajes anteriores',()=>{
 assert.deepEqual(parseStoredPlace('Mi ubicación · (11.08000, -71.60000)'),{label:'Mi ubicación',point:{lat:11.08,lng:-71.6}});
 assert.deepEqual(parseStoredPlace('Entrada principal'),{label:'Entrada principal',point:null});
 assert.equal(parseStoredPlace('Fuera · (99, 999)').point,null);
});
