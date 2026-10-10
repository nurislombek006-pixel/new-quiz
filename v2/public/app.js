import {extractFile,parseQuestions} from './importer.js';
const $=id=>document.getElementById(id);
const tg=window.Telegram?.WebApp;
let session=null,subjects=[],usersOffset=0,quiz=[],questionNo=0,correct=0,answered=false,importQueue=[],busyUsers=false,activePage='home',activeSection='users',lastStateAt=0,usersSearch='';
const create=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e};
const text=(id,value)=>{$(id).textContent=String(value??'')};
function showNotice(value){const n=$('notice');n.textContent=value;n.classList.toggle('hidden',!value)}
function toast(message){const e=$('toast');e.textContent=message;e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),2800)}
function readableTime(t){if(!t)return 'Нет активности';const diff=Math.max(0,Math.floor(Date.now()/1000)-Number(t));if(diff<8)return 'только что';if(diff<60)return diff+' сек. назад';if(diff<3600)return Math.floor(diff/60)+' мин. назад';if(diff<86400)return Math.floor(diff/3600)+' ч. назад';return new Date(t*1000).toLocaleString('ru-RU')}
function humanError(e){return String(e.message||e)}
async function api(path,method='GET',data){
  const initData=tg?.initData||'';
  if(!initData)throw Error('Откройте приложение кнопкой из Telegram-бота.');
  const opt={method,headers:{'X-Telegram-Init-Data':initData},cache:'no-store'};
  if(data!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(data)}
  const response=await fetch(path,opt);let res;
  try{res=await response.json()}catch{throw Error('Сервер вернул неверный ответ (HTTP '+response.status+')')}
  if(!response.ok||res.ok===false)throw Error(res.error||'HTTP '+response.status);
  return res;
}
const escName=u=>[u.first_name,u.last_name].filter(Boolean).join(' ')||('ID '+u.telegram_id);
function routePage(page){
  if(page==='admin'&&!session?.admin)return;
  activePage=page;
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
  document.querySelectorAll('.nav-button').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  if(page==='admin')refreshAdmin();if(page==='quiz')refreshSubjects();window.scrollTo({top:0,behavior:'smooth'});
}
function routeAdmin(section){
  activeSection=section;
  document.querySelectorAll('.admin-section').forEach(el=>el.classList.toggle('active',el.id==='admin-'+section));
  document.querySelectorAll('.subnav-button').forEach(el=>el.classList.toggle('active',el.dataset.section===section));
  if(section==='users')refreshUsers(true);if(section==='content')refreshSubjects();
}
function showSession(x){
  session=x;
  const user=x.user||{};
  text('my-name',user.username?'@'+user.username:user.first_name||'Пользователь');
  const premium=Number(user.premium_until||0)>Date.now()/1000;
  $('prem-badge').classList.toggle('hidden',!premium);
  text('home-premium',premium?'Premium':'Обычный');
  $('admin-nav').classList.toggle('hidden',!x.admin);
  $('online-status').classList.add('live');
  if(user.is_banned&&!x.admin)showNotice('Вы заблокированы: '+(user.ban_reason||'Обратитесь к администратору'));
  else showNotice('');
}
async function refreshState(){
  if(!session||document.hidden)return;
  try{
    const x=await api('/api/state');lastStateAt=Date.now();
    if(session.user.version!==x.user.version||session.user.is_banned!==x.user.is_banned||session.user.premium_until!==x.user.premium_until){
      showSession({...session,user:x.user});toast('Ваш статус доступа обновлён');
    }
  }catch(e){if(/блокир|Forbidden|403/.test(humanError(e)))showNotice(humanError(e));}
}
async function ping(){
  if(!session||document.hidden)return;
  try{
    const x=await api('/api/ping','POST');
    if(x.banned&&!session.admin){showNotice('Ваш аккаунт заблокирован.');}
    if(session.user.version!==x.version)await refreshState();
  }catch(e){console.warn('Activity ping',e)}
}
async function refreshSubjects(){
  if(!session)return;
  try{
    const x=await api('/api/subjects');subjects=x.subjects||[];
    text('home-subjects',subjects.length);
    text('home-questions',subjects.reduce((n,s)=>n+Number(s.count||0),0));
    const list=$('home-subject-list');list.replaceChildren();
    if(!subjects.length)list.append(create('p','muted','Предметы пока не добавлены.'));
    for(const s of subjects){
      const row=create('div','list-subject');const info=create('div');
      info.append(create('strong','',s.title),create('span','',s.count+' вопросов'));
      const b=create('button','button subtle','Открыть →');b.onclick=()=>{$('quiz-subject').value=s.id;routePage('quiz')};
      row.append(info,b);list.append(row);
    }
    for(const id of ['quiz-subject','import-subject']){
      const el=$(id),value=el.value;el.replaceChildren();
      for(const s of subjects){const o=create('option','',s.title);o.value=s.id;el.append(o)}
      if(subjects.some(s=>s.id===value))el.value=value;
    }
    if(session.admin){
      const target=$('admin-subjects');target.replaceChildren();
      for(const s of subjects){
        const row=create('div','list-subject');
        row.append(create('span','',s.title+' ('+s.count+')'));
        const b=create('button','button subtle','Выбрать');
        b.onclick=()=>{text('subject-id',s.id);$('subject-id').value=s.id;$('subject-title').value=s.title};
        row.append(b);target.append(row);
      }
      if(!subjects.length)target.append(create('p','small muted','Нет предметов. Создайте первый.'));
    }
  }catch(e){toast(humanError(e))}
}
let refreshCount=0;
async function refreshAdmin(){if(!session?.admin)return;await Promise.all([refreshUsers(true),refreshAdminStats()])}
async function refreshAdminStats(){
  if(!session?.admin)return;
  try{const r=await api('/api/admin/stats');text('home-questions',r.questions||0)}catch(e){console.warn(e)}
}
async function refreshUsers(reset=true){
  if(!session?.admin||busyUsers||document.hidden)return;
  busyUsers=true;
  try{
    const offset=reset?0:usersOffset;
    const x=await api('/api/admin/users?offset='+offset+'&q='+encodeURIComponent(usersSearch));
    text('stat-users',x.totals.total||0);text('stat-online',x.totals.online||0);text('stat-premium',x.totals.premium||0);
    const list=$('users-list');if(reset){list.replaceChildren();usersOffset=0}
    for(const user of x.users){
      const row=create('div','user-row'),meta=create('div','user-meta'),extra=create('div','user-extra');
      meta.append(create('strong','',escName(user)));
      const line=create('small','',user.telegram_id+' · ');
      const username=String(user.username||'');
      if(/^[A-Za-z0-9_]{5,32}$/.test(username)){
        const a=create('a','',('@'+username));a.href='https://t.me/'+username;a.target='_blank';a.rel='noopener noreferrer';line.append(a);
      }else line.append(create('span','',username?'@'+username:'без username'));
      meta.append(line);
      const online=user.last_seen>=(x.server_time-45);
      extra.append(create('span',online?'online':'offline',online?'● В сети':readableTime(user.last_seen)));
      if(user.is_banned)extra.append(create('span','mini-tag banned','Заблокирован'));
      else if(user.premium_until>x.server_time)extra.append(create('span','mini-tag','👑 Premium'));
      const btn=create('button','button subtle','Управлять');
      btn.onclick=()=>{$('target-id').value=user.telegram_id;routeAdmin('access');toast('ID подставлен')};
      extra.append(btn);row.append(meta,extra);list.append(row);
    }
    usersOffset=x.next_offset??usersOffset+x.users.length;
    $('users-more').classList.toggle('hidden',x.next_offset===null);
    if(!x.users.length&&reset)list.append(create('p','muted','Пользователи не найдены'));
  }catch(e){toast(humanError(e))}
  finally{busyUsers=false}
}
async function accessChange(action){
  const id=$('target-id').value.trim();
  if(!/^[1-9]\d{0,18}$/.test(id)){toast('Введите корректный Telegram ID');return}
  const map={premium:'выдать Premium',revoke:'снять Premium',ban:'заблокировать',unban:'разблокировать'};
  if(!window.confirm('Подтвердить действие: '+map[action]+' для '+id+'?'))return;
  const btn=document.querySelector('[data-access="'+action+'"]');btn.disabled=true;
  try{
    await api('/api/admin/access','POST',{telegram_id:id,action,days:Number($('premium-days').value),reason:$('ban-reason').value});
    text('access-result','Применено: '+map[action]+'. Изменение уже записано в базу.');
    toast('Готово ✓');refreshUsers(true);
  }catch(e){toast(humanError(e));text('access-result',humanError(e))}
  finally{btn.disabled=false}
}
async function saveSubject(deleting=false){
  const id=$('subject-id').value.trim(),title=$('subject-title').value.trim();
  if(!id){toast('Введите ключ предмета');return}
  if(deleting&&!window.confirm('Удалить предмет '+id+' и ВСЕ его вопросы?'))return;
  try{await api('/api/admin/subject','POST',{id,title,action:deleting?'delete':'save'});toast(deleting?'Предмет удалён':'Предмет сохранён');await refreshSubjects()}catch(e){toast(humanError(e))}
}
function previewImport(){
  const value=$('import-text').value;
  const result=parseQuestions(value,$('import-topic').value.trim()||'Общие');
  importQueue=result.questions;
  const errors=result.errors;
  text('import-result',importQueue.length+' готовых вопросов. '+(errors.length?errors.length+' ошибок: '+errors.slice(0,4).join('; '):'Ошибок нет.'));
  const sample=$('import-sample');sample.replaceChildren();
  for(const q of importQueue.slice(0,3)){
    const div=create('div','question-preview');div.append(create('strong','',q.text));
    for(let i=0;i<4;i++)div.append(create('div','',String.fromCharCode(97+i)+') '+q.options[i]+(q.correct_index===i?' ✓':'')));
    sample.append(div);
  }
  $('import-submit').disabled=!importQueue.length||!!errors.length;
  return !errors.length&&importQueue.length>0;
}
async function loadDocument(file){
  if(!file)return;
  $('import-submit').disabled=true;toast('Читаем '+file.name);
  try{
    $('import-text').value=await extractFile(file);
    const ok=previewImport();toast(ok?'Файл распознан':'Проверьте формат вопросов');
  }catch(e){text('import-result',humanError(e));toast(humanError(e))}
}
async function importQuestions(){
  if(!previewImport())return;
  const subject=$('import-subject').value;if(!subject){toast('Сначала добавьте предмет');return}
  if(!window.confirm('Добавить '+importQueue.length+' вопросов в "'+subjects.find(s=>s.id===subject)?.title+'"?'))return;
  const button=$('import-submit');button.disabled=true;let total=0;
  try{
    for(let i=0;i<importQueue.length;i+=100){
      const chunk=importQueue.slice(i,i+100);
      const x=await api('/api/admin/import','POST',{subject,questions:chunk});
      total+=Number(x.inserted||0);
      text('import-result','Сохранено '+total+' / '+importQueue.length);
    }
    toast('Загружено '+total+' вопросов ✓');importQueue=[];$('import-text').value='';$('import-sample').replaceChildren();
    await refreshSubjects();
  }catch(e){text('import-result','Сохранено '+total+' вопросов. Ошибка: '+humanError(e));toast(humanError(e))}
  finally{button.disabled=false}
}
async function beginQuiz(){
  const subject=$('quiz-subject').value;if(!subject){toast('Сначала добавьте предмет');return}
  try{
    const r=await api('/api/questions?subject='+encodeURIComponent(subject)+'&limit='+encodeURIComponent($('quiz-count').value));
    quiz=r.questions||[];if(!quiz.length){toast('Для этого предмета пока нет вопросов');return}
    if(quiz.length<Number($('quiz-count').value))toast('Доступно '+quiz.length+' вопросов');
    questionNo=0;correct=0;
    $('quiz-setup').classList.add('hidden');$('quiz-result').classList.add('hidden');$('quiz-running').classList.remove('hidden');
    showQuestion();
  }catch(e){toast(humanError(e))}
}
function showQuestion(){
  const q=quiz[questionNo];answered=false;
  text('quiz-counter','Вопрос '+(questionNo+1)+' / '+quiz.length);
  text('quiz-score','Верно: '+correct);text('quiz-topic',q.topic);text('quiz-question',q.text);
  $('quiz-progress').style.width=((questionNo)/quiz.length*100)+'%';
  $('quiz-next').classList.add('hidden');
  const root=$('quiz-answers');root.replaceChildren();
  q.options.forEach((option,i)=>{
    const b=create('button','answer',String.fromCharCode(65+i)+'. '+option);
    b.addEventListener('click',()=>{
      if(answered)return;answered=true;if(i===q.correct_index)correct++;
      root.querySelectorAll('button').forEach((el,j)=>{el.disabled=true;if(j===q.correct_index)el.classList.add('correct');else if(j===i)el.classList.add('wrong')});
      text('quiz-score','Верно: '+correct);$('quiz-next').classList.remove('hidden');
    });
    root.append(b);
  });
}
function nextQuestion(){
  if(!answered)return;questionNo++;
  if(questionNo>=quiz.length){
    $('quiz-running').classList.add('hidden');$('quiz-result').classList.remove('hidden');
    text('quiz-result-text',correct+' / '+quiz.length);return;
  }
  showQuestion();
}
async function boot(){
  document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>routePage(el.dataset.page));
  document.querySelectorAll('[data-section]').forEach(el=>el.onclick=()=>routeAdmin(el.dataset.section));
  $('open-quiz').onclick=()=>routePage('quiz');
  $('quiz-start').onclick=beginQuiz;$('quiz-next').onclick=nextQuestion;
  $('quiz-restart').onclick=()=>{$('quiz-setup').classList.remove('hidden');$('quiz-result').classList.add('hidden')};
  $('users-find').onclick=()=>{usersSearch=$('users-search').value.trim();refreshUsers(true)};
  $('users-search').addEventListener('keydown',e=>{if(e.key==='Enter')$('users-find').click()});
  $('users-more').onclick=()=>refreshUsers(false);
  $('admin-refresh').onclick=refreshAdmin;
  document.querySelectorAll('[data-access]').forEach(el=>el.onclick=()=>accessChange(el.dataset.access));
  $('subject-save').onclick=()=>saveSubject(false);$('subject-delete').onclick=()=>saveSubject(true);
  $('import-file').onchange=e=>loadDocument(e.target.files?.[0]);
  $('import-preview').onclick=previewImport;$('import-submit').onclick=importQuestions;
  $('import-text').addEventListener('input',()=>{importQueue=[];$('import-submit').disabled=true});
  try{
    tg?.ready();tg?.expand();
    const x=await api('/api/session');showSession(x);await refreshSubjects();
    if(x.admin&&location.hash==='#admin')routePage('admin');
    setInterval(()=>{if(!document.hidden)ping()},25000);
    setInterval(()=>{if(!document.hidden)refreshState()},8000);
    setInterval(()=>{if(activePage==='admin'&&activeSection==='users'&&!document.hidden)refreshUsers(true)},4000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){ping();refreshState();if(activePage==='admin')refreshAdmin()}});
  }catch(e){showNotice(humanError(e));text('my-name','Не авторизован');console.warn(e)}
}
boot();
