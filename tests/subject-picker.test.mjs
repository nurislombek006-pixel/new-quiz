import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync('public/index.html','utf8');
const script=readFileSync('public/subject-picker.js','utf8');
const css=readFileSync('public/subject-picker.css','utf8');
const embed=readFileSync('public/admin-embed.js','utf8');
const backend=readFileSync('cloudflare/backend.mjs','utf8');
const assets=readFileSync('cloudflare/assets.mjs','utf8');

function setup(){
  const events={};
  const select={value:'macro',options:[{value:'macro',textContent:'📊 Макроэкономика'}],addEventListener(event,handler){events['select:'+event]=handler}};
  const trigger={
    textContent:'',title:'',attrs:{},
    addEventListener(event,handler){events['trigger:'+event]=handler},
    setAttribute(name,value){this.attrs[name]=value}
  };
  const body={classList:{items:new Set(),add(k){this.items.add(k)},remove(k){this.items.delete(k)}}};
  const document={
    body,hidden:false,
    getElementById(id){return id==='subject-select'?select:id==='subject-picker-trigger'?trigger:null},
    addEventListener(type,callback){events['document:'+type]=callback}
  };
  const window={
    location:{href:'https://quizbot-astor-migration.astor2035.workers.dev/'},
    currentSubjectKey:'macro',
    Telegram:{WebApp:{initData:'signed-telegram-payload'}},
    addEventListener(type,callback){events['window:'+type]=callback}
  };
  const calls=[],state={subjects:{macro:{title:'Макроэкономика',emoji:'📊',tests:[{}]}}};
  const actual={
    subjects:{
      macro:{title:'Макроэкономика',emoji:'📊',tests:[{},{}]},
      'тест':{title:'Тест',emoji:'📚',tests:Array.from({length:20},()=>({}))}
    }
  };
  const mockFetch=async(url,opts)=>{
    calls.push({url,opts});
    return {ok:true,status:200,async json(){return actual}};
  };
  const context={document,window,location:window.location,URL,Promise,AbortController,Date,
    Array,Object,Number,String,console,setTimeout,clearTimeout,fetch:mockFetch,
    apiUrl:path=>path,
    subjects:state.subjects,
    applySubjectMeta(data){
      context.subjects=data.subjects;
      select.options=Object.entries(data.subjects).map(([key,sub])=>({value:key,textContent:sub.emoji+' '+sub.title}));
      select.value=window.currentSubjectKey;
    }
  };
  vm.createContext(context);
  vm.runInContext(script,context);
  return {context,events,calls,select,trigger,body,actual};
}
test('New subjects become selectable immediately after a fresh server catalog request',async()=>{
  const t=setup();
  assert.ok(t.body.classList.items.has('subject-picker-ready'));
  assert.equal(t.select.options.length,1,'previous in-app catalog had one subject');
  await t.context.window.refreshSubjectCatalog();
  assert.equal(t.select.options.length,2);
  assert.equal(t.select.options[1].value,'тест');
  assert.match(t.calls[0].url,/\/api\/tests\?subjects_refresh=\d+/);
  assert.equal(t.calls[0].opts.cache,'no-store');
  assert.equal(t.calls[0].opts.headers['X-Telegram-Init-Data'],'signed-telegram-payload');
  assert.equal(t.calls[0].opts.credentials,'same-origin');
  assert.equal(t.trigger.textContent,'📊 Макроэкономика');
  assert.equal(t.calls[0].opts.method,undefined,'The catalog refresh is read-only');
});
test('Refreshing list shares one in-flight request instead of issuing duplicate HTTP calls',async()=>{
  const t=setup();
  await Promise.all([t.context.window.refreshSubjectCatalog(),t.context.window.refreshSubjectCatalog()]);
  assert.equal(t.calls.length,1);
});
test('Original native select and mobile-friendly picker remain accessible',()=>{
  assert.match(page,/id="subject-select" class="subject-select" onchange="switchSubject\(this\.value\)"/);
  assert.match(page,/id="subject-picker-trigger"/);
  assert.match(page,/subject-picker\.css\?v=2/);
  assert.match(page,/subject-picker\.js\?v=2/);
  assert.match(css,/#subject-select\{pointer-events:none!important;opacity:0!important\}/);
  assert.match(css,/body\.subject-picker-ready \.topbar \.subject-picker-trigger/);
  assert.match(css,/.subject-picker-item/);
  assert.match(script,/switchSubject\(key\)/);
  assert.match(script,/showScreen\('start-screen'\)/);
  assert.match(script,/renderOptions\('Показаны актуальные предметы из QuizBot\.'/);
  assert.doesNotThrow(()=>new vm.Script(script));
});
test('After closing owner admin the menu refreshes subjects without modifying stored questions',()=>{
  assert.match(embed,/window\.refreshSubjectCatalog\(\)\.catch\(\(\)=>\{\}\)/);
  assert.match(backend,/if\(path==='\/api\/tests' && request\.method==='GET'\)/);
  assert.doesNotMatch(script,/fetch\([^)]*,\s*\{\s*method:\s*['"]POST/);
  assert.match(assets,/\"\/admin\/index\.html\":/);
  assert.match(assets,/id=\\\"migrate-old-site\\\"/);
});

test('Animated picker closes smoothly and offers reduced-motion fallback',()=>{
  const motion=readFileSync('public/motion.css','utf8');
  assert.match(css,/@keyframes qb-picker-panel-in/);
  assert.match(css,/\.subject-picker-layer\.is-closing/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(script,/closingLayer\.classList\.add\('is-closing'\)/);
  assert.match(script,/setTimeout\(finish,160\)/);
  assert.match(script,/if\(reduce\)return finish\(\)/);
  assert.match(script,/animateSubjectSwitch\(\)/);
  assert.match(motion,/qb-screen-in/);
  assert.match(motion,/prefers-reduced-motion: reduce/);
  assert.match(page,/motion\.css\?v=1/);
});
