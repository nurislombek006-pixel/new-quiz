import test from 'node:test';
import assert from 'node:assert/strict';
import {auth} from '../src/worker.js';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const hex=a=>Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,'0')).join('');
async function sign(token,fields){
  const p=new URLSearchParams(fields),encoder=new TextEncoder();
  const k0=await crypto.subtle.importKey('raw',encoder.encode('WebAppData'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const raw=await crypto.subtle.sign('HMAC',k0,encoder.encode(token));
  const k=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const msg=Array.from(p.entries()).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
  p.set('hash',hex(await crypto.subtle.sign('HMAC',k,encoder.encode(msg))));
  return p.toString();
}
test('Accepts only signed Telegram initData',async()=>{
  const token='123456:FAKE_TEST_BOT_TOKEN';
  const signed=await sign(token,{auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:987654321,first_name:'Test',username:'testname'})});
  const req=new Request('https://example.com/api/session',{headers:{'X-Telegram-Init-Data':signed}});
  assert.equal((await auth(req,{BOT_TOKEN:token})).id,'987654321');
  const bad=new URLSearchParams(signed);bad.set('user',JSON.stringify({id:987654322}));
  const forged=new Request('https://example.com/api/session',{headers:{'X-Telegram-Init-Data':bad.toString()}});
  assert.equal(await auth(forged,{BOT_TOKEN:token}),null);
});
test('Rejects stale signed credentials',async()=>{
  const token='123456:FAKE_TEST_BOT_TOKEN';
  const signed=await sign(token,{auth_date:String(Math.floor(Date.now()/1000)-100000),user:JSON.stringify({id:987654321})});
  assert.equal(await auth(new Request('https://example.com',{headers:{'X-Telegram-Init-Data':signed}}),{BOT_TOKEN:token}),null);
});
