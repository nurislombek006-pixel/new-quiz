/* QuizBot study tools, 2026-10-19. Local learning data only. */
(function(){
 'use strict';
 if(window.__qbStudyTools)return;window.__qbStudyTools=true;
 const C=window.QBStudyCore,$=id=>document.getElementById(id);
 const active=id=>$(id)&&!$(id).classList.contains('hidden');
 const blocked=()=>!!window.__quizbotHardBlocked;
 const normal=()=>!blocked()&&active('test-screen')&&sessionQuestions.length>0;
 const key=()=> 'qb_learning_v1_'+String(tgUserId||'browser')+'_'+storageSubjectKey();
 let currentResult=null,focusBefore=null;
 const read=()=>{try{const v=JSON.parse(localStorage.getItem(key())||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}};
 function write(v){try{localStorage.setItem(key(),JSON.stringify(v));return true}catch{toast('Не удалось сохранить: память устройства недоступна.');return false}}
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let toastTimer;
 function toast(text){$('qb-tools-status').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('qb-tools-status').textContent=''},4500)}
 function button(label,fn,cls='qb-tool-button'){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',fn);return b}
 function download(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function history(){const h=getHistory();return Array.isArray(h)?h:[]}
 function decorateHistory(){const rows=history();let change=false;for(const h of rows){if(currentTestMeta.attemptId&&h.attemptId===currentTestMeta.attemptId&&!h.completedAt){h.completedAt=new Date().toISOString();change=true}}if(change)setHistory(rows);return rows}
 function dateRows(){return history().map(h=>({...h,date:h.completedAt||h.date}))}
 function dashboard(){
  const root=$('qb-learning-dashboard');if(!root||blocked())return;
  const state=read(),rows=dateRows(),today=C.day(Date.now());
  const done=rows.filter(r=>C.day(r.date)===today).reduce((n,r)=>n+(Number(r.total)||0),0);
  const goal=Number.isInteger(state.goal)&&state.goal>=1&&state.goal<=1000?state.goal:20;
  const days=C.days(rows),max=Math.max(1,...days.map(d=>d.count));
  root.innerHTML='<div class="qb-tools-eyebrow">МОЯ ПОДГОТОВКА</div><div class="qb-goal-head"><div><strong>'+done+' <span>/ '+goal+'</span></strong><p>ответов сегодня · '+esc(getSubjectTitle())+'</p></div><span class="qb-streak">'+C.streak(rows)+' дн. подряд</span></div><progress max="'+goal+'" value="'+Math.min(done,goal)+'" aria-label="Дневная цель"></progress><div class="qb-week" role="img" aria-label="Ответы за последние семь дней: '+days.map(d=>d.day+': '+d.count).join('; ')+'">'+days.map(d=>'<div title="'+d.day+': '+d.count+'"><b>'+d.count+'</b><i style="height:'+Math.max(3,Math.round(d.count/max*44))+'px"></i><small>'+d.day.slice(8)+'</small></div>').join('')+'</div><div class="qb-goal-controls"><label for="qb-goal-input">Цель на день</label><input id="qb-goal-input" type="number" min="1" max="1000" value="'+goal+'" inputmode="numeric"><button type="button" id="qb-save-goal">Сохранить</button></div>';
  $('qb-save-goal').onclick=()=>{const n=Number($('qb-goal-input').value);if(!Number.isInteger(n)||n<1||n>1000){toast('Цель — от 1 до 1000 ответов.');$('qb-goal-input').focus();return}const v=read();v.goal=n;if(write(v)){dashboard();toast('Цель сохранена.')}};
 }
 function questionTools(){
  const panel=$('qb-question-tools');if(!panel)return;panel.hidden=!normal();if(!normal())return;
  const q=sessionQuestions[currentIdx],id=String(getQuestionId(q)),v=read();
  $('qb-flag-question').textContent=v.flags?.includes(id)?'⚑ Отмечен':'⚐ На потом';
  $('qb-flag-question').setAttribute('aria-pressed',String(!!v.flags?.includes(id)));
  $('qb-note-question').textContent=v.notes?.[id]?'✎ Заметка есть':'✎ Заметка';
 }
 function jump(kind){
  if(!normal())return;
  const flags=read().flags||[];
  const n=C.nextIndex(sessionQuestions.length,currentIdx,i=>kind==='flag'?flags.includes(String(getQuestionId(sessionQuestions[i]))):!confirmed[i]);
  if(n<0){toast(kind==='flag'?'Отмеченных вопросов нет.':'Все ответы подтверждены.');return}
  currentIdx=n;saveActiveSession(true);renderQuestion();
  document.querySelector('#test-screen .qb-question-scroll')?.scrollTo({top:0});
 }
 function flag(){if(!normal())return;const v=read(),id=String(getQuestionId(sessionQuestions[currentIdx]));const flags=new Set(Array.isArray(v.flags)?v.flags:[]);flags.has(id)?flags.delete(id):flags.add(id);v.flags=[...flags];if(write(v))questionTools()}
 function focusMode(){if(!normal())return;document.body.classList.toggle('qb-focus');$('qb-focus-toggle').setAttribute('aria-pressed',String(document.body.classList.contains('qb-focus')))}
 function openDialog(title,content){
  if(blocked())return;const dialog=$('qb-tools-dialog');if(dialog.open)dialog.close();focusBefore=document.activeElement;
  $('qb-tools-dialog-title').textContent=title;$('qb-tools-dialog-content').replaceChildren(content);
  dialog.showModal();
 }
 function note(){
  if(!normal())return;const subjectKey=key(),id=String(getQuestionId(sessionQuestions[currentIdx])),v=read();
  const box=document.createElement('div'),label=document.createElement('label'),area=document.createElement('textarea');
  label.htmlFor='qb-note-text';label.textContent='Личная заметка к этому вопросу';area.id='qb-note-text';area.maxLength=2000;area.rows=6;area.value=String(v.notes?.[id]||'');
  const hint=document.createElement('p');hint.className='qb-tools-muted';hint.textContent='До 2000 символов. Хранится только на этом устройстве.';
  box.append(label,area,hint,button('Сохранить заметку',()=>{if(subjectKey!==key()){$('qb-tools-dialog').close();return}const s=read();s.notes={...(s.notes||{})};const text=area.value.trim();if(text)s.notes[id]=text;else delete s.notes[id];if(write(s)){$('qb-tools-dialog').close();questionTools();toast(text?'Заметка сохранена.':'Заметка удалена.')}}));openDialog('Заметка',box);
 }
 function backup(){
  if(blocked())return;
  const data={format:'quizbot-learning',version:1,exportedAt:new Date().toISOString(),subject:window.currentSubjectKey,learning:read(),history:history(),favorites:getFavorites(),solved:getSolved(),mistakes:getMistakes()};
  download('quizbot-learning-'+storageSubjectKey()+'.json',JSON.stringify(data,null,2),'application/json');toast('Копия учебных данных выгружена.');
 }
 function notebook(){
  if(blocked())return;const box=document.createElement('div'),search=document.createElement('input'),list=document.createElement('div');
  search.type='search';search.placeholder='Поиск по заметкам и вопросам';search.setAttribute('aria-label','Поиск по заметкам');search.className='qb-notes-search';
  const notes=read().notes||{};const rows=database.filter(q=>Object.prototype.hasOwnProperty.call(notes,String(getQuestionId(q))));
  function draw(){const term=search.value.trim().toLocaleLowerCase();const filtered=rows.filter(q=>(q.question+' '+notes[String(getQuestionId(q))]).toLocaleLowerCase().includes(term));list.replaceChildren();for(const q of filtered){const item=document.createElement('article'),title=document.createElement('h3'),text=document.createElement('p');title.textContent=q.question;text.textContent=notes[String(getQuestionId(q))];item.className='qb-notebook-item';item.append(title,text);list.append(item)}if(!filtered.length)list.textContent=rows.length?'Ничего не найдено.':'Заметок пока нет. Создайте первую во время теста.'}
  search.addEventListener('input',draw);box.append(search,list);draw();openDialog('Мои заметки · '+getSubjectTitle(),box);
 }
 function resultTools(details){
  const root=$('qb-result-tools');if(!root)return;
  const rows=Array.isArray(details)?details:[];currentResult={subject:getSubjectTitle(),rows:rows.map(d=>({...d})),score:$('final-score')?.textContent||''};
  root.replaceChildren();
  const tabs=document.createElement('div');tabs.className='qb-tool-row';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Фильтр разбора');
  for(const [label,filter] of [['Все',()=>true],['Ошибки',d=>!d.isOk],['Верные',d=>!!d.isOk],['Без ответа',d=>['Нет ответа','Пропущено'].includes(d.user)]]){
   const b=button(label,()=>{const cards=[...$('review-container').children];cards.forEach((card,i)=>card.hidden=!filter(rows[i]));$('review-container').classList.remove('hidden');lastReviewVisible=true;for(const x of tabs.children)x.setAttribute('aria-pressed',String(x===b));toast('Показано: '+rows.filter(filter).length+' из '+rows.length)});b.setAttribute('aria-pressed',String(label==='Все'));tabs.append(b);
  }
  root.append(tabs,button('↓ CSV',()=>download('quizbot-result.csv',C.csv([['№','Предмет','Вопрос','Ваш ответ','Правильный ответ','Результат'],...rows.map(d=>[d.num,currentResult.subject,d.q,d.user,d.correct,d.isOk?'Верно':'Ошибка'])]),'text/csv;charset=utf-8')),button('Печать / PDF',printResult));
 }
 function printResult(){
  if(!currentResult||blocked())return;
  const sheet=$('qb-print-sheet');sheet.replaceChildren();const title=document.createElement('h1');title.textContent='QuizBot · '+currentResult.subject;sheet.append(title);
  const score=document.createElement('p');score.textContent='Результат: '+currentResult.score;sheet.append(score);
  for(const d of currentResult.rows){const item=document.createElement('article');for(const s of [d.num+'. '+d.q,'Ваш ответ: '+d.user,'Правильный ответ: '+d.correct]){const p=document.createElement('p');p.textContent=s;item.append(p)}sheet.append(item)}
  window.print();
 }
 function flashcards(){
  if(blocked())return;
  // Only use an already opened, access-checked study list.
  if(!active('list-screen')||!$('list-title').textContent.startsWith('Изучить тесты'))return;
  const qs=Array.isArray(currentDataView)?currentDataView:[];if(!qs.length){toast('Сначала загрузите вопросы.');return}
  let index=0,revealed=false;const box=document.createElement('div');box.className='qb-flashcard';
  function draw(){const q=qs[index];box.innerHTML='<p class="qb-tools-muted">Карточка '+(index+1)+' из '+qs.length+'</p><h3>'+esc(q.question)+'</h3><div class="qb-flash-answer">'+(revealed?esc(q.options[q.answer]):'Вспомните ответ перед открытием')+'</div>';box.append(button(revealed?'Скрыть ответ':'Показать ответ',()=>{revealed=!revealed;draw()}));const nav=document.createElement('div');nav.className='qb-tool-row';const prev=button('← Назад',()=>{index--;revealed=false;draw()}),next=button('Далее →',()=>{index++;revealed=false;draw()});prev.disabled=index===0;next.disabled=index===qs.length-1;nav.append(prev,next);box.append(nav)}draw();openDialog('Учебные карточки',box);
 }
 function shortcut(e){
  if(e.defaultPrevented||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||!normal()||$('qb-tools-dialog').open||document.querySelector('.qb-plus-overlay:not([hidden])')||document.querySelector('#side-drawer.open'))return;
  if(e.target.closest('input,textarea,select,button,a,[contenteditable="true"]'))return;
  if(/^[1-9]$/.test(e.key)){const n=Number(e.key)-1;if(!confirmed[currentIdx]){const option=$('options').children[n];if(option){e.preventDefault();option.click()}}}
  else if(e.key==='ArrowRight'){e.preventDefault();if(currentIdx<sessionQuestions.length-1){currentIdx++;renderQuestion();saveActiveSession(true)}}
  else if(e.key==='ArrowLeft'){e.preventDefault();if(currentIdx>0){currentIdx--;renderQuestion();saveActiveSession(true)}}
  else if(e.key.toLowerCase()==='f'){e.preventDefault();flag()}
  else if(e.key==='Enter'&&!confirmed[currentIdx]&&userAnswers[currentIdx]!==null){e.preventDefault();acceptAnswer()}
 }
 function install(){
  const status=document.createElement('div');status.id='qb-tools-status';status.className='qb-tools-toast';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
  const net=document.createElement('div');net.id='qb-network';net.className='qb-network';net.setAttribute('role','status');document.body.append(net);
  function connection(){net.hidden=navigator.onLine;net.textContent='Нет соединения. Ответы сохраняются на устройстве; отправка результатов требует сети.'}connection();window.addEventListener('online',connection);window.addEventListener('offline',connection);
  const dialog=document.createElement('dialog');dialog.id='qb-tools-dialog';dialog.innerHTML='<header><h2 id="qb-tools-dialog-title"></h2><button type="button" aria-label="Закрыть">×</button></header><div id="qb-tools-dialog-content"></div>';dialog.setAttribute('aria-labelledby','qb-tools-dialog-title');dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>focusBefore?.isConnected&&focusBefore.focus());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});document.body.append(dialog);

  const result=document.createElement('div');result.id='qb-result-tools';result.className='qb-result-tools';$('review-container').insertAdjacentElement('beforebegin',result);
  const cards=button('▣ Учебные карточки',flashcards);cards.id='qb-flashcards';cards.hidden=true;$('list-title').insertAdjacentElement('afterend',cards);
  const print=document.createElement('section');print.id='qb-print-sheet';document.body.append(print);
  const originalRender=window.renderQuestion;window.renderQuestion=function(){const r=originalRender.apply(this,arguments);questionTools();return r};
  const originalReview=window.renderReview;window.renderReview=function(details){const r=originalReview.apply(this,arguments);resultTools(details);return r};
  const originalScreen=window.showScreen;window.showScreen=function(id){const r=originalScreen.apply(this,arguments);if(id!=='test-screen'){document.body.classList.remove('qb-focus')}if(id==='start-screen')dashboard();if(id!=='list-screen')cards.hidden=true;if(dialog.open)dialog.close();return r};
  const originalList=window.showListScreen;window.showListScreen=function(title){const r=originalList.apply(this,arguments);cards.hidden=blocked()||!String(title).startsWith('Изучить тесты');return r};
  for(const name of ['finishTest','finishRealExam']){const fn=window[name];window[name]=function(){const before=history().length;const r=fn.apply(this,arguments);if(history().length>before){decorateHistory();dashboard()}return r}}
  const subject=window.setCurrentSubject;window.setCurrentSubject=function(){const r=subject.apply(this,arguments);dashboard();return r};
  document.addEventListener('keydown',shortcut);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active('start-screen'))dashboard()});
  dashboard();questionTools();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
