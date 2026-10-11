import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const backend=readFileSync('cloudflare/backend.mjs','utf8');
const worker=readFileSync('cloudflare/worker.mjs','utf8');
const assets=readFileSync('cloudflare/assets.mjs','utf8');
const migration=readFileSync('cloudflare/migration.js','utf8');
const config=JSON.parse(readFileSync('wrangler.json','utf8'));
const kvCode=backend.slice(0,backend.indexOf('const TESTS_DATA = '));
assert.ok(kvCode.includes('function d1Store('));
function makeDB(){
 const table=new Map();
 return {
  prepare(sql){
   return {bind(...args){
    return {
     async all(){
      if(sql.startsWith('SELECT value')){
       const key=args[0]+':'+args[1]+':';
       return {results:[...table.entries()].filter(([k])=>k.startsWith(key)).sort((a,b)=>Number(a[0].split(':').at(-1))-Number(b[0].split(':').at(-1))).map(([,value])=>({value}))};
      }
      if(sql.startsWith('SELECT DISTINCT')){
       const keys=[...table.keys()].filter(k=>k.startsWith(args[0]+':')).map(k=>k.slice(args[0].length+1).split(':').slice(0,-1).join(':'));
       return {results:[...new Set(keys)].filter(k=>k.startsWith(args[2])).map(k=>({k}))};
      }
      return {results:[]};
     },
     async run(){return apply(sql,args)},
     _sql:sql,_args:args
    }
   }};
  },
  async batch(q){for(const x of q)apply(x._sql,x._args);return []},
  table
 };
 function apply(sql,args){
  if(sql.startsWith('DELETE')){
   for(const key of [...table.keys()])if(key.startsWith(args[0]+':'+args[1]+':'))table.delete(key);
  }else if(sql.startsWith('INSERT'))table.set(args[0]+':'+args[1]+':'+args[2],args[3]);
  return {success:true};
 }
}
const context={JSON,Array,String,Error};
vm.runInNewContext(kvCode+'globalThis.store=d1Store;',context);
test('Existing KV interface works with chunked D1 storage and namespace isolation',async()=>{
 const db=makeDB(),kv=context.store(db,'data'),activity=context.store(db,'quizbot-activity');
 const large={subjects:{macro:{tests:Array.from({length:1500},(_,i)=>({id:i,question:'Длинный вопрос '+i+' '+('x'.repeat(100))}))}}};
 await kv.put('tests_data',JSON.stringify(large));
 const restored=await kv.get('tests_data',{type:'json'});
 assert.equal(restored.subjects.macro.tests.length,1500);
 assert.ok(db.table.size>1);
 await activity.set('users/123','{"last_seen":"today"}');
 const listed=await activity.list({prefix:'users/'});
 assert.deepEqual(Array.from(listed.blobs,x=>x.key),['users/123']);
 assert.equal((await kv.get('users/123','json')),null);
 await kv.delete('tests_data');
 assert.equal(await kv.get('tests_data','json'),null);
});
test('Owner API is cryptographically signed on Cloudflare, never trusts local ID',()=>{
 assert.match(backend,/const auth = await adminOwnerOk\(request, env\)/);
 assert.match(backend,/signedUser = await verifyTelegramPublicSignature\(initData, MINI_APP_BOT_ID\)/);
 assert.match(backend,/const user=await verifyQuizBotVisitor\(initData,env\)/);
 assert.match(backend,/const user = await verifyQuizBotVisitor\(body.initData\|\|'', env\)/);
 assert.doesNotMatch(backend,/getStore\(/);
 assert.doesNotMatch(backend,/ALLOW_UNTRUSTED_ACCESS\s*=\s*1/);
});
test('Full original UI is in Cloudflare and admin owner can migrate old Netlify data',()=>{
 assert.match(assets,/"\/index\.html":/);
 assert.match(assets,/"\/admin\/index\.html":/);
 assert.match(assets,/"\/admin\/quick-actions\.js":/);
 assert.match(assets,/"\/migration\.js":/);
 assert.match(assets,/Перенести старую базу/);
 assert.match(migration,/oldExport\('\/api\/admin\/tests\/export'/);
 assert.match(migration,/oldExport\('\/api\/admin\/export'/);
 assert.match(migration,/Number\(latest.total\)!==count/);
 assert.match(migration,/confirm\(/);
 assert.match(migration,/Токен бота отчётов/);
 assert.match(worker,/apiHandler\(request,env\)/);
 assert.equal(config.d1_databases[0].binding,'DB');
 assert.equal(config.d1_databases[0].database_name,'quizbot-astor-data');
});

test('Compact study header and normal-weight typography preserve UI actions',()=>{
  const css=readFileSync('public/soft-type.css','utf8');
  const adminCss=readFileSync('public/admin/soft-type.css','utf8');
  const index=readFileSync('public/index.html','utf8');
  const assetMap=JSON.parse(assets.slice(assets.indexOf('export const ASSETS = ')+'export const ASSETS = '.length).replace(/;\s*$/,''));
  assert.match(css,/#list-screen \.sticky-list-head/);
  assert.match(css,/#list-screen #search-box/);
  assert.match(css,/#list-screen #study-options-row/);
  assert.match(css,/font-weight:400!important/);
  assert.match(index,/soft-type\.css\?v=1/);
  assert.match(index,/id="study-show-options"/);
  assert.match(index,/id="search-box"/);
  assert.match(index,/id="list-title"/);
  assert.match(index,/onclick="backToMenu\(\)"/);
  assert.match(assetMap['/index.html'],/soft-type\.css\?v=1/);
  assert.match(assetMap['/admin/index.html'],/soft-type\.css\?v=1/);
  assert.match(assetMap['/admin/index.html'],/id="migrate-old-site"/);
  assert.equal(assetMap['/soft-type.css'],css);
  assert.equal(assetMap['/admin/soft-type.css'],adminCss);
});
