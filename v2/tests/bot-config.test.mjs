import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encryptToken,decryptToken,currentToken,rotateBotToken,getBotStatus} from '../src/bot-config.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const TEST_TOKEN='123456789:'+'A'.repeat(36);
const NEW_TOKEN='987654321:'+'B'.repeat(36);
function database(){
  const state={ciphertext:null,changed:0};
  return {
    state,
    prepare(sql){
      return {
        async first(){return state.ciphertext?{ciphertext:state.ciphertext}:null},
        bind(...args){
          return {async run(){
            if(sql.startsWith('INSERT INTO bot_settings'))state.ciphertext=args[0];
            else if(sql.startsWith('UPDATE bot_settings'))state.ciphertext=args[0];
            else if(sql.startsWith('DELETE FROM bot_settings'))state.ciphertext=null;
            state.changed++;
          }};
        },
        async run(){
          if(sql.startsWith('DELETE FROM bot_settings')){state.ciphertext=null;state.changed++;}
        }
      };
    }
  };
}
function environment(db){
  return {DB:db,BOT_TOKEN:TEST_TOKEN,BOT_TOKEN_ENCRYPTION_KEY:'example-very-long-random-master-key-123456789',
    WEBHOOK_SECRET:'a-very-long-webhook-secret-for-tests',PUBLIC_URL:'https://quiz.example.workers.dev'};
}
test('Token encryption roundtrip, different IV and key rejection',async()=>{
  const env=environment(database());
  const a=await encryptToken(TEST_TOKEN,env);
  const b=await encryptToken(TEST_TOKEN,env);
  assert.notEqual(a,b);
  assert.ok(!a.includes(TEST_TOKEN));
  assert.equal(await decryptToken(a,env),TEST_TOKEN);
  await assert.rejects(decryptToken(a,{...env,BOT_TOKEN_ENCRYPTION_KEY:'incorrect master key with many characters'}));
});
test('Loads bootstrap token until an encrypted token is configured',async()=>{
  const db=database(),env=environment(db);
  assert.equal(await currentToken(env),TEST_TOKEN);
  db.state.ciphertext=await encryptToken(NEW_TOKEN,env);
  assert.equal(await currentToken(env),NEW_TOKEN);
});
test('Owner rotates token and webhook without ever returning token',async()=>{
  const db=database(),env=environment(db);
  const fetch0=globalThis.fetch, calls=[];
  globalThis.fetch=async(url,opts)=>{
    const endpoint=String(url).split('/').at(-1),payload=JSON.parse(opts.body);
    calls.push({endpoint,payload,url:String(url)});
    if(endpoint==='getMe')return Response.json({ok:true,result:{id:456,is_bot:true,username:'new_example_bot',first_name:'New'}});
    return Response.json({ok:true,result:true});
  };
  try{
    const result=await rotateBotToken(env,NEW_TOKEN);
    assert.equal(result.username,'new_example_bot');
    assert.equal(await currentToken(env),NEW_TOKEN);
    assert.equal(calls.find(x=>x.endpoint==='setWebhook').payload.url,'https://quiz.example.workers.dev/api/telegram-webhook');
    assert.equal(calls.find(x=>x.endpoint==='setWebhook').payload.secret_token,env.WEBHOOK_SECRET);
    assert.ok(calls.some(x=>x.endpoint==='deleteWebhook'));
    assert.ok(!JSON.stringify(result).includes(NEW_TOKEN));
    const status=await getBotStatus(env);
    assert.equal(status.username,'new_example_bot');
    assert.ok(!JSON.stringify(status).includes(NEW_TOKEN));
  }finally{globalThis.fetch=fetch0;}
});
test('New token is not committed if Telegram webhook registration fails',async()=>{
  const db=database(),env=environment(db),fetch0=globalThis.fetch;
  globalThis.fetch=async url=>{
    const action=String(url).split('/').at(-1);
    if(action==='getMe')return Response.json({ok:true,result:{id:456,is_bot:true}});
    return Response.json({ok:false,description:'Telegram rejected webhook'},{status:400});
  };
  try{
    await assert.rejects(rotateBotToken(env,NEW_TOKEN),/Telegram rejected webhook/);
    assert.equal(await currentToken(env),TEST_TOKEN);
    assert.equal(db.state.ciphertext,null);
  }finally{globalThis.fetch=fetch0;}
});
