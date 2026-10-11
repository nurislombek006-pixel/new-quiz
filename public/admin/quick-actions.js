/* One-step administration, only inside the already authenticated owner iframe.
   All mutations continue to use the existing signed /api/admin/* routes. */
'use strict';
let quickUserBusy=false;
let quickQuestionBusy=false;

function quickValidId(value){
  const raw=String(value||'').trim();
  return /^[1-9]\d{4,18}$/.test(raw)?raw:'';
}

async function quickUserAction(action, userId){
  if(quickUserBusy)return;
  const id=quickValidId(userId||document.getElementById('quickUserId')?.value);
  if(!id){
    alert('Укажи Telegram ID пользователя.');
    document.getElementById('quickUserId')?.focus();
    return;
  }
  const paths={
    premium:'/api/admin/premium',
    remove:'/api/admin/premium/remove',
    ban:'/api/admin/ban',
    unban:'/api/admin/unban'
  };
  if(!paths[action])return;
  if(action==='ban'&&!confirm('Заблокировать пользователя '+id+' в QuizBot?'))return;
  if(action==='remove'&&!confirm('Убрать Premium у пользователя '+id+'?'))return;
  const days=Number(document.getElementById('quickDays')?.value||30);
  const payload={user_id:id};
  if(action==='premium'){
    if(!Number.isInteger(days)||days<0||days>36500)return alert('Выбери срок подписки.');
    payload.note='Выдано через быструю панель';
    if(days>0)payload.days=days;
  }
  if(action==='ban'){
    payload.reason='Доступ заблокирован администратором.';
    payload.type='permanent';
  }
  quickUserBusy=true;
  document.querySelectorAll('[data-quick-main],[data-user-action]').forEach(button=>{button.disabled=true});
  try{
    await req(paths[action],'POST',payload);
    const idInput=document.getElementById('quickUserId');
    if(idInput)idInput.value=id;
    const premiumInput=document.getElementById('premId');
    if(premiumInput)premiumInput.value=id;
    const banInput=document.getElementById('banId');
    if(banInput)banInput.value=id;
    const record=Array.isArray(visitedUsers)?visitedUsers.find(u=>String(u.id)===id):null;
    if(record){
      if(action==='premium')record.premium=true;
      if(action==='remove')record.premium=false;
      if(action==='ban'){record.banned=true;record.premium=false;}
      if(action==='unban')record.banned=false;
    }
    if(typeof renderUsers==='function')renderUsers();
    // Reload from the source of truth, without blocking the successful action.
    await Promise.allSettled([
      typeof refreshLists==='function'?refreshLists(false):Promise.resolve(),
      typeof refreshUsers==='function'?refreshUsers():Promise.resolve()
    ]);
    const label={premium:'💎 Premium выдан',remove:'Premium снят',ban:'Пользователь заблокирован',unban:'Пользователь разблокирован'}[action];
    toast(label+' · '+id);
  }catch(error){
    // req() already shows the detailed backend error.
    console.warn('Quick action failed:',String(error?.message||error));
  }finally{
    quickUserBusy=false;
    document.querySelectorAll('[data-quick-main],[data-user-action]').forEach(button=>{button.disabled=false});
  }
}

function quickSubjectSync(){
  const original=document.getElementById('importSubject');
  const select=document.getElementById('quickSubject');
  if(!original||!select)return;
  const previouslySelected=select.value;
  const options=Array.from(original.options).filter(o=>o.value);
  if(options.length===0){
    select.innerHTML='<option value="">Загрузка предметов…</option>';
    select.disabled=true;
    return;
  }
  select.replaceChildren(...options.map(option=>option.cloneNode(true)));
  if(options.some(option=>option.value===previouslySelected))select.value=previouslySelected;
  select.disabled=false;
}

async function quickAddQuestion(event){
  event?.preventDefault?.();
  if(quickQuestionBusy)return false;
  quickSubjectSync();
  const subjectKey=document.getElementById('quickSubject')?.value||'';
  const question=String(document.getElementById('quickQuestion')?.value||'').trim();
  const options=[0,1,2,3].map(i=>String(document.getElementById('quickOption'+i)?.value||'').trim());
  const answer=Number(document.getElementById('quickCorrect')?.value);
  if(!subjectKey)return alert('Выбери предмет.'),false;
  if(!question)return alert('Напиши текст вопроса.'),false;
  if(options.some(option=>!option))return alert('Заполни все четыре варианта ответа.'),false;
  if(!Number.isInteger(answer)||answer<0||answer>3)return alert('Выбери правильный ответ.'),false;
  const uid=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
    ?crypto.randomUUID()
    :Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,11);
  const questionData={id:'manual-'+uid,question,options,answer,generated:false,source:'manual'};
  const submit=document.getElementById('quickQuestionSave');
  quickQuestionBusy=true;
  if(submit){submit.disabled=true;submit.textContent='Сохранение…'}
  try{
    // Important: append instead of replacing any existing questions or subjects.
    await req('/api/admin/tests/import','POST',{
      subject_key:subjectKey,
      mode:'append',
      tests_data:[questionData]
    });
    const original=document.getElementById('quickQuestion');
    if(original)original.value='';
    for(let i=0;i<4;i++)document.getElementById('quickOption'+i).value='';
    document.getElementById('quickCorrect').value='0';
    await questionsInfo().catch(()=>{});
    toast('✓ Вопрос добавлен, другие вопросы сохранены');
    original?.focus();
  }catch(error){
    console.warn('Could not append question:',String(error?.message||error));
  }finally{
    quickQuestionBusy=false;
    if(submit){submit.disabled=false;submit.textContent='✓ Сохранить вопрос'}
  }
  return false;
}

function initQuickActions(){
  const source=document.getElementById('importSubject');
  if(source&&typeof MutationObserver==='function'){
    const observer=new MutationObserver(quickSubjectSync);
    observer.observe(source,{childList:true,subtree:true});
  }
  quickSubjectSync();
  const userList=document.getElementById('userList');
  userList?.addEventListener('click',event=>{
    const button=event.target.closest('[data-user-action]');
    if(!button||!userList.contains(button))return;
    quickUserAction(button.dataset.userAction,button.dataset.userId);
  });
  // Telegram may asynchronously populate subjects after the owner session is verified.
  window.addEventListener('focus',quickSubjectSync);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initQuickActions,{once:true});
else initQuickActions();
