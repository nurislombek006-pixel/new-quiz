/* Compact owner admin — people who used this QuizBot Mini App only.
   No Telegram online/last-seen data is requested or inferred. */
'use strict';
let visitedUsers=[];
let usersVisibleCount=60;
let usersRequest=null;

function activityTime(d){
  const n=Date.parse(d||'');
  return Number.isFinite(n)?new Date(n).toLocaleString('ru-RU',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  }):'—';
}
function activityAge(d){
  const diff=Date.now()-Date.parse(d||'');
  if(!Number.isFinite(diff)||diff<0)return 'Неизвестно';
  if(diff<60000)return 'Только что';
  if(diff<3600000)return Math.floor(diff/60000)+' мин назад';
  if(diff<86400000)return Math.floor(diff/3600000)+' ч назад';
  return Math.floor(diff/86400000)+' дн назад';
}
function recentlyInApp(user){
  const age=Date.now()-Date.parse(user?.last_seen||'');
  return Number.isFinite(age)&&age>=0&&age<=120000;
}
async function refreshUsers(){
  const target=document.getElementById('userList');
  if(!target)return;
  if(usersRequest)return usersRequest;
  const initData=ownerInitData();
  if(!initData){
    target.innerHTML='<div class="empty">Откройте админку внутри QuizBot</div>';
    return;
  }
  if(!visitedUsers.length)target.innerHTML='<div class="empty">Загрузка активности…</div>';
  usersRequest=(async()=>{
    try{
      const res=await fetch('/api/admin/users',{
        headers:{'X-Telegram-Init-Data':initData},
        cache:'no-store',credentials:'same-origin'
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data?.ok)throw new Error(data.error||'Ошибка '+res.status);
      visitedUsers=Array.isArray(data.users)?data.users:[];
      const stats=document.getElementById('userStats');
      if(stats)stats.innerHTML=
        '<div class="stat"><b>'+visitedUsers.length+'</b><span>Посетили</span></div>'+
        '<div class="stat"><b>'+(Number(data.stats?.today)||0)+'</b><span>За 24 часа</span></div>'+
        '<div class="stat"><b>'+(Number(data.stats?.recent)||0)+'</b><span>Недавно</span></div>';
      renderUsers();
    }catch(e){
      target.innerHTML='<div class="empty">Не удалось загрузить: '+escapeHtml(e.message||e)+'</div>';
      const note=document.getElementById('userCountNote');
      if(note)note.textContent='Повтори загрузку кнопкой «Обновить».';
    }finally{
      usersRequest=null;
    }
  })();
  return usersRequest;
}
function renderUsers(){
  const root=document.getElementById('userList');
  const note=document.getElementById('userCountNote');
  const more=document.getElementById('usersMore');
  if(!root||!note||!more)return;
  const expanded=new Set(Array.from(root.querySelectorAll('details.person[open]')).map(el=>el.dataset.personId));
  const search=String(document.getElementById('userSearch')?.value||'')
    .toLowerCase().trim().replace(/^@/,'');
  const filter=document.getElementById('userFilter')?.value||'all';
  const filtered=visitedUsers.filter(u=>{
    const query=[u.id,u.username,u.first_name,u.last_name].join(' ').toLowerCase();
    if(search&&!query.includes(search))return false;
    const age=Date.now()-Date.parse(u.last_seen||'');
    if(filter==='recent')return recentlyInApp(u);
    if(filter==='today')return Number.isFinite(age)&&age>=0&&age<86400000;
    if(filter==='premium')return !!u.premium;
    if(filter==='banned')return !!u.banned;
    return true;
  });
  const visible=filtered.slice(0,usersVisibleCount);
  if(!visible.length){
    root.innerHTML='<div class="empty">'+(visitedUsers.length?
      'По этому запросу никого нет':
      'Пока нет посещений. Пользователи появятся после открытия QuizBot.')+'</div>';
  }else{
    root.innerHTML=visible.map(u=>{
      const id=escapeHtml(u.id);
      const name=escapeHtml([u.first_name,u.last_name].filter(Boolean).join(' ')||'Пользователь');
      const handle=u.username?'@'+escapeHtml(u.username):'Без username';
      const status=u.banned?
        '<span class="status-banned">🚫 Бан</span>':
        u.premium?'<span class="status-premium">💎 Premium</span>':'Обычный';
      const recent=recentlyInApp(u)?
        '<span class="status-recent">● Недавно в QuizBot</span>':
        'Был в QuizBot: '+escapeHtml(activityAge(u.last_seen));
      return '<details class="person" data-person-id="'+id+'"'+(expanded.has(String(u.id))?' open':'')+'>'+
        '<summary class="person-summary"><span class="person-identity"><span class="person-name">'+name+'</span>'+
        '<span class="person-handle">'+handle+'</span><span class="person-id">ID: '+id+'</span></span>'+
        '<span class="person-summary-right"><span class="person-status">'+status+'</span><span class="person-chevron" aria-hidden="true">⌄</span></span></summary>'+
        '<div class="person-detail"><div class="person-time">'+recent+
        '<div>Последний вход: '+escapeHtml(activityTime(u.last_opened||u.first_seen))+'</div>'+
        '<div>Последняя активность: '+escapeHtml(activityTime(u.last_seen))+'</div></div>'+
        '<div class="person-controls">'+
        '<button type="button" class="btn btn-user-premium" data-user-action="'+(u.premium?'remove':'premium')+'" data-user-id="'+id+'">'+(u.premium?'Снять 💎':'💎 +30 дней')+'</button>'+
        '<button type="button" class="btn '+(u.banned?'btn-user-unban':'btn-user-ban')+'" data-user-action="'+(u.banned?'unban':'ban')+'" data-user-id="'+id+'">'+(u.banned?'Разбанить':'🚫 Бан')+'</button></div>'+
        '<div class="person-foot"><span class="person-status">Открытий: '+Math.max(0,Number(u.opens)||0)+'</span>'+
        '<button type="button" class="btn compact" data-manage-user="'+id+'">Управление ↗</button></div></div></details>';
    }).join('');
  }
  root.querySelectorAll('[data-manage-user]').forEach(button=>{
    button.addEventListener('click',()=>manageUser(button.dataset.manageUser));
  });
  more.classList.toggle('hidden',filtered.length<=usersVisibleCount);
  note.textContent='Показано '+Math.min(filtered.length,usersVisibleCount)+' из '+filtered.length+
    '. Нажмите на пользователя, чтобы увидеть даты и действия.';
}
function showMoreUsers(){
  usersVisibleCount+=60;
  renderUsers();
}
function manageUser(id){
  const safe=cleanId(id);
  if(!safe)return;
  document.getElementById('premId').value=safe;
  document.getElementById('banId').value=safe;
  const quick=document.getElementById('quickUserId');
  if(quick)quick.value=safe;
  showPane('access');
  window.scrollTo({top:0,behavior:'smooth'});
  toast('Пользователь '+safe+' выбран для управления');
}

/* Keep advanced question import/export available without a long screen. */
function compactQuestionControls(){
  const controls=document.querySelector('#questions > .grid2');
  if(!controls||controls.dataset.compactDone==='1')return;
  controls.dataset.compactDone='1';
  controls.classList.add('fold-stack');
  const labels=[
    ['📥 Импорт вопросов','Добавить вопросы из JSON'],
    ['📤 Скачать вопросы','Экспортировать базу']
  ];
  Array.from(controls.children).forEach((card,index)=>{
    const item=document.createElement('details');
    item.className='fold question-fold';
    const label=document.createElement('summary');
    const hint=document.createElement('span');
    hint.className='fold-hint';
    label.textContent=labels[index]?.[0]||'Дополнительные действия';
    hint.textContent=labels[index]?.[1]||'';
    label.appendChild(hint);
    item.appendChild(label);
    item.appendChild(card);
    controls.appendChild(item);
  });
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',compactQuestionControls,{once:true});
}else compactQuestionControls();
