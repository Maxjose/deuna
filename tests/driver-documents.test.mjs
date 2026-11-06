import test from 'node:test';
import assert from 'node:assert/strict';
import {DOCUMENTS,documentExtension} from '../src/lib/driver-documents.ts';
test('documentos: cinco requisitos y formatos permitidos',()=>{
 assert.equal(new Set(DOCUMENTS.map(([key])=>key)).size,5);
 assert.equal(documentExtension({type:'application/pdf',size:10*1024*1024}),'pdf');
 assert.equal(documentExtension({type:'image/jpeg',size:1}),'jpg');
 assert.equal(documentExtension({type:'image/png',size:1024}),'png');
});
test('documentos: rechaza vacíos, excesivos y contenido activo',()=>{
 for(const file of [{type:'application/pdf',size:0},{type:'image/jpeg',size:10*1024*1024+1},{type:'image/svg+xml',size:100},{type:'text/html',size:100}])assert.throws(()=>documentExtension(file));
});
