import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyReferencePlaces} from '../src/lib/journey.ts';
test('reference predictions use the marked point, exclude distant places and preserve exact business coordinates',()=>{
 const center={lat:11.08,lng:-71.6};
 const near={label:'Local cercano',point:{lat:11.081,lng:-71.6}};
 const medium={label:'Local mediano',point:{lat:11.09,lng:-71.6}};
 const far={label:'Otro pais',point:{lat:40,lng:-3}};
 const results=nearbyReferencePlaces([medium,far],[near],center);
 assert.deepEqual(results,[near,medium]);assert.strictEqual(results[0].point,near.point);
 assert.deepEqual(nearbyReferencePlaces([{label:'Sin punto',point:null}],[far],center),[]);
});
