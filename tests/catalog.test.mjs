import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCatalogDocument, decodeCatalogPlaces } from '../src/lib/catalog.ts';
import { mergeSearchPlaces } from '../src/lib/journey.ts';
const place={source:'propio',external_id:'local-001',name:'  Farmacia José  ',latitude:11.087,longitude:-71.603};
test('catálogo valida el contrato y mantiene active omitido para conservar el estado existente',()=>{
  const result=validateCatalogDocument({version:1,places:[place]});
  assert.deepEqual(result.errors,[]);assert.equal(result.places[0].name,'Farmacia José');assert.equal(result.places[0].active,undefined);assert.deepEqual(result.places[0].aliases,[]);
});
test('catálogo rechaza coordenadas como texto, campos desconocidos, alias inválidos y parejas repetidas',()=>{
  for(const item of [{...place,latitude:'11.087'},{...place,longitude:181},{...place,latitude:NaN},{...place,aliases:'Pepe'},{...place,active:'true'},{...place,photos:[]},{...place,source_url:'javascript:alert(1)'}])
    assert.ok(validateCatalogDocument({version:1,places:[item]}).errors.length);
  assert.ok(validateCatalogDocument({version:1,places:[place,{...place,name:'Actualizado'}]}).errors.some(error=>error.includes('repetido')));
  assert.ok(validateCatalogDocument({version:1,places:Array.from({length:1001},()=>place)}).errors.length);
});
test('catálogo avisa si un punto válido está fuera del Zulia y rechaza variantes del documento',()=>{
  const result=validateCatalogDocument({version:1,places:[{...place,latitude:0,longitude:0}]});
  assert.equal(result.errors.length,0);assert.equal(result.warnings.length,1);
  for(const input of [null,[],{version:'1',places:[place]},{version:1,places:[]},{version:1,places:[place],extra:true}])assert.ok(validateCatalogDocument(input).errors.length);
});
test('búsqueda combina catálogo primero y elimina duplicados cercanos sin borrar otras sedes',()=>{
  const catalog=decodeCatalogPlaces([{name:'Farmacia José',address:'Calle 1',latitude:11.087,longitude:-71.603},null,{name:'Inválido',latitude:100,longitude:0}]);
  const other=[{label:'Farmacia Jose, Mara',point:{lat:11.0871,lng:-71.6031}},{label:'Farmacia José, Otra sede',point:{lat:11.2,lng:-71.603}},{label:'Panadería, Mara',point:{lat:11.087,lng:-71.603}}];
  const result=mergeSearchPlaces(catalog,other);
  assert.equal(result.length,3);assert.equal(result[0].label,'Farmacia José, Calle 1');
});
test('ejemplo descargable es válido e inactivo y el comando detecta archivos inválidos',()=>{
  const example=JSON.parse(fs.readFileSync('public/catalog/places.example.json','utf8'));
  assert.equal(validateCatalogDocument(example).errors.length,0);assert.equal(example.places[0].active,false);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'deuna-catalog-')),file=path.join(directory,'bad.json');
  try{fs.writeFileSync(file,JSON.stringify({version:1,places:[{...place,latitude:'incorrecta'}]}));const result=spawnSync(process.execPath,['scripts/validate-places.mjs',file],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/latitude/);}
  finally{fs.unlinkSync(file);fs.rmdirSync(directory);}
});
