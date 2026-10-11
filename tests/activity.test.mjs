import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const backend=readFileSync('netlify/functions/api.mjs','utf8');
const page=readFileSync('public/admin/index.html','utf8');
const home=readFileSync('public/index.html','utf8');
const tracker=readFileSync('public/activity-tracker.js','utf8');
const compact=readFileSync('public/admin/compact.js','utf8');
const css=readFileSync('public/admin/compact.css','utf8');

const start=backend.indexOf('const QUIZBOT_ACTIVITY_STORE_NAME');
const end=backend.indexOf('async function handleAdmin',start);
assert.ok(start>0&&end>start,'activity helpers exist before protected admin handler');
const activityCode=backend.slice(start,end);
const mockedUser={id:1100110011,username:'quiz_guest',first_name:'Test',last_name:'User'};
const sandbox={
  Date,Number,Math,JSON,Promise,console,
  MINI_APP_BOT_ID:'8840247539',
  verifyTelegramPublicSignature:async raw=>raw==='signed-correct-app'?mockedUser:null,
  verifyTelegramInitData:async(raw,key)=>raw==='signed-legacy'&&key==='app-token'?mockedUser:null,
  userRecord:(obj,id)=>obj?.users?.[id]||null,
  isActiveRecord:rec=>!!(rec&&rec.active!==false)
};
vm.runInNewContext(activityCode+'\nglobalThis.activity={verifyQuizBotVisitor,activityIdentity,saveMiniAppActivity,listMiniAppActivity};',sandbox);
const funcs=sandbox.activity;

function storeMock(){
  const values=new Map();
  return {
    values,
    async get(key){const s=values.get(key);return s?JSON.parse(s):null},
    async set(key,value){values.set(key,value)},
    async list({prefix}){return {blobs:[...values.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
  };
}
test('Activity is signed for this Mini App and rejects fake client-side Telegram IDs',async()=>{
  assert.equal((await funcs.verifyQuizBotVisitor('fake-user-id',{APP_BOT_TOKEN:'app-token'})),null);
  assert.equal((await funcs.verifyQuizBotVisitor('signed-correct-app',{})).id,1100110011);
  assert.equal((await funcs.verifyQuizBotVisitor('signed-legacy',{APP_BOT_TOKEN:'app-token'})).id,1100110011);
  assert.equal((await funcs.verifyQuizBotVisitor('signed-legacy',{APP_BOT_TOKEN:'wrong'})),null);
  assert.match(backend,/const user=await verifyQuizBotVisitor\(initData,env\)/);
  assert.doesNotMatch(activityCode,/body\.telegram_id|body\.username|initDataUnsafe/);
  assert.match(backend,/const auth = await adminOwnerOk\(request, env\)/);
  assert.match(backend,/path === '\/api\/admin\/users'/);
});
test('Activity store tracks visits and app-only last seen without losing initial visit',async()=>{
  const store=storeMock();
  const t0=new Date('2026-10-11T05:00:00.000Z');
  const user={...mockedUser,first_name:'<bad\nUser>',username:'quiz_guest'};
  assert.equal((await funcs.saveMiniAppActivity(user,'open',store,t0)).ok,true);
  const key='users/1100110011';
  let entry=await store.get(key);
  assert.equal(entry.opens,1);
  assert.equal(entry.first_seen,t0.toISOString());
  assert.equal(entry.last_seen,t0.toISOString());
  assert.equal(entry.last_opened,t0.toISOString());
  assert.equal(entry.first_name,'badUser');
  // Duplicate heartbeat must not turn one session into many openings.
  await funcs.saveMiniAppActivity(user,'heartbeat',store,new Date(t0.getTime()+20000));
  assert.equal((await store.get(key)).last_seen,t0.toISOString());
  await funcs.saveMiniAppActivity(user,'heartbeat',store,new Date(t0.getTime()+90000));
  entry=await store.get(key);
  assert.equal(entry.first_seen,t0.toISOString());
  assert.equal(entry.last_seen,'2026-10-11T05:01:30.000Z');
  assert.equal(entry.last_opened,t0.toISOString());
  assert.equal(entry.opens,1);
  await funcs.saveMiniAppActivity(user,'open',store,new Date(t0.getTime()+190000));
  assert.equal((await store.get(key)).opens,2);
  assert.equal((await store.get(key)).last_opened,'2026-10-11T05:03:10.000Z');
});
test('Admin user list returns only tracked visitors sorted by QuizBot activity',async()=>{
  const store=storeMock(),t0=new Date('2026-10-11T05:00:00.000Z');
  await funcs.saveMiniAppActivity(mockedUser,'open',store,t0);
  await funcs.saveMiniAppActivity({id:2200220022,username:'premium_user'},'open',store,new Date(t0.getTime()+3600000));
  const state={premium_users:{users:{'2200220022':{active:true}}},banned_users:{users:{'1100110011':{active:true}}}};
  const data=await funcs.listMiniAppActivity(store,state,new Date(t0.getTime()+3650000));
  assert.equal(data.stats.total,2);
  assert.equal(data.stats.recent,1);
  assert.equal(data.stats.today,2);
  assert.equal(data.users[0].id,'2200220022');
  assert.equal(data.users[0].premium,true);
  assert.equal(data.users[1].banned,true);
  assert.equal(data.users[0].recent,true);
  assert.equal(data.users[1].recent,false);
  assert.equal(data.users[0].first_seen,'2026-10-11T06:00:00.000Z');
  assert.equal(data.users[0].last_opened,'2026-10-11T06:00:00.000Z');
});
test('Telegram activity client only sends signed initData while Mini App is visible',async()=>{
  const sent=[],events={},timers={};
  const doc={hidden:true,addEventListener(k,fn){events[k]=fn}};
  const win={Telegram:{WebApp:{initData:'signed-correct-app'}},addEventListener(k,fn){events[k]=fn}};
  const context={
    window:win,document:doc,JSON,Date,console,
    fetch:async(url,opts)=>{sent.push({url,opts});return {ok:true}},
    setTimeout(fn){timers.start=fn;return 1},
    setInterval(fn){timers.repeat=fn;return 2}
  };
  vm.runInNewContext(tracker,context);
  await timers.start();
  assert.equal(sent.length,0,'background Telegram must not count as active');
  doc.hidden=false;
  await events.visibilitychange();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'/api/activity');
  assert.equal(sent[0].opts.headers['X-Telegram-Init-Data'],'signed-correct-app');
  assert.equal(JSON.parse(sent[0].opts.body).event,'open');
  assert.equal('telegram_id' in JSON.parse(sent[0].opts.body),false);
});
test('Compact panel keeps exactly four sections and original critical functions',()=>{
  for(const id of ['users','access','questions','settings','premiumList','banList','subjectKey','importSubject','reportChatId','premId','banId']){
    assert.match(page,new RegExp('id="'+id+'"'));
  }
  for(const id of ['users','access','questions','settings']){
    assert.match(page,new RegExp('data-pane="'+id+'"'));
  }
  assert.match(page,/id="userSearch"/);
  assert.match(page,/id="userFilter"/);
  assert.match(page,/id="subjectFold"/);
  assert.match(page,/id="usersMore"/);
  assert.match(page,/compact\.js\?v=2/);
  assert.match(page,/compact\.css\?v=1/);
  assert.match(home,/activity-tracker\.js\?v=1/);
  assert.match(css,/people-list/);
  assert.match(compact,/Последний вход/);
  assert.match(compact,/Последняя активность/);
  assert.doesNotThrow(()=>new vm.Script(compact));
  assert.doesNotThrow(()=>new vm.Script(tracker));
  assert.equal((page.match(/class="pane(?: active)?"/g)||[]).length,4);
});
