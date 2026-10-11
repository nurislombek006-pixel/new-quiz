import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto, generateKeyPairSync, sign as ed25519Sign} from 'node:crypto';
import vm from 'node:vm';

const backend=readFileSync('netlify/functions/api.mjs','utf8');
const website=readFileSync('public/index.html','utf8');
const embedded=readFileSync('public/admin/index.html','utf8');
const embeddedScript=readFileSync('public/admin-embed.js','utf8');

function excerpt(src,from,to){
  const i=src.indexOf(from),j=src.indexOf(to,i+from.length);
  assert.ok(i>=0&&j>i,'source section must be present: '+from);
  return src.slice(i,j);
}

const testFns=excerpt(backend,'function textEncoder(){','function getAppBotToken(env){');
const adminFns=excerpt(backend,'const ADMIN_OWNER_TELEGRAM_ID','function todayIso()');
const sandbox={
  crypto:webcrypto,TextEncoder,URLSearchParams,atob,
  getAppBotToken:env=>env.APP_BOT_TOKEN
};
vm.runInNewContext(testFns+'\n'+adminFns+'\n' +
  'globalThis.tests={verifyTelegramInitData,verifyTelegramPublicSignature,adminOwnerOk,ADMIN_OWNER_TELEGRAM_ID,MINI_APP_BOT_ID};',sandbox);
const funcs=sandbox.tests;

const encoder=new TextEncoder();
async function hmac(key,data){
  const k=await webcrypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await webcrypto.subtle.sign('HMAC',k,encoder.encode(data)));
}
const hex=buf=>Array.from(buf,x=>x.toString(16).padStart(2,'0')).join('');
const token='123456789:FAKE_TEST_KEY_abcdefghijklmnopqrstuvwxyz';
async function sign(fields,withToken=token){
  const p=new URLSearchParams(fields);
  const msg=Array.from(p.entries()).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>k+'='+v).join('\n');
  const secret=await hmac(encoder.encode('WebAppData'),withToken);
  p.set('hash',hex(await hmac(secret,msg)));
  return p.toString();
}
function request(data){
  return new Request('https://test.netlify.app/api/admin/me',{headers:{'X-Telegram-Init-Data':data}});
}
const newFields=id=>({auth_date:String(Math.floor(Date.now()/1000)),query_id:'test-01',user:JSON.stringify({id,first_name:'Test'})});

test('Only the owner Telegram account is authorized',async()=>{
  assert.equal(funcs.ADMIN_OWNER_TELEGRAM_ID,'5305261101');
  const owner=await funcs.adminOwnerOk(request(await sign(newFields(5305261101))),{APP_BOT_TOKEN:token});
  assert.equal(owner.ok,true);
  const other=await funcs.adminOwnerOk(request(await sign(newFields(123456789))),{APP_BOT_TOKEN:token});
  assert.equal(other.ok,false);
  assert.equal(other.status,403);
});

test('Forged Telegram user ID is rejected',async()=>{
  const data=new URLSearchParams(await sign(newFields(123456789)));
  data.set('user',JSON.stringify({id:5305261101,first_name:'Test'}));
  assert.equal((await funcs.adminOwnerOk(request(data.toString()),{APP_BOT_TOKEN:token})).ok,false);
});

test('Expired Telegram sessions and wrong tokens are rejected',async()=>{
  const old=await sign({...newFields(5305261101),auth_date:String(Math.floor(Date.now()/1000)-172800)});
  assert.equal((await funcs.adminOwnerOk(request(old),{APP_BOT_TOKEN:token})).ok,false);
  const valid=await sign(newFields(5305261101));
  assert.equal((await funcs.adminOwnerOk(request(valid),{APP_BOT_TOKEN:'different_test_bot_token'})).ok,false);
});

test('A missing signature never authorizes admin',async()=>{
  assert.equal((await funcs.adminOwnerOk(request('user=%7B%22id%22%3A5305261101%7D'),{APP_BOT_TOKEN:token})).ok,false);
});

test('Regular UI no longer shows mistake/progress counters',()=>{
  assert.doesNotMatch(website,/id="mistakes-count"/);
  assert.doesNotMatch(website,/id="study-progress-chip"/);
  assert.doesNotMatch(website,/id="study-progress-text"/);
  assert.match(website,/admin-embed\.js\?v=4/);
  assert.match(embeddedScript,/OWNER_ID='5305261101'/);
  assert.match(embeddedScript,/async function checkOwner\(force=false\)/);
  assert.match(embeddedScript,/if\(!authorized\)return/);
  assert.match(embeddedScript,/response\.ok&&result\?\.ok===true&&result\?\.admin===true/);
  assert.match(embeddedScript,/\.subject-switch-wrap/);
  assert.match(embedded,/ownerInitData\(\)/);
  assert.doesNotMatch(embedded,/X-Admin-Secret/);
  assert.match(backend,/const auth = await adminOwnerOk\(request, env\)/);
});

test('Inline page scripts parse as JavaScript',()=>{
  for(const [file,html] of [['public/index.html',website],['public/admin/index.html',embedded]]){
    const chunks=Array.from(html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),m=>m[1]);
    assert.ok(chunks.length>0,file+' should contain inline scripts');
    chunks.forEach((s,i)=>assert.doesNotThrow(()=>new vm.Script(s),file+' inline script '+i));
  }
});

test('Owner can authenticate when APP_BOT_TOKEN is stale but BOT_TOKEN matches',async()=>{
  const signed=await sign(newFields(5305261101));
  const state=await funcs.adminOwnerOk(request(signed),{
    APP_BOT_TOKEN:'12345:old_token_not_for_this_mini_app',
    BOT_TOKEN:token
  });
  assert.equal(state.ok,true);
});

test('Admin APIs reject when Netlify bot tokens are missing',async()=>{
  const signed=await sign(newFields(5305261101));
  const result=await funcs.adminOwnerOk(request(signed),{});
  assert.equal(result.ok,false);
  assert.equal(result.status,503);
  assert.equal(result.code,'TELEGRAM_BOT_NOT_CONFIGURED');
});

test('Owner authorization explains invalid Netlify token without exposing token values',async()=>{
  const signed=await sign(newFields(5305261101));
  const result=await funcs.adminOwnerOk(request(signed),{APP_BOT_TOKEN:'not_valid_for_current_bot'});
  assert.equal(result.ok,false);
  assert.equal(result.code,'TELEGRAM_SIGNATURE_INVALID');
  assert.ok(!JSON.stringify(result).includes('not_valid_for_current_bot'));
});

test('Public-key verification authenticates actual bot and Telegram owner only',async()=>{
  assert.equal(funcs.MINI_APP_BOT_ID,'8840247539');
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const keyHex=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
  function signedPublicInit(id,botId='8840247539',old=false){
    const fields=newFields(id);
    if(old)fields.auth_date=String(Math.floor(Date.now()/1000)-172800);
    const p=new URLSearchParams(fields);
    const dataString=Array.from(p.entries()).sort(([a],[b])=>a<b?-1:a>b?1:0)
      .map(([k,v])=>k+'='+v).join('\n');
    const signedString=botId+':WebAppData\n'+dataString;
    const sig=ed25519Sign(null,Buffer.from(signedString),privateKey).toString('base64url');
    p.set('signature',sig);
    p.set('hash','0'.repeat(64)); // Telegram's hash is separate from the public key signature.
    return p.toString();
  }
  const signedOwner=signedPublicInit(5305261101);
  const owner=await funcs.verifyTelegramPublicSignature(signedOwner,'8840247539',keyHex);
  assert.equal(owner?.id,5305261101);
  assert.equal((await funcs.verifyTelegramPublicSignature(signedOwner,'8621435012',keyHex)),null);
  assert.equal((await funcs.verifyTelegramPublicSignature(signedPublicInit(5305261101,'8621435012'),'8840247539',keyHex)),null);
  const forged=new URLSearchParams(signedOwner);
  forged.set('user',JSON.stringify({id:123456789}));
  assert.equal((await funcs.verifyTelegramPublicSignature(forged.toString(),'8840247539',keyHex)),null);
  assert.equal((await funcs.verifyTelegramPublicSignature(signedPublicInit(5305261101,'8840247539',true),'8840247539',keyHex)),null);
  const malformed=new URLSearchParams(signedOwner);
  malformed.delete('signature');
  assert.equal((await funcs.verifyTelegramPublicSignature(malformed.toString(),'8840247539',keyHex)),null);
  assert.equal((await funcs.verifyTelegramPublicSignature(signedOwner,'8840247539','0'.repeat(64))),null);
});
test('A failed HMAC may fall back only to genuine Telegram Ed25519 signature for configured Mini App bot',()=>{
  assert.match(backend,/signedUser = await verifyTelegramPublicSignature\(initData, MINI_APP_BOT_ID\)/);
  assert.match(backend,/const TELEGRAM_ED25519_PRODUCTION_KEY = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d'/);
  assert.doesNotMatch(backend,/allowUntrustedAccess\(env\).*return \{ok:true\}/);
});
