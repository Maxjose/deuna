import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {decodeCatalogPlaces} from '../src/lib/catalog.ts';

// Exercise the real selection handler without starting GPS, geocoding or React effects.
const source=ts.createSourceFile('ride-request.tsx',readFileSync(new URL('../src/components/ride-request.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='selectPlace')handler=node;ts.forEachChild(node,visit);}
visit(source);
assert.ok(handler);
const code=ts.transpileModule(handler.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(active='destination'){
 const state={origin:{label:'Anterior',point:{lat:11,lng:-71}},destination:null,mapReferences:{origin:true,destination:true},quote:{price:1},routeReady:true};
 const refs={searchVersion:{current:7},locationVersion:{current:4},searchController:{current:{abort(){state.aborted=true;}}},typingTimer:{current:1},missingTimer:{current:2}};
 const context={active,...refs,clearTimeout:id=>{(state.cleared??=[]).push(id);}};
 for(const key of ['origin','destination','mapReferences','results','loading','mapVisible','mapCompact','quote','routeReady','message','locating']){
  context['set'+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=typeof value==='function'?value(state[key]):value;};
 }
 runInNewContext(code+';this.select=selectPlace;',context);
 return {state,refs,select:context.select};
}
const place=decodeCatalogPlaces([{name:'Farmacia Central',latitude:11.087,longitude:-71.603}])[0];
test('negocio elegido como destino conserva nombre y coordenadas sin pedir referencia',()=>{
 const f=fixture();f.select(place);
 assert.deepEqual(f.state.destination,place);
 assert.equal(f.state.mapReferences.destination,false);
 assert.equal(f.state.mapReferences.origin,true);
 assert.equal(f.state.quote,null);assert.equal(f.state.routeReady,false);
 assert.equal(f.state.mapVisible,true);assert.equal(f.state.loading,false);
 assert.equal(f.state.aborted,true);assert.equal(f.refs.searchVersion.current,8);
 assert.deepEqual(f.state.cleared,[1,2]);
});
test('seleccionar recogida invalida el GPS pendiente y la referencia de ese campo',()=>{
 const f=fixture('origin');f.select(place);
 assert.deepEqual(f.state.origin,place);
 assert.equal(f.state.mapReferences.origin,false);
 assert.equal(f.state.mapReferences.destination,true);
 assert.equal(f.refs.locationVersion.current,5);
 assert.equal(f.state.locating,false);
});
test('vista previa cambia solo el destino; un lugar incompleto no modifica la selección',()=>{
 const f=fixture('origin');f.select(place,'destination');
 assert.deepEqual(f.state.destination,place);assert.equal(f.state.origin.label,'Anterior');
 const empty=fixture();empty.select({label:'Sin punto',point:null});
 assert.equal(empty.refs.searchVersion.current,7);assert.equal(empty.state.destination,null);
});
