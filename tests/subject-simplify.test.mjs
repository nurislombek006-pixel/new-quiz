import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('public/admin/index.html','utf8');
const css=readFileSync('public/admin/subjects-ui.css','utf8');
const backend=readFileSync('cloudflare/backend.mjs','utf8');
const start=html.indexOf('function renderSubjects(list){');
const end=html.indexOf('async function readTestsFile(){',start);
assert.ok(start>0 && end>start,'Admin subject controls are defined');
const functions=html.slice(start,end);

function setup(){
  const fields={};
  const classList=()=>({items:new Set(['hidden']),add(k){this.items.add(k)},remove(k){this.items.delete(k)},contains(k){return this.items.has(k)}});
  const element=id=>({id,value:'',innerHTML:'',textContent:'',disabled:false,options:[],classList:classList(),querySelectorAll(){return []},focus(){this.focused=true}});
  for(const id of ['subjectsList','importSubject','subjectKey','subjectTitle','subjectShort','subjectEmoji','subjectEditorHeading','subjectEditorHint','subjectDeleteAction','subjectSaveAction','qStats'])fields[id]=element(id);
  const calls=[],warnings=[],messages=[];
  let records=[{key:'macro',title:'Макроэкономика',short:'Макроэкономика',emoji:'📊',count:302}];
  const sandbox={
    subjectsMeta:[],
    $:id=>fields[id],
    Number,String,Array,Object,Math,console,
    toast:x=>messages.push(x),alert:x=>warnings.push(x),
    confirm:()=>true,
    escapeHtml:s=>String(s||'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])),
    slug:v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi,'-').replace(/^-+|-+$/g,''),
    async req(url,method,body){
      calls.push({url,method,body});
      if(url==='/api/admin/tests/subject'){
        const index=records.findIndex(x=>x.key===body.key);
        const next={key:body.key,title:body.title,short:body.short,emoji:body.emoji,count:index===-1?0:records[index].count};
        if(index<0)records.push(next);else records[index]=next;
      }
      if(url==='/api/admin/tests/subject/delete')records=records.filter(x=>x.key!==body.key);
      return {ok:true,counts:{total:records.reduce((n,x)=>n+x.count,0),subjects_list:records}};
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(functions+'globalThis.handlers={renderSubjects,resetSubjectForm,fillSubjectForm,updateQStats,saveSubjectName,deleteSubject};',sandbox);
  return {fields,calls,warnings,messages,api:sandbox.handlers,records:()=>records};
}
test('Only one subject name and optional emoji are visible',()=>{
  assert.match(html,/<input type="hidden" id="subjectKey">/);
  assert.match(html,/<input type="hidden" id="subjectShort">/);
  assert.match(html,/id="subjectTitle" placeholder="Например: Макроэкономика"/);
  assert.match(html,/id="subjectEmoji"/);
  assert.doesNotMatch(html,/<label>Ключ предмета<\/label>/);
  assert.doesNotMatch(html,/<label>Короткое название<\/label>/);
  assert.match(html,/subjects-ui\.css\?v=1/);
  assert.ok(html.indexOf('id="subjectFold"')<html.indexOf('id="docImportFile"'));
});
test('Create a new subject with title only and auto-derived stable key and short name',async()=>{
  const t=setup();
  t.api.renderSubjects(t.records());
  assert.equal(t.fields.subjectKey.value,'','Existing subject must NOT silently preselect for overwrite');
  t.fields.subjectTitle.value='Экономическая безопасность';
  t.fields.subjectEmoji.value='📚';
  await t.api.saveSubjectName();
  assert.equal(t.calls.length,1);
  assert.equal(t.calls[0].body.key,'экономическая-безопасность');
  assert.equal(t.calls[0].body.title,'Экономическая безопасность');
  assert.equal(t.calls[0].body.short,'Экономическая безопасность');
  assert.equal(t.fields.subjectKey.value,'экономическая-безопасность');
  assert.equal(t.records().length,2);
  assert.equal(t.records()[0].title,'Макроэкономика');
});
test('Editing an existing subject keeps its original key and preserves questions',async()=>{
  const t=setup();
  t.api.renderSubjects(t.records());
  t.api.fillSubjectForm(t.records()[0]);
  t.fields.subjectTitle.value='Основы макроэкономики';
  await t.api.saveSubjectName();
  assert.equal(t.calls[0].body.key,'macro');
  assert.equal(t.calls[0].body.short,'Основы макроэкономики');
  assert.equal(t.records()[0].count,302);
  assert.equal(t.fields.subjectDeleteAction.classList.contains('hidden'),false);
  t.api.resetSubjectForm();
  assert.equal(t.fields.subjectDeleteAction.classList.contains('hidden'),true);
});
test('Saving a subject with the same name does not create a duplicate or alter the original',async()=>{
  const t=setup();
  t.api.renderSubjects(t.records());
  t.fields.subjectTitle.value='Макроэкономика';
  await t.api.saveSubjectName();
  assert.equal(t.calls.length,0);
  assert.match(t.warnings.join(' '),/существует/);
});
test('Deleting a subject requires selecting it and confirmation',async()=>{
  const t=setup();
  t.api.renderSubjects(t.records());
  await t.api.deleteSubject();
  assert.equal(t.calls.length,0);
  t.api.fillSubjectForm(t.records()[0]);
  await t.api.deleteSubject();
  assert.equal(t.calls.length,1);
  assert.equal(t.calls[0].url,'/api/admin/tests/subject/delete');
});
test('Long technical database version is not rendered in stats cards',()=>{
  const t=setup();
  t.api.updateQStats({total:302,subjects_list:t.records(),data_version:'2026-05-23-macro-plain-v2'});
  assert.match(t.fields.qStats.innerHTML,/>302<\/b>/);
  assert.match(t.fields.qStats.innerHTML,/предметов/);
  assert.doesNotMatch(t.fields.qStats.innerHTML,/2026-05-23-macro-plain-v2|версия/);
  assert.match(css,/#questions \.compact-qstats/);
});
test('Mobile accordion chevrons are vertically centered and native markers hidden',()=>{
  assert.match(css,/position:absolute!important;right:12px!important;top:50%!important/);
  assert.match(css,/transform:translateY\(-50%\)!important/);
  assert.match(css,/>summary::-webkit-details-marker/);
  assert.match(css,/details\.fold>summary::marker/);
});
test('Existing backend persists stable subject keys and all questions without reset',()=>{
  assert.match(backend,/const key = slugKey\(body\.key \|\| body\.subject_key \|\| title\)/);
  assert.match(backend,/if\(!data\.subjects\[key\]\) data\.subjects\[key\] = \{ tests:\[\] \}/);
  assert.match(backend,/data\.subjects\[key\]\.short = short \|\| title/);
  assert.match(html,/id="quickQuestionForm"/);
  assert.match(html,/id="docImportFile"/);
  assert.match(html,/id="migrate-old-site"/);
});
