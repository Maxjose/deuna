import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeKind} from '../src/lib/notice-kind.ts';
test('notification icons distinguish errors, confirmations, guidance and information',()=>{
 assert.equal(noticeKind('No pudimos guardar los datos.'),'error');
 assert.equal(noticeKind('Tu contraseña se actualizó.'),'success');
 assert.equal(noticeKind('Escribe una referencia para la recogida y el destino.'),'warning');
 assert.equal(noticeKind('Recibirás noticias aquí.'),'info');
});
