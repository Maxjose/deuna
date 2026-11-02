import test from 'node:test';
import assert from 'node:assert/strict';
import {isOwnDialogEvent} from '../src/lib/dialog.ts';
test('closing a nested contact sheet does not close the navigation map',()=>{
 const navigation={},contact={};
 assert.equal(isOwnDialogEvent({target:contact,currentTarget:navigation}),false);
 assert.equal(isOwnDialogEvent({target:navigation,currentTarget:navigation}),true);
});
