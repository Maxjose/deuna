import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { validPushEndpoint } from '../src/lib/push.ts';
test('push permite solo endpoints HTTPS de proveedores conocidos',()=>{
  for(const url of ['https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a','https://web.push.apple.com/a'])assert.equal(validPushEndpoint(url),true);
  for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.com/a','https://localhost/a','https://127.0.0.1/a','https://fcm.googleapis.com:8443/a','https://user@fcm.googleapis.com/a','https://web.push.apple.com/a#secret'])assert.equal(validPushEndpoint(url),false);
});
test('service worker muestra el aviso y abre solo Inicio, aunque el mensaje traiga una URL externa',async()=>{
  const events={},shown=[];let opened='';
  const self={location:{origin:'https://deuna-five.vercel.app'},addEventListener:(name,fn)=>events[name]=fn,
    registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[],openWindow:async(url)=>{opened=url;}}};
  vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self,URL});
  let work;events.push({data:{json:()=>({title:'Prueba',body:'Mensaje',url:'https://evil.example/'})},waitUntil:promise=>{work=promise;}});await work;
  assert.equal(shown[0].title,'Prueba');assert.equal(shown[0].options.data.url,'/dashboard#home');
  events.notificationclick({notification:{close(){}},waitUntil:promise=>{work=promise;}});await work;
  assert.equal(opened,'https://deuna-five.vercel.app/dashboard#home');
});
