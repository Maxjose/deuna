import test from 'node:test';
import assert from 'node:assert/strict';
import {writeAppHash} from '../src/lib/app-navigation.ts';
test('navigation preserves Next history, clears ride state and never assigns location.hash',()=>{
 const calls=[];const original={__NA:true,tree:['qa'],rideStep:true};
 const target={history:{state:original,pushState:(...args)=>calls.push(args)},location:{get hash(){return '#account/preferences';},set hash(_){throw Error('Fragment navigation started');}}};
 writeAppHash(target,'home');
 assert.deepEqual(calls,[[{__NA:true,tree:['qa'],rideStep:false},'','#home']]);
 assert.equal(original.rideStep,true);
});
test('repeated taps on the current section do not add history entries',()=>{
 const target={history:{state:null,pushState:()=>{throw Error('Duplicate history entry');}},location:{hash:'#account/preferences'}};
 writeAppHash(target,'account/preferences');writeAppHash(target,'#account/preferences');
});
