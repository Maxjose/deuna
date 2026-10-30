import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedPointLabel,parseStoredPlace} from '../src/lib/journey.ts';
import {destinationLabel} from '../src/lib/destination.ts';
test('el nombre cercano no sustituye las coordenadas marcadas en el mapa',()=>{
 const picked={lat:11.087,lng:-71.603};
 const response={features:[{geometry:{coordinates:[-71.6032,11.0872]},properties:{name:'Plaza local',city:'El Moján'}}]};
 const label=selectedPointLabel(response,picked);
 assert.match(label,/Plaza local/);
 assert.deepEqual(parseStoredPlace(destinationLabel(label,picked)),{label,point:picked});
});
test('no usa nombres de lugares lejanos ni inventa referencias si falla el proveedor',()=>{
 const picked={lat:11.087,lng:-71.603};
 assert.equal(selectedPointLabel({features:[]},picked),'');
 assert.equal(selectedPointLabel({features:[{geometry:{coordinates:[-70,10]},properties:{name:'Otro lugar'}}]},picked),'');
});
