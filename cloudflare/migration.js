/* Owner-only migration. No tokens are collected or embedded.
   Transfers old Netlify exports through the owner's signed Telegram session. */
(function(){
  'use strict';
  const OLD='https://luminous-malabi-8de1f1.netlify.app';
  const note=document.getElementById('migration-progress');
  const btn=document.getElementById('migrate-old-site');
  if(!note||!btn)return;
  function say(message){note.textContent=message}
  async function oldExport(path,data){
    const response=await fetch(OLD+path,{
      method:'GET',cache:'no-store',credentials:'omit',mode:'cors',
      headers:{'X-Telegram-Init-Data':data}
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok||!json.ok)throw new Error(path+': '+(json.error||('HTTP '+response.status)));
    return json;
  }
  btn.addEventListener('click',async()=>{
    const signed=ownerInitData();
    if(!signed){say('Откройте админку из Telegram Mini App.');return}
    btn.disabled=true;
    try{
      say('Читаю существующие Premium, баны и вопросы из Netlify…');
      const [oldAccess,oldQuestions]=await Promise.all([
        oldExport('/api/admin/export',signed),
        oldExport('/api/admin/tests/export',signed)
      ]);
      const access=oldAccess.access_state;
      const questions=oldQuestions.tests_data;
      const count=Number(oldQuestions.total)||Object.values(questions?.subjects||{}).reduce((n,x)=>n+(x.tests?.length||0),0);
      if(!access||!questions||!questions.subjects||!Number.isFinite(count)||count<1)throw Error('Старые данные неполные. Импорт остановлен.');
      const prem=Object.keys(access.premium_users?.users||{}).length;
      const ban=Object.keys(access.banned_users?.users||{}).length;
      const proceed=confirm('Перенести данные из старого QuizBot?\nВопросов: '+count+
       '\nPremium: '+prem+'\nБаны: '+ban+
       '\n\nНовая база будет заменена снимком старой. Старый Netlify останется без изменений.');
      if(!proceed){say('Перенос отменён.');return}
      say('Сохраняю вопросы в Cloudflare D1…');
      await req('/api/admin/tests/import','POST',questions);
      const latest=await req('/api/admin/tests/info');
      if(Number(latest.total)!==count)throw Error('После импорта число вопросов не совпало: '+latest.total+' вместо '+count+'. Перенос доступа остановлен.');
      say('Сохраняю Premium и баны в Cloudflare D1…');
      await req('/api/admin/import','POST',{access_state:access});
      let activityMessage='История посещений не найдена в старой версии.';
      try{
        say('Проверяю историю активности QuizBot…');
        const activity=await oldExport('/api/admin/users',signed);
        if(Array.isArray(activity.users)&&activity.users.length){
          const saved=await req('/api/admin/users/import','POST',{users:activity.users});
          activityMessage='История посещений: '+Number(saved.imported||0)+' записей.';
        }
      }catch(err){activityMessage='История активности не перенесена (старый API может быть недоступен).'}
      await Promise.allSettled([questionsInfo(),refreshLists(false),refreshUsers()]);
      say('✓ Перенесено '+count+' вопросов, '+prem+' Premium, '+ban+' банов. '+activityMessage+
        ' Токен бота отчётов нужно заново настроить в разделе «Ещё → Отчёты».');
    }catch(e){
      say('Ошибка переноса: '+String(e?.message||e)+'. Старый Netlify не изменён. Не переключайте пользователей до исправления.');
    }finally{btn.disabled=false}
  });
})();
