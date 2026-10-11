import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const JSZip=require('../public/admin/vendor/jszip.min.js');
const script=readFileSync('public/admin/document-import.js','utf8');
const backend=readFileSync('cloudflare/backend.mjs','utf8');
const admin=readFileSync('public/admin/index.html','utf8');
const workerAssets=readFileSync('cloudflare/assets.mjs','utf8');
const assetPrefix='export const ASSETS = ';
const assets=JSON.parse(workerAssets.slice(workerAssets.indexOf(assetPrefix)+assetPrefix.length).replace(/;\s*$/,''));
const SAMPLE=[
  '1. Какая столица Узбекистана?',
  'A) Москва',
  'B) #Ташкент',
  'C) Бишкек',
  'D) Пекин',
  '',
  '2. Сколько будет 2 + 2?',
  'A — 3',
  '#B — 4',
  'C — 5',
  'D — 6'
].join('\n');
function setup(overrides={}){
  const alerts=[],calls=[],elems={};
  function elt(value=''){
    return {value,options:[],disabled:false,textContent:'',dataset:{},replaceChildren(...o){this.options=o;if(!o.some(x=>x.value===this.value))this.value=o[0]?.value||'';}};
  }
  elems.quickSubject=elt('macro');
  elems.quickSubject.options=[{value:'macro',textContent:'Макроэкономика'}];
  elems.docImportSubject=elt('macro');
  elems.docImportStatus=elt();
  elems.docImportSave=elt();
  elems.docImportFile=elt('questions.docx');
  elems.docImportPreview={replaceChildren(){},appendChild(){}};
  const document={readyState:'loading',addEventListener(){},body:{appendChild(){}},getElementById:id=>elems[id]||null};
  const context={
    document,window:{addEventListener(){}},JSZip,TextDecoder,Blob,Response,Date,Number,Array,Object,String,Promise,console,
    Option:class {constructor(text,value){this.textContent=text;this.value=value}},
    quickSubjectSync(){},
    confirm(){return true},
    toast:txt=>alerts.push(txt),
    req:async(path,method,body)=>{calls.push({path,method,body});return {ok:true,added:body.tests_data.length,skipped_duplicates:0}},
    questionsInfo:async()=>{},
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(script+'\nglobalThis.docTest={parseQuizDocument,docAnswerLine,docxXmlToText,docxTextFromArrayBuffer,setParsed:q=>{docImportParsed=q;docImportProblems=[]},importDocumentQuestions};',context);
  return {f:context.docTest,context,calls,elems,alerts};
}
test('TXT parses both # marker locations and option indices',()=>{
  const {f}=setup();
  const result=f.parseQuizDocument(SAMPLE);
  assert.equal(result.errors.length,0);
  assert.equal(result.questions.length,2);
  assert.equal(result.questions[0].question,'Какая столица Узбекистана?');
  assert.equal(result.questions[0].options[1],'Ташкент');
  assert.equal(result.questions[0].answer,1);
  assert.equal(result.questions[1].answer,1);
  assert.equal(f.docAnswerLine('B) Ташкент #').correct,true);
  assert.equal(f.docAnswerLine('Б: #Ташкент').index,1);
  assert.equal(f.docAnswerLine('В) Бишкек').index,2);
});
test('Invalid document must not silently import ambiguous or missing answers',()=>{
  const {f}=setup();
  const bad=[
    '1. Какой город?','A) Москва','B) #Ташкент','C) #Бишкек','D) Пекин','',
    '2. Сколько?','A) Один','B) Два','C) Три','D) Четыре','',
    '3. Неполный?','A) Да','#B) Нет'
  ].join('\n');
  const result=f.parseQuizDocument(bad);
  assert.equal(result.questions.length,0);
  assert.equal(result.errors.length,3);
  assert.match(result.errors.join(' '),/ровно возле одного/);
  assert.match(result.errors.join(' '),/нет ответа C, D/);
});
test('Word XML merges split text runs including inside DOCX paragraphs',()=>{
  const {f}=setup();
  const xml='<?xml version="1.0" encoding="utf-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
  '<w:p><w:r><w:t>1. Какая столица</w:t></w:r><w:r><w:t xml:space="preserve"> Узбекистана?</w:t></w:r></w:p>'+
  '<w:p><w:r><w:t>A) Москва</w:t></w:r></w:p>'+
  '<w:p><w:r><w:t>B) #Таш</w:t></w:r><w:r><w:t>кент</w:t></w:r></w:p>'+
  '<w:p><w:r><w:t>C) Бишкек</w:t></w:r></w:p>'+
  '<w:p><w:r><w:t>D) Пекин</w:t></w:r></w:p>'+
  '</w:body></w:document>';
  const text=f.docxXmlToText(xml);
  const parsed=f.parseQuizDocument(text);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.questions[0].options[1],'Ташкент');
  assert.equal(parsed.questions[0].answer,1);
});
test('Actual compressed DOCX ZIP can be read entirely offline with bundled JSZip',async()=>{
  const {f}=setup();
  const zip=new JSZip();
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
  SAMPLE.split('\n').map(line=>'<w:p><w:r><w:t>'+line.replaceAll('&','&amp;')+'</w:t></w:r></w:p>').join('')+
  '</w:body></w:document>');
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  const text=await f.docxTextFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const result=f.parseQuizDocument(text);
  assert.equal(result.questions.length,2);
  assert.equal(result.errors.length,0);
});
test('Owner document import requests unique append and does not replace other subjects',async()=>{
  const {f,calls,elems}=setup();
  f.setParsed(f.parseQuizDocument(SAMPLE).questions);
  await f.importDocumentQuestions();
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/api/admin/tests/import');
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].body.mode,'append_unique');
  assert.equal(calls[0].body.subject_key,'macro');
  assert.equal(calls[0].body.tests_data.length,2);
  assert.match(elems.docImportStatus.textContent,/Добавлено: 2/);
  assert.match(backend,/const uniqueAppend = body.mode === 'append_unique'/);
  assert.match(backend,/skipped_duplicates:skippedDuplicates/);
  assert.match(backend,/const auth = await adminOwnerOk\(request, env\)/);
});
test('Unique append skips duplicate questions and retains previous entries',()=>{
  const start=backend.indexOf('      const uniqueAppend = body.mode');
  const end=backend.indexOf('      current.data_version =',start);
  assert.ok(start>0&&end>start);
  const extracted=backend.slice(start,end);
  const context={JSON,Array,String,Object,Number};
  vm.runInNewContext('globalThis.merge=(body,oldSub,payload)=>{const current={subjects:{}};const key="macro";'+extracted+'return {saved:current.subjects.macro,added:additions.length,skipped:skippedDuplicates};};',context);
  const existing={question:'Какая столица Узбекистана?',options:['Москва','Ташкент','Бишкек','Пекин'],answer:1};
  const result=context.merge({mode:'append_unique'}, {tests:[existing]}, {tests:[
    {question:'Какая   столица Узбекистана?',options:['Москва','Ташкент','Бишкек','Пекин'],answer:1},
    {question:'Сколько будет 2 + 2?',options:['3','4','5','6'],answer:1}
  ]});
  assert.equal(result.saved.tests.length,2);
  assert.equal(result.skipped,1);
  assert.equal(result.added,1);
});
test('Cloudflare Worker serves self-hosted DOCX parser, styles and retains admin migration tool',()=>{
  assert.match(admin,/id="docImportFile"/);
  assert.match(admin,/id="docImportSubject"/);
  assert.match(admin,/id="docImportPreview"/);
  assert.match(admin,/id="migrate-old-site"/);
  assert.match(admin,/document-import\.js\?v=1/);
  assert.match(admin,/vendor\/jszip\.min\.js\?v=1/);
  assert.equal(assets['/admin/document-import.js'],script);
  assert.match(assets['/admin/index.html'],/id="docImportFile"/);
  assert.match(assets['/admin/index.html'],/id="migrate-old-site"/);
  assert.match(assets['/admin/vendor/jszip.min.js'],/JSZip v3\.10\.2/);
});
