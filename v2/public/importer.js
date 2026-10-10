// Document parsing is performed in the owner's browser. File bytes aren't uploaded.
const scriptCache=new Map();
async function load(url){
  if(scriptCache.has(url))return scriptCache.get(url);
  const p=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=url;s.async=true;
    s.onload=resolve;s.onerror=()=>reject(Error('Не удалось загрузить модуль обработки файла. Проверьте интернет.'));
    document.head.appendChild(s);
  });
  scriptCache.set(url,p);return p;
}
export async function extractFile(file){
  if(!file||file.size>15*1024*1024)throw Error('Выберите файл размером до 15 МБ');
  const name=file.name.toLowerCase(),buf=await file.arrayBuffer();
  if(name.endsWith('.txt'))return new TextDecoder('utf-8').decode(buf);
  if(name.endsWith('.docx')){
    await load('https://cdn.jsdelivr.net/npm/mammoth@1.9.1/mammoth.browser.min.js');
    if(!window.mammoth)throw Error('Модуль DOCX не загрузился');
    const r=await window.mammoth.extractRawText({arrayBuffer:buf});
    if(!r.value?.trim())throw Error('В документе DOCX не удалось найти текст');
    return r.value;
  }
  if(name.endsWith('.doc')){
    await load('https://cdn.jsdelivr.net/gh/Alpaq92/JSDoc@main/src/docToText.js');
    if(typeof window.docToText!=='function')throw Error('Модуль DOC не загрузился');
    const txt=window.docToText(buf);
    if(!txt?.trim())throw Error('Не удалось распознать этот DOC. Старые или защищённые версии Word могут не поддерживаться. Попробуйте сохранить файл в DOCX.');
    return txt;
  }
  if(name.endsWith('.pdf')){
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.54/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.54/build/pdf.worker.mjs';
    const doc=await pdfjs.getDocument({data:new Uint8Array(buf),isEvalSupported:false}).promise;
    if(doc.numPages>150)throw Error('Слишком большой PDF: максимум 150 страниц за раз');
    const pages=[];
    for(let n=1;n<=doc.numPages;n++){
      const p=await doc.getPage(n),t=await p.getTextContent();
      let lines=[],current='',lastY=null;
      for(const item of t.items){
        if(typeof item.str!=='string')continue;
        const y=item.transform?.[5];
        if(lastY!==null&&Number.isFinite(y)&&Math.abs(lastY-y)>3){lines.push(current.trim());current='';}
        current+=(current?' ':'')+item.str;
        if(item.hasEOL){lines.push(current.trim());current='';lastY=null;}
        else if(Number.isFinite(y))lastY=y;
      }
      if(current.trim())lines.push(current.trim());
      pages.push(lines.join('\n'));
    }
    const text=pages.join('\n');
    if(!text.trim())throw Error('PDF не содержит распознаваемого текста (возможно, это скан). Для сканов понадобится OCR или текстовая версия.');
    return text;
  }
  throw Error('Поддерживаются только TXT, DOC, DOCX и PDF');
}
export function parseQuestions(input,defaultTopic='Общие'){
  const lines=String(input||'').replace(/\r\n?/g,'\n').split('\n');
  const questions=[],errors=[];let q=null,topic=defaultTopic||'Общие';
  const option=/^\s*([abcdа-бвг])[\).]\s*(.+)\s*$/i;
  const number=/^\s*(\d{1,7})[\).]\s*(.+)$/;
  const finish=()=>{
    if(!q)return;
    if(q.options.length===4&&q.correct_index>=0&&q.text.length>=3){
      questions.push({...q,topic});
    }else errors.push('Строка '+q.line+': вопрос пропущен (нужно 4 варианта и один #)');
    q=null;
  };
  for(let i=0;i<lines.length;i++){
    const raw=lines[i].trim();if(!raw)continue;
    const heading=raw.match(/^(?:тема|topic)\s*:\s*(.+)$/i);
    if(heading){finish();topic=heading[1].trim().slice(0,100);continue;}
    const m=raw.match(number);
    if(m){finish();q={text:m[2].trim(),options:[],correct_index:-1,line:i+1};continue;}
    const o=raw.match(option);
    if(o&&q){
      const index='abcd'.indexOf(o[1].toLowerCase());
      const ru='абвг'.indexOf(o[1].toLowerCase());
      const n=index<0?ru:index;
      if(n!==q.options.length){errors.push('Строка '+(i+1)+': неправильный порядок вариантов');continue;}
      const correct=/#\s*$/.test(o[2]);
      const value=o[2].replace(/#\s*$/,'').trim();
      if(correct){
        if(q.correct_index!==-1)errors.push('Строка '+(i+1)+': более одного правильного ответа');
        q.correct_index=n;
      }
      q.options.push(value);
      continue;
    }
    if(q&&q.options.length===0)q.text+=' '+raw;else if(q&&q.options.length>0){
      q.options[q.options.length-1]+=' '+raw;
    }
  }
  finish();
  // The server independently validates every question.
  return {questions:questions.map(({line,...v})=>v),errors};
}
