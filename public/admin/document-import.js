/* Word (.docx) / plain-text question import for the verified QuizBot owner.
   Documents are parsed in the browser and NEVER sent to external services.
   Only validated question objects are sent to the existing signed Cloudflare API. */
'use strict';

const DOC_IMPORT_MAX_BYTES=5*1024*1024;
const DOC_IMPORT_MAX_QUESTIONS=1000;
const DOC_IMPORT_EXAMPLE=[
  '1. Какая столица Узбекистана?',
  'A) Москва',
  'B) #Ташкент',
  'C) Бишкек',
  'D) Пекин',
  '',
  '2. Сколько будет 2 + 2?',
  'A) 3',
  '#B) 4',
  'C) 5',
  'D) 6'
].join('\n');
let docImportParsed=[];
let docImportProblems=[];
let docImportSaving=false;

function docXmlEntities(str){
  return String(str).replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);/gi,(full,code)=>{
    const known={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(known[code.toLowerCase()])return known[code.toLowerCase()];
    const num=code.startsWith('#x')||code.startsWith('#X')
      ?parseInt(code.slice(2),16):parseInt(code.slice(1),10);
    return Number.isInteger(num)&&num>=0&&num<=0x10ffff&&!(num>=0xd800&&num<=0xdfff)
      ?String.fromCodePoint(num):full;
  });
}
function docxXmlToText(xml){
  if(!/<w:document\b/.test(xml)||!/<w:body\b/.test(xml))throw Error('Word-файл не содержит текст документа.');
  const paragraphs=[];
  const re=/<w:p(?=[\s>])[^>]*>([\s\S]*?)<\/w:p>/g;
  for(const match of xml.matchAll(re)){
    const fragments=[];
    // Word splits a visible word into several w:t runs. Concatenate runs exactly.
    const token=/<w:t(?=[\s>])[^>]*>([\s\S]*?)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/?>/g;
    for(const piece of match[1].matchAll(token)){
      if(piece[1]!==undefined)fragments.push(docXmlEntities(piece[1]));
      else if(/^<w:tab\b/.test(piece[0]))fragments.push('\t');
      else fragments.push('\n');
    }
    paragraphs.push(fragments.join(''));
  }
  return paragraphs.join('\n');
}
async function docxTextFromArrayBuffer(buffer){
  if(buffer.byteLength>DOC_IMPORT_MAX_BYTES)throw Error('Файл больше 5 МБ. Раздели его на несколько документов.');
  if(typeof JSZip==='undefined')throw Error('Компонент чтения DOCX не загрузился. Обнови страницу.');
  let zip;
  try{zip=await JSZip.loadAsync(buffer,{checkCRC32:true})}
  catch(e){throw Error('Не удалось открыть Word-файл. Проверь, что это настоящий DOCX, а не старый DOC.')}
  const entry=zip.file('word/document.xml');
  if(!entry)throw Error('DOCX не содержит текста Word.');
  if(Number(entry._data?.uncompressedSize)>8*1024*1024)throw Error('Документ слишком большой. Раздели вопросы на части.');
  const xml=await entry.async('string');
  if(xml.length>8*1024*1024)throw Error('Документ слишком большой. Раздели вопросы на части.');
  return docxXmlToText(xml);
}
function docAnswerLine(line){
  const m=/^\s*(#\s*)?([ABCDАБВГ])\s*[\).:\-–—]\s*(.*?)\s*$/iu.exec(line);
  if(!m)return null;
  const index={A:0,B:1,C:2,D:3,'А':0,'Б':1,'В':2,'Г':3}[m[2].toUpperCase()];
  if(index===undefined)return null;
  let value=m[3].trim();
  const leading=/^#\s*/.test(value);
  const trailing=/(?:\s|^)#\s*$/.test(value);
  if(leading)value=value.replace(/^#\s*/,'');
  if(trailing)value=value.replace(/(?:\s|^)#\s*$/,'').trim();
  return {index,correct:!!m[1]||leading||trailing,value:value.trim()};
}
function parseQuizDocument(text){
  const lines=String(text||'').replace(/\r\n?/g,'\n').replace(/\uFEFF/g,'').replace(/\u00a0/g,' ').split('\n');
  const questions=[],errors=[];
  let current=null;
  function finish(){
    if(!current)return;
    const q=current;current=null;
    const missing=[0,1,2,3].filter(i=>!q.options[i]);
    const selected=q.correct.filter(Boolean).length;
    if(!q.text.trim())errors.push('Строка '+q.line+': пустой текст вопроса.');
    if(missing.length)errors.push('Строка '+q.line+': нет ответа '+missing.map(i=>'ABCD'[i]).join(', ')+'.');
    if(selected!==1)errors.push('Строка '+q.line+': нужно поставить # ровно возле одного правильного ответа.');
    if(q.text.length>2000)errors.push('Строка '+q.line+': вопрос длиннее 2000 символов.');
    if(q.options.some(o=>o&&o.length>1000))errors.push('Строка '+q.line+': один из ответов длиннее 1000 символов.');
    if(!missing.length&&selected===1&&q.text.trim()&&q.text.length<=2000&&q.options.every(o=>o.length<=1000)){
      questions.push({
        question:q.text.trim(),
        options:q.options,
        answer:q.correct.findIndex(Boolean),
        generated:false,
        source:'document'
      });
    }
  }
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line)continue;
    const ans=docAnswerLine(line);
    if(ans){
      if(!current){errors.push('Строка '+(i+1)+': найден ответ без вопроса.');continue}
      if(current.options[ans.index]!==null){errors.push('Строка '+(i+1)+': вариант '+'ABCD'[ans.index]+' указан дважды.');continue}
      if(!ans.value)errors.push('Строка '+(i+1)+': пустой вариант ответа.');
      current.options[ans.index]=ans.value;
      current.correct[ans.index]=ans.correct;
      current.lastIndex=ans.index;
      continue;
    }
    const header=/^\s*(?:(?:Вопрос|Question)\s*№?\s*|№\s*)?(\d{1,5})\s*[).:\-–—]\s*(.+)$/iu.exec(line);
    if(header){
      finish();
      current={text:header[2],options:[null,null,null,null],correct:[false,false,false,false],line:i+1,lastIndex:-1};
      continue;
    }
    if(!current){
      if(/^(?:(?:тема|предмет|вариант|тест|тесты|раздел)\s*[:\-–—]|\s*[-=]{2,})/iu.test(line))continue;
      current={text:line,options:[null,null,null,null],correct:[false,false,false,false],line:i+1,lastIndex:-1};
    }else if(current.lastIndex===-1){
      current.text+=' '+line;
    }else if(current.options.every(o=>o!==null)){
      finish();
      current={text:line,options:[null,null,null,null],correct:[false,false,false,false],line:i+1,lastIndex:-1};
    }else{
      // Multiline answer, commonly produced by long Word paragraphs.
      current.options[current.lastIndex]+=' '+line;
    }
  }
  finish();
  if(questions.length>DOC_IMPORT_MAX_QUESTIONS)
    errors.push('В документе более '+DOC_IMPORT_MAX_QUESTIONS+' вопросов. Раздели файл на части.');
  if(!questions.length && !errors.length)errors.push('Не удалось найти вопросы. Проверь формат образца.');
  return {questions,errors};
}

function docImportSetStatus(text,kind='info'){
  const el=document.getElementById('docImportStatus');
  if(el){el.textContent=text;el.dataset.status=kind}
}
function docImportRender(result){
  const list=document.getElementById('docImportPreview');
  const button=document.getElementById('docImportSave');
  if(!list||!button)return;
  list.replaceChildren();
  if(result.errors.length){
    const title=document.createElement('p');
    title.className='doc-import-errors';
    title.textContent='Исправь ошибки в документе и загрузи его снова:';
    list.appendChild(title);
    for(const issue of result.errors.slice(0,20)){
      const row=document.createElement('p');row.className='doc-import-error';row.textContent='⚠ '+issue;
      list.appendChild(row);
    }
    if(result.errors.length>20){
      const more=document.createElement('p');more.textContent='И ещё '+(result.errors.length-20)+' ошибок.';list.appendChild(more);
    }
  }
  if(result.questions.length){
    const previewTitle=document.createElement('p');
    previewTitle.textContent='Пример распознанных вопросов (первые 5):';
    list.appendChild(previewTitle);
    for(const [i,q] of result.questions.slice(0,5).entries()){
      const row=document.createElement('div');
      row.className='doc-import-question';
      const question=document.createElement('div');
      question.className='doc-import-question-title';
      question.textContent=(i+1)+'. '+q.question;
      row.appendChild(question);
      q.options.forEach((answer,j)=>{
        const option=document.createElement('div');
        if(j===q.answer)option.className='doc-import-right';
        option.textContent=('ABCD'[j])+') '+answer+(j===q.answer?' ✓':'');
        row.appendChild(option);
      });
      list.appendChild(row);
    }
  }
  button.disabled=result.errors.length>0||!result.questions.length;
}
async function previewQuizDocumentFile(){
  const input=document.getElementById('docImportFile');
  const file=input?.files?.[0];
  docImportParsed=[];docImportProblems=[];
  const save=document.getElementById('docImportSave');
  if(save)save.disabled=true;
  if(!file){docImportSetStatus('Выбери файл .docx или .txt.');return}
  if(file.size>DOC_IMPORT_MAX_BYTES){docImportSetStatus('Файл слишком большой (максимум 5 МБ).','error');return}
  const lower=String(file.name||'').toLowerCase();
  try{
    docImportSetStatus('Читаю документ…');
    let text;
    if(lower.endsWith('.docx'))text=await docxTextFromArrayBuffer(await file.arrayBuffer());
    else if(lower.endsWith('.txt')||lower.endsWith('.md'))text=await file.text();
    else throw Error('Поддерживаются Word .docx и текстовые .txt/.md. Старый .doc сохрани как .docx.');
    const parsed=parseQuizDocument(text);
    docImportParsed=parsed.questions;
    docImportProblems=parsed.errors;
    docImportRender(parsed);
    docImportSetStatus('Распознано: '+parsed.questions.length+' вопросов. Ошибок: '+parsed.errors.length+'.'+
      (parsed.errors.length?' Ничего не сохранено.':' Можно добавить к существующим вопросам.'),parsed.errors.length?'error':'ok');
  }catch(e){
    docImportSetStatus(String(e.message||e),'error');
    docImportRender({questions:[],errors:[]});
    docImportParsed=[];
  }
}
async function importDocumentQuestions(){
  if(docImportSaving||docImportProblems.length||!docImportParsed.length)return;
  const subject=document.getElementById('quickSubject');
  if(typeof quickSubjectSync==='function')quickSubjectSync();
  const key=subject?.value;
  if(!key){docImportSetStatus('Сначала выбери предмет в форме выше.','error');return}
  const count=docImportParsed.length;
  if(!confirm('Добавить '+count+' вопросов в выбранный предмет?\nУже существующие вопросы будут сохранены, повторы пропущены.'))return;
  docImportSaving=true;
  const button=document.getElementById('docImportSave');
  button.disabled=true;button.textContent='Добавляю вопросы…';
  try{
    const now=Date.now().toString(36);
    const batch=docImportParsed.map((q,i)=>({...q,id:'doc-'+now+'-'+(i+1)}));
    const res=await req('/api/admin/tests/import','POST',{
      subject_key:key,mode:'append_unique',tests_data:batch
    });
    const added=Number(res.added);
    const skipped=Number(res.skipped_duplicates);
    docImportSetStatus('✓ Готово. Добавлено: '+(Number.isFinite(added)?added:count)+
      '. Повторов пропущено: '+(Number.isFinite(skipped)?skipped:0)+'.','ok');
    docImportParsed=[];
    const input=document.getElementById('docImportFile');
    if(input)input.value='';
    if(typeof questionsInfo==='function')await questionsInfo().catch(()=>{});
    if(typeof toast==='function')toast('Вопросы из документа добавлены');
  }catch(e){
    docImportSetStatus('Ошибка сохранения: '+String(e.message||e)+'. Попробуй ещё раз.','error');
  }finally{
    docImportSaving=false;button.disabled=!docImportParsed.length||!!docImportProblems.length;
    button.textContent='✓ Добавить вопросы в предмет';
  }
}
function downloadQuizDocumentExample(){
  const data=new Blob([DOC_IMPORT_EXAMPLE],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(data);
  const a=document.createElement('a');
  a.href=url;a.download='obrazec-voprosov-quizbot.txt';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
