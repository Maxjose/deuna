import test from 'node:test';
import assert from 'node:assert/strict';
import {installPlatform,requiresInstallation} from '../src/lib/install-platform.ts';
test('mobile browsers require installation while desktop, installed PWA and TWA can enter',()=>{
 assert.equal(installPlatform('Mozilla Android Mobile',5),'android');
 assert.equal(installPlatform('Mozilla iPhone',5),'ios');
 assert.equal(installPlatform('Mozilla Macintosh',5),'ios');
 assert.equal(installPlatform('Mozilla Windows NT',10),'desktop');
 assert.equal(installPlatform('Mozilla Macintosh',0),'desktop');
 assert.equal(requiresInstallation('android',false,false),true);
 assert.equal(requiresInstallation('ios',false,false),true);
 assert.equal(requiresInstallation('desktop',false,false),false);
 assert.equal(requiresInstallation('ios',true,false),false);
 assert.equal(requiresInstallation('android',false,true),false);
});
