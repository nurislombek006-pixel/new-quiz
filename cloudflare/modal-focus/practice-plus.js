/* QuizBot enhanced practice UI: presentation layer only; existing tests, storage and subscriptions are unchanged. */
(function(){
'use strict';
if(window.__qbPracticePlusV1)return;
window.__qbPracticePlusV1=true;

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const SETTINGS_KEY='qb_practice_settings_v1';
const FEEDBACK_KEY='qb_feedback_settings_v1';
const preferred={motion:'gentle',density:'comfortable',buttons:'normal',contrast:'normal'};
const defaultFeedback={sound:false,vibration:false};
const allowed={motion:['gentle','lively','off'],density:['comfortable','compact'],buttons:['normal','large'],contrast:['normal','high']};
const safe=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const byId=id=>document.getElementById(id);
function read(key,fallback){
  try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'&&!Array.isArray(v)?v:{...fallback}}
  catch(e){return {...fallback}}
}
function save(key,data){try{localStorage.setItem(key,JSON.stringify(data))}catch(e){}}
const options=read(SETTINGS_KEY,preferred);
const feedback=read(FEEDBACK_KEY,defaultFeedback);
for(const [key,values] of Object.entries(allowed))if(!values.includes(options[key]))options[key]=preferred[key];
feedback.sound=feedback.sound===true;feedback.vibration=feedback.vibration===true;
let lastPremium=null;
let lastQuestionIndex=-1;
let lastQuestionSet=null;
let audioContext=null;
let navOverlay=null,statsOverlay=null,feedbackOverlay=null;
const premium=()=>{try{return !window.__quizbotHardBlocked&&typeof isPremiumUser==='function'&&isPremiumUser()===true}catch(e){return false}};
const normalActive=()=>{try{return !window.__quizbotHardBlocked&&!byId('test-screen').classList.contains('hidden')&&Array.isArray(sessionQuestions)&&sessionQuestions.length>0}catch(e){return false}};
function updatePremiumStyles(){
  const pro=premium();
  document.body.dataset.qbMotion=pro?options.motion:'gentle';
  document.body.dataset.qbDensity=pro?options.density:'comfortable';
  document.body.dataset.qbButtons=pro?options.buttons:'normal';
  document.body.dataset.qbContrast=pro?options.contrast:'normal';
  lastPremium=pro;
}
// Native modal dialogs keep Tab/focus inside and make the page behind inert.
const overlayOpeners=new WeakMap();
function restoreOverlayFocus(el){
 const opener=overlayOpeners.get(el);
 if(!opener)return;
 overlayOpeners.delete(el);
 const inClosedDrawer=opener.closest?.('#side-drawer:not(.open)');
 const visible=opener.isConnected&&!opener.disabled&&!inClosedDrawer&&opener.getClientRects().length>0;
 const target=visible?opener:byId('menu-toggle');
 if(target&&!target.closest('[inert]'))target.focus({preventScroll:true});
}
function closeOverlay(el){
 if(!el||(!el.open&&el.hidden))return;
 if(el.open)el.close();
 el.hidden=true;
 restoreOverlayFocus(el);
}
function closeAllOverlays(){closeOverlay(navOverlay);closeOverlay(statsOverlay);closeOverlay(feedbackOverlay)}
function makeOverlay(cls,title,description){
 const outer=document.createElement('dialog');
 outer.className='qb-plus-overlay '+cls;
 outer.hidden=true;
 outer.innerHTML='<div class="qb-plus-dialog"><header class="qb-plus-head"><div><h2>'+safe(title)+'</h2><p>'+safe(description)+'</p></div><button type="button" class="qb-plus-close" aria-label="Закрыть">×</button></header><div class="qb-plus-body"></div></div>';
 const heading=outer.querySelector('h2');
 heading.id=cls+'-title';
 outer.setAttribute('aria-labelledby',heading.id);
 outer.addEventListener('cancel',e=>{e.preventDefault();closeOverlay(outer)});
 outer.addEventListener('close',()=>{if(!outer.open){outer.hidden=true;restoreOverlayFocus(outer)}});
 outer.querySelector('.qb-plus-close').addEventListener('click',()=>closeOverlay(outer));
 outer.addEventListener('click',e=>{if(e.target===outer)closeOverlay(outer)});
 document.body.appendChild(outer);
 return outer;
}
function showOverlay(el){
 if(!el||el.open)return;
 overlayOpeners.set(el,document.activeElement);
 el.hidden=false;
 el.showModal();
 $('.qb-plus-close',el)?.focus({preventScroll:true});
}
function installProgress(){
 const screen=byId('test-screen');
 const head=$('.screen-head',screen);
 if(!head||byId('qb-test-progress'))return;
 const progress=document.createElement('div');
 progress.id='qb-test-progress';
 progress.className='qb-progress-panel';
 progress.innerHTML='<div class="qb-progress-line"><span id="qb-progress-heading">Вопрос 1 из 1</span><button type="button" id="qb-open-question-map" class="qb-map-open" aria-label="Навигация по вопросам">▦ Номера</button></div><div class="qb-progress-track" role="progressbar" aria-label="Доля подтверждённых ответов" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="qb-progress-fill"></span></div><div id="qb-progress-counts" class="qb-progress-counts">Подтверждено: 0</div>';
 head.insertAdjacentElement('afterend',progress);
 byId('qb-open-question-map').addEventListener('click',openMap);
}
function readTest(){
 if(!normalActive())return null;
 const list=sessionQuestions;
 const accepted=Array.isArray(confirmed)?confirmed:[];
 const picked=Array.isArray(userAnswers)?userAnswers:[];
 let done=0,correct=0,wrong=0;
 for(let i=0;i<list.length;i++){
   if(accepted[i]===true){
     done++;
     if(picked[i]===list[i]?.answer)correct++;else wrong++;
   }
 }
 return {list,accepted,picked,index:Math.max(0,Math.min(list.length-1,Number(currentIdx)||0)),done,correct,wrong};
}
function refreshProgress(){
 const state=readTest(),panel=byId('qb-test-progress');
 if(!panel)return;
 panel.hidden=!state;
 if(!state)return;
 byId('qb-progress-heading').textContent='Вопрос '+(state.index+1)+' из '+state.list.length;
 byId('qb-progress-counts').textContent='Подтверждено: '+state.done+' · ✓ '+state.correct+' · ✕ '+state.wrong;
 const percent=Math.round(state.done/state.list.length*100);
 byId('qb-progress-fill').style.width=percent+'%';
 $('.qb-progress-track',panel).setAttribute('aria-valuenow',String(percent));
 if(navOverlay&&!navOverlay.hidden)renderMap();
}
function animateNewQuestion(state){
 if(!state)return;
 const changed=lastQuestionIndex!==state.index||lastQuestionSet!==state.list;
 lastQuestionIndex=state.index;lastQuestionSet=state.list;
 if(!changed||document.body.dataset.qbMotion==='off'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 const scroll=$('#test-screen .qb-question-scroll');
 if(!scroll)return;
 scroll.classList.remove('qb-question-enter');
 void scroll.offsetWidth;
 scroll.classList.add('qb-question-enter');
}
function installQuestionHooks(){
 const original=window.renderQuestion;
 if(typeof original==='function'){
   window.renderQuestion=function(){
     const result=original.apply(this,arguments);
     const state=readTest();
     refreshProgress();
     animateNewQuestion(state);
     return result;
   };
 }
 const oldScreen=window.showScreen;
 if(typeof oldScreen==='function')window.showScreen=function(id){
   if(id!=='test-screen')closeOverlay(navOverlay);
   const r=oldScreen.apply(this,arguments);
   if(id==='test-screen')refreshProgress();
   return r;
 };
}
function initMap(){
 navOverlay=makeOverlay('qb-map-overlay','Навигация по вопросам','Выберите номер вопроса. Ваши ответы сохраняются.');
 $('.qb-plus-body',navOverlay).innerHTML='<div class="qb-map-legend"><span>🟢 Правильно</span><span>🔴 Ошибка</span><span>🟡 Выбран</span><span>⚪ Пропущен</span></div><div id="qb-map-numbers" class="qb-map-grid"></div><div class="qb-map-jump"><label for="qb-map-number-input">Перейти к номеру</label><input type="number" id="qb-map-number-input" min="1" inputmode="numeric"><button id="qb-map-jump-btn" type="button">Перейти</button></div><p id="qb-map-note" class="qb-map-note"></p>';
 byId('qb-map-jump-btn').addEventListener('click',()=>{
   const n=Number(byId('qb-map-number-input').value);
   const state=readTest();
   if(!state||!Number.isInteger(n)||n<1||n>state.list.length)return;
   jumpTo(n-1);
 });
 byId('qb-map-number-input').addEventListener('keydown',e=>{
   if(e.key==='Enter')byId('qb-map-jump-btn').click();
 });
}
function jumpTo(index){
 const state=readTest();
 if(!state||!Number.isInteger(index)||index<0||index>=state.list.length)return;
 currentIdx=index;
 try{if(typeof saveActiveSession==='function')saveActiveSession(true)}catch(e){}
 if(typeof window.renderQuestion==='function')window.renderQuestion();
 const scroll=$('#test-screen .qb-question-scroll');
 if(scroll)scroll.scrollTop=0;
 closeOverlay(navOverlay);
}
function renderMap(){
 const state=readTest();
 if(!state)return;
 const grid=byId('qb-map-numbers');
 grid.replaceChildren();
 const n=state.list.length;
 let indexes=[];
 if(n<=500){for(let i=0;i<n;i++)indexes.push(i)}
 else{
   const set=new Set();
   for(let i=0;i<90;i++)set.add(i);
   for(let i=Math.max(0,state.index-90);i<Math.min(n,state.index+91);i++)set.add(i);
   for(let i=n-30;i<n;i++)set.add(i);
   indexes=[...set].sort((a,b)=>a-b);
 }
 let previous=-1;
 const fragment=document.createDocumentFragment();
 for(const i of indexes){
   if(previous>=0&&i>previous+1){
     const gap=document.createElement('span');
     gap.className='qb-map-ellipsis';gap.textContent='···';fragment.appendChild(gap);
   }
   const b=document.createElement('button');
   b.type='button';b.className='qb-map-number';b.textContent=String(i+1);
   b.dataset.status=state.accepted[i]?(state.picked[i]===state.list[i]?.answer?'correct':'wrong'):(state.picked[i]!==null&&state.picked[i]!==undefined?'selected':'empty');
   if(i===state.index){b.classList.add('current');b.setAttribute('aria-current','step')}
   b.setAttribute('aria-label','Вопрос '+(i+1));
   b.addEventListener('click',()=>jumpTo(i));
   fragment.appendChild(b);
   previous=i;
 }
 grid.appendChild(fragment);
 byId('qb-map-number-input').max=String(n);
 byId('qb-map-number-input').value=String(state.index+1);
 byId('qb-map-note').textContent=n>500?'Показана часть номеров. Для любого другого используйте поле перехода.':'Подтверждённые ответы изменить нельзя.';
}
function openMap(){
 if(!normalActive())return;
 renderMap();
 showOverlay(navOverlay);
}
function parseHistory(){
 const rows=[];
 try{
 for(let i=0;i<localStorage.length;i++){
   const key=localStorage.key(i);
   if(!key||!key.startsWith('test_history_v10_'))continue;
   let arr;try{arr=JSON.parse(localStorage.getItem(key)||'[]')}catch(e){continue}
   if(!Array.isArray(arr))continue;
   for(let j=0;j<arr.length;j++){
     const h=arr[j];if(!h||typeof h!=='object')continue;
     const score=String(h.score||'').match(/(\d+)\s*\/\s*(\d+)/);
     const total=Number(h.total??(score?score[2]:0));
     const correct=Number(h.correct??(score?score[1]:0));
     if(!Number.isFinite(total)||!Number.isFinite(correct)||total<=0||correct<0||correct>total)continue;
     const subject=String(h.subject||key.slice('test_history_v10_'.length)||'Без названия');
     const raw=String(h.date||'');
     const m=raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[, ]+\s*(\d{1,2}):(\d{2}))?/);
     const timestamp=m?new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0)).getTime():Date.parse(raw);
     rows.push({subject,correct,total,pct:Math.round(correct/total*100),date:raw,ts:Number.isFinite(timestamp)?timestamp:0,mode:String(h.mode||'Тест'),pos:rows.length});
   }
 }
 }catch(e){}
 rows.sort((a,b)=>(a.ts||0)-(b.ts||0)||a.pos-b.pos);
 return rows;
}
function groupStats(rows){
 const grouped=new Map();
 for(const row of rows){
   if(!grouped.has(row.subject))grouped.set(row.subject,{name:row.subject,runs:0,correct:0,total:0,best:0});
   const x=grouped.get(row.subject);
   x.runs++;x.correct+=row.correct;x.total+=row.total;x.best=Math.max(x.best,row.pct);
 }
 return [...grouped.values()].sort((a,b)=>b.runs-a.runs||a.name.localeCompare(b.name,'ru'));
}
function initStats(){
 statsOverlay=makeOverlay('qb-stats-overlay','Статистика подготовки','Результаты из вашей сохранённой истории тестов.');
 const group=$('#side-drawer [aria-label="Практика и результаты"]');
 if(group){
   const btn=document.createElement('button');
   btn.type='button';btn.className='drawer-item qb-drawer-item';
   btn.innerHTML='<span class="qb-drawer-icon" aria-hidden="true">📊</span><span class="qb-drawer-item-name">Подробная статистика</span><span class="qb-drawer-arrow" aria-hidden="true">›</span>';
   group.appendChild(btn);
   btn.addEventListener('click',()=>{window.closeDrawer?.();if(window.__quizbotHardBlocked)return;renderStats();showOverlay(statsOverlay)});
 }
}
function renderStats(){
 const box=$('.qb-plus-body',statsOverlay);
 const rows=parseHistory();
 if(!rows.length){box.innerHTML='<div class="qb-stats-empty">Пока нет завершённых попыток. После первого теста здесь появятся графики и результаты.</div>';return}
 const correct=rows.reduce((n,r)=>n+r.correct,0),total=rows.reduce((n,r)=>n+r.total,0);
 const accuracy=Math.round(correct/total*100);
 const best=Math.max(...rows.map(r=>r.pct));
 const subjects=groupStats(rows);
 const recent=rows.slice(-12).reverse();
 let html='<div class="qb-stats-cards">'+
 '<div><b>'+rows.length+'</b><span>Попыток</span></div>'+
 '<div><b>'+accuracy+'%</b><span>Точность</span></div>'+
 '<div><b>'+best+'%</b><span>Лучший результат</span></div>'+
 '<div><b>'+total+'</b><span>Ответов</span></div></div>';
 html+='<h3>По предметам</h3><div class="qb-stats-subjects">';
 for(const s of subjects){
   const pct=Math.round(s.correct/s.total*100);
   html+='<div class="qb-stats-subject"><div class="qb-stats-label"><strong>'+safe(s.name)+'</strong><span>'+pct+'% · '+s.runs+' попыток</span></div><div class="qb-stats-track"><span style="width:'+pct+'%"></span></div><small>'+s.correct+' правильных из '+s.total+' · лучший '+s.best+'%</small></div>';
 }
 html+='</div><h3>Последние попытки</h3><div class="qb-stats-history">';
 for(const r of recent){
   html+='<div class="qb-stats-entry"><div class="qb-stats-label"><strong>'+safe(r.subject)+'</strong><span>'+r.pct+'%</span></div><div class="qb-stats-track"><span style="width:'+r.pct+'%"></span></div><small>'+safe(r.mode)+' · '+r.correct+'/'+r.total+(r.date?' · '+safe(r.date):'')+'</small></div>';
 }
 html+='</div><p class="qb-stats-footnote">Точность рассчитана по всем засчитанным ответам. История хранится на этом устройстве, как и раньше.</p>';
 box.innerHTML=html;
}
function initFeedback(){
 feedbackOverlay=makeOverlay('qb-feedback-overlay','Звук и вибрация','Отклик при решении теста. Обе функции по умолчанию выключены.');
 const panel=$('.qb-plus-body',feedbackOverlay);
 panel.innerHTML='<label class="qb-toggle-row"><span><strong>🔊 Звуки ответов</strong><small>Короткие сигналы при выборе и подтверждении</small></span><input type="checkbox" id="qb-sound-toggle"></label><label class="qb-toggle-row"><span><strong>📳 Вибрация</strong><small>Мягкая отдача, если поддерживается устройством</small></span><input type="checkbox" id="qb-vibration-toggle"></label><p class="qb-settings-note">На некоторых устройствах Telegram или Safari вибрация и звук могут быть недоступны.</p>';
 const snd=byId('qb-sound-toggle'),vib=byId('qb-vibration-toggle');
 snd.checked=feedback.sound;vib.checked=feedback.vibration;
 snd.addEventListener('change',()=>{feedback.sound=snd.checked;save(FEEDBACK_KEY,feedback);if(snd.checked)playSound('tap')});
 vib.addEventListener('change',()=>{feedback.vibration=vib.checked;save(FEEDBACK_KEY,feedback);if(vib.checked)vibrate('tap')});
 const section=$('#side-drawer [aria-label="Настройки и доступ"]');
 if(section){
   const btn=document.createElement('button');btn.type='button';btn.className='drawer-item qb-drawer-item';
   btn.innerHTML='<span class="qb-drawer-icon" aria-hidden="true">🎵</span><span class="qb-drawer-item-name">Звук и вибрация</span><span class="qb-drawer-arrow" aria-hidden="true">›</span>';
   section.appendChild(btn);
   btn.addEventListener('click',()=>{window.closeDrawer?.();if(window.__quizbotHardBlocked)return;showOverlay(feedbackOverlay)});
 }
}
function playSound(kind){
 if(!feedback.sound)return;
 try{
   const Ctx=window.AudioContext||window.webkitAudioContext;
   if(!Ctx)return;
   if(!audioContext)audioContext=new Ctx();
   if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
   const now=audioContext.currentTime;
   const osc=audioContext.createOscillator(),vol=audioContext.createGain();
   const hz=kind==='correct'?740:kind==='wrong'?310:480;
   osc.type='sine';osc.frequency.setValueAtTime(hz,now);
   vol.gain.setValueAtTime(.0001,now);
   vol.gain.exponentialRampToValueAtTime(.028,now+.015);
   vol.gain.exponentialRampToValueAtTime(.0001,now+.09);
   osc.connect(vol);vol.connect(audioContext.destination);
   osc.start(now);osc.stop(now+.10);
 }catch(e){}
}
function vibrate(kind){
 if(!feedback.vibration)return;
 try{
   const h=window.Telegram?.WebApp?.HapticFeedback;
   if(h){
     if(kind==='correct'||kind==='wrong')h.notificationOccurred(kind==='correct'?'success':'error');
     else h.impactOccurred('light');
   }else if(typeof navigator.vibrate==='function')navigator.vibrate(kind==='wrong'?30:12);
 }catch(e){}
}
function installFeedbackEvents(){
 const test=byId('test-screen');
 if(!test)return;
 test.addEventListener('click',e=>{
   if(!normalActive())return;
   if(e.target.closest('#options .option')){playSound('tap');vibrate('tap')}
   else if(e.target.closest('#accept-btn')){
     queueMicrotask(()=>{try{
       if(confirmed[currentIdx]===true){
         const ok=userAnswers[currentIdx]===sessionQuestions[currentIdx]?.answer;
         playSound(ok?'correct':'wrong');vibrate(ok?'correct':'wrong');
       }
     }catch(e){} });
   }
   else if(e.target.closest('#next-btn,#prev-btn,#skip-btn')){playSound('tap');vibrate('tap')}
 },true);
}
function initAdvanced(){
 const panel=$('.qb-palette-dialog');
 if(!panel||$('.qb-advanced',panel))return;
 const advanced=document.createElement('section');advanced.className='qb-advanced';
 advanced.innerHTML='<h3>Дополнительные настройки PRO</h3><p>Ваши предпочтения сохраняются на этом устройстве.</p>'+
 '<label>Переходы между вопросами<select data-option="motion"><option value="gentle">Плавные</option><option value="lively">Выразительные</option><option value="off">Без анимаций</option></select></label>'+
 '<label>Плотность интерфейса<select data-option="density"><option value="comfortable">Комфортная</option><option value="compact">Компактная</option></select></label>'+
 '<label>Размер кнопок<select data-option="buttons"><option value="normal">Обычный</option><option value="large">Увеличенный</option></select></label>'+
 '<label>Контрастность<select data-option="contrast"><option value="normal">Стандартная</option><option value="high">Повышенная</option></select></label>';
 panel.appendChild(advanced);
 $$('select[data-option]',advanced).forEach(select=>{
   const key=select.dataset.option;
   select.value=options[key];
   select.addEventListener('change',()=>{
     if(!premium()){select.value=options[key];return}
     if(!allowed[key].includes(select.value))return;
     options[key]=select.value;
     save(SETTINGS_KEY,options);
     updatePremiumStyles();
   });
 });
}
function init(){
 installProgress();
 initMap();
 initStats();
 initFeedback();
 initAdvanced();
 installQuestionHooks();
 installFeedbackEvents();
 refreshProgress();
 updatePremiumStyles();
 setInterval(()=>{const now=premium();if(lastPremium!==now)updatePremiumStyles()},3500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
