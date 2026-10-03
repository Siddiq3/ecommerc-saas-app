const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(status, tokens) {
 let cleared = 0;
 const ctx = { API_VERSION:'v1', process:{env:{}}, AbortController, setTimeout, clearTimeout, loadSession:async()=>({accessToken:'old',accessTokenExpiresAt:'2000-01-01',refreshToken:'refresh'}), saveTokens:async()=>{}, clearSession:async()=>{cleared++;}, fetch:async()=>({status,ok:status===200,text:async()=>JSON.stringify({data:{tokens}})}) };
 vm.createContext(ctx);
 const source=fs.readFileSync('src/api/client.js','utf8').replace(/^import .*;\s*$/gm,'').replace(/export /g,'');
 vm.runInContext(source+'\nglobalThis.run=()=>request("GET","/auth/me");',ctx);
 return {run:ctx.run,cleared:()=>cleared};
}
for(const status of [403,429,500,503]) test(`refresh ${status} preserves stored credentials`,async()=>{const s=setup(status);await assert.rejects(s.run());assert.equal(s.cleared(),0);});
test('malformed successful refresh preserves credentials',async()=>{const s=setup(200,{});await assert.rejects(s.run());assert.equal(s.cleared(),0);});
test('rejected refresh clears credentials',async()=>{const s=setup(401);await assert.rejects(s.run());assert.equal(s.cleared(),1);});
