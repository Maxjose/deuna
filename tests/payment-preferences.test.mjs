import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPaymentPreferences} from '../src/lib/payment-preferences.ts';
const client=saved=>({auth:{getUser:async()=>({data:{user:{id:'client',user_metadata:{contact_phone:'04141234567'}}},error:null})},from(table){assert.equal(table,'passenger_payment_preferences');return{select(){return this;},eq(key,value){assert.equal(key,'user_id');assert.equal(value,'client');return this;},maybeSingle:async()=>({data:saved,error:null})};}});
test('payment defaults use saved bank and phone, with profile phone only as fallback',async()=>{
 assert.deepEqual(await loadPaymentPreferences(client(null)),{userId:'client',bank:'',phone:'04141234567'});
 assert.deepEqual(await loadPaymentPreferences(client({bank:'0102',phone:'04121234567'})),{userId:'client',bank:'0102',phone:'04121234567'});
});
