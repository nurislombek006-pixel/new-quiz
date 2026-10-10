import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
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
  crypto:webcrypto,TextEncoder,URLSearchParams,
  getAppBotToken:env=>env.APP_BOT_TOKEN
};
vm.runInNewContext(testFns+'\n'+adminFns+'\n' +
  'globalThis.tests={verifyTelegramInitData,adminOwnerOk,ADMIN_OWNER_TELEGRAM_ID};',sandbox);
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
  assert.match(website,/admin-embed\.js\?v=1/);
  assert.match(embeddedScript,/\/api\/admin\/me/);
  assert.match(embedded,/ownerInitData\(\)/);
  assert.doesNotMatch(embedded,/X-Admin-Secret/);
  assert.match(backend,/const auth = await adminOwnerOk\(request, env\)/);
});
