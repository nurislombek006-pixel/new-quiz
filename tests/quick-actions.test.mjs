import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const quick=readFileSync('public/admin/quick-actions.js','utf8');
const admin=readFileSync('public/admin/index.html','utf8');
const home=readFileSync('public/index.html','utf8');
const eco=readFileSync('public/eco-final-patch.js','utf8');
const compact=readFileSync('public/admin/compact.js','utf8');
const backend=readFileSync('netlify/functions/api.mjs','utf8');
const css=readFileSync('public/admin/quick-actions.css','utf8');

function build(){
  const messages=[],requests=[],warnings=[],confirmations=[],elements={};
  const element=(id,value='')=>{
    elements[id]={id,value,disabled:false,textContent:'',focus(){this.focused=true}};
    return elements[id];
  };
  element('quickUserId','5305261101');
  element('quickDays','30');
  element('premId');
  element('banId');
  element('quickQuestion','Что такое ВВП?');
  for(let i=0;i<4;i++)element('quickOption'+i,'Ответ '+(i+1));
  element('quickCorrect','2');
  element('quickQuestionSave');
  const srcOption={value:'macro',cloneNode(){return {value:'macro'}}};
  elements.importSubject={options:[srcOption]};
  elements.quickSubject={value:'macro',disabled:false,replaceChildren(...options){this.value=options[0]?.value||''}};
  const document={
    readyState:'loading',
    getElementById:id=>elements[id]||null,
    querySelectorAll:()=>[],
    addEventListener(){},
  };
  const context={
    document,
    crypto:{randomUUID:()=> 'unique-test-id'},
    confirm:text=>{confirmations.push(text);return true},
    alert:text=>messages.push(text),
    toast:text=>messages.push(text),
    req:async(path,method,data)=>{requests.push({path,method,data});return {ok:true}},
    refreshLists:async()=>({ok:true}),
    refreshUsers:async()=>({ok:true}),
    renderUsers:()=>{},
    questionsInfo:async()=>({ok:true}),
    visitedUsers:[],
    console:{warn:(...args)=>warnings.push(args.join(' '))},
    Promise,Date,Number,JSON,Math,
  };
  vm.createContext(context);
  vm.runInContext(quick+'\nglobalThis.quickTest={quickUserAction,quickAddQuestion,quickValidId};',context);
  return {action:context.quickTest,context,elements,messages,requests,confirmations};
}
test('Quick Premium grant sends 30 days to existing owner-only API',async()=>{
  const t=build();
  await t.action.quickUserAction('premium');
  assert.equal(t.requests.length,1);
  assert.equal(t.requests[0].path,'/api/admin/premium');
  assert.equal(t.requests[0].method,'POST');
  assert.equal(t.requests[0].data.user_id,'5305261101');
  assert.equal(t.requests[0].data.days,30);
  assert.equal(t.requests[0].data.fingerprint,undefined);
  assert.equal(t.elements.premId.value,'5305261101');
  assert.equal(t.elements.banId.value,'5305261101');
});
test('Ban is confirmed and signed backend action remains unmodified',async()=>{
  const t=build();
  t.context.confirm=()=>false;
  await t.action.quickUserAction('ban','333444555');
  assert.equal(t.requests.length,0,'Declining confirmation must never block');
  t.context.confirm=()=>true;
  await t.action.quickUserAction('ban','333444555');
  assert.equal(t.requests.length,1);
  assert.equal(t.requests[0].path,'/api/admin/ban');
  assert.equal(t.requests[0].data.user_id,'333444555');
  assert.equal(t.requests[0].data.type,'permanent');
  assert.ok(t.requests[0].data.reason);
  assert.match(backend,/const auth = await adminOwnerOk\(request, env\)/);
});
test('Bad Telegram IDs are rejected without server request',async()=>{
  const t=build();
  t.elements.quickUserId.value='hello';
  await t.action.quickUserAction('premium');
  assert.equal(t.requests.length,0);
  assert.match(t.messages[0],/Telegram ID/);
});
test('Adding one question uses append mode, four options, 0-index answer and no destructive replacement',async()=>{
  const t=build();
  const event={prevented:false,preventDefault(){this.prevented=true}};
  await t.action.quickAddQuestion(event);
  assert.equal(event.prevented,true);
  assert.equal(t.requests.length,1);
  assert.equal(t.requests[0].path,'/api/admin/tests/import');
  const body=t.requests[0].data;
  assert.equal(body.subject_key,'macro');
  assert.equal(body.mode,'append');
  assert.equal(body.tests_data.length,1);
  assert.equal(body.tests_data[0].question,'Что такое ВВП?');
  assert.equal(body.tests_data[0].options.length,4);
  assert.equal(body.tests_data[0].answer,2);
  assert.equal(body.tests_data[0].id,'manual-unique-test-id');
  assert.equal(t.elements.quickQuestion.value,'');
  assert.match(backend,/body\.mode === 'append' \|\| body\.append === true/);
  assert.match(backend,/tests: append \?/);
});
test('Invalid question choices are not saved and inputs are retained',async()=>{
  const t=build();
  t.elements.quickOption3.value=' ';
  await t.action.quickAddQuestion({preventDefault(){}});
  assert.equal(t.requests.length,0);
  assert.equal(t.elements.quickQuestion.value,'Что такое ВВП?');
  assert.match(t.messages.join(' '),/четыре варианта/i);
});
test('Interface offers visible quick actions and both Premium and Free badges stay short',()=>{
  for(const id of ['quickUserId','quickDays','quickQuestionForm','quickQuestion','quickSubject','quickCorrect','quickQuestionSave','accessAdvanced']){
    assert.match(admin,new RegExp('id="'+id+'"'));
  }
  for(let i=0;i<4;i++)assert.match(admin,new RegExp('id="quickOption'+i+'"'));
  assert.match(admin,/quick-actions\.js\?v=1/);
  assert.match(admin,/quick-actions\.css\?v=1/);
  assert.match(compact,/data-user-action/);
  assert.match(home,/admin-embed\.js\?v=8/);
  assert.match(home,/el\.textContent=isPremium\?'PRO':'Free'/);
  assert.match(eco,/el\.textContent=p\?'PRO':'Free'/);
  assert.match(css,/quick-actions/);
  assert.doesNotThrow(()=>new vm.Script(quick));
});
