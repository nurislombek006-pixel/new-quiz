/* Owner-only embedded administration for the existing Netlify-based quiz.
   Visibility and backend permissions require a VALIDATED, SIGNED Telegram session.
   initDataUnsafe is only a hint to avoid unnecessary verification requests. */
(function(){
  'use strict';

  const OWNER_ID='5305261101';
  const AUTH_ENDPOINT='/api/admin/me';
  let authorized=false;
  let installed=false;
  let checking=false;
  let checkedData='';
  let observer=null;
  let nextCheckAt=0;

  function telegramApp(){
    try{return window.Telegram?.WebApp||null}
    catch{return null}
  }
  function telegramInitData(){
    try{return String(telegramApp()?.initData||'')}
    catch{return ''}
  }
  function displayId(){
    // Not an authentication mechanism. This hint never causes admin UI to appear.
    try{
      const app=telegramApp();
      const raw=app?.initDataUnsafe?.user?.id;
      if(raw)return String(raw);
      const user=new URLSearchParams(app?.initData||'').get('user');
      return user?String(JSON.parse(user).id||''):'';
    }catch{return ''}
  }

  // This is a troubleshooting notice, NOT an admin menu. It never grants access.
  // It is displayed only if Telegram's local identity hint matches the owner;
  // Netlify's signed verification is still mandatory for admin permissions.
  function describeAuthError(code){
    const reasons={
      TELEGRAM_SESSION_MISSING:'Telegram не передал данные входа. Откройте Mini App кнопкой бота.',
      TELEGRAM_BOT_NOT_CONFIGURED:'В Netlify не настроен токен бота для Mini App.',
      TELEGRAM_SIGNATURE_INVALID:'Ни токен Netlify, ни публичная подпись Telegram не подтвердили запуск нужным ботом.',
      TELEGRAM_PUBLIC_SIGNATURE_MISSING:'Telegram не передал публичную подпись. Проверьте токен Mini App в Netlify.',
      NOT_ADMIN_OWNER:'Сервер подтвердил другого Telegram-пользователя.',
      HTTP_404:'Netlify не нашёл серверный маршрут /api/admin/me.',
      HTTP_502:'Netlify не смог выполнить серверную функцию.',
      HTTP_503:'Серверная функция временно недоступна.',
      NETWORK_ERROR:'Не удалось связаться с Netlify. Проверьте подключение.',
      INVALID_RESPONSE:'Сервер вернул ответ неверного формата.',
      INITDATA_EMPTY:'У Mini App нет подписанных данных Telegram. Откройте приложение кнопкой бота.'
    };
    return reasons[code]||'Проверка Telegram-авторизации на Netlify не прошла.';
  }
  function clearDiagnostic(){
    document.getElementById('owner-auth-diagnostic')?.remove();
  }
  function showDiagnostic(code){
    if(authorized||displayId()!==OWNER_ID)return;
    const drawer=document.querySelector('#side-drawer .drawer-list');
    if(!drawer)return;
    let notice=document.getElementById('owner-auth-diagnostic');
    if(!notice){
      notice=document.createElement('div');
      notice.id='owner-auth-diagnostic';
      notice.className='drawer-section';
      notice.style.cssText='border:1px solid rgba(251,191,36,.3);border-radius:15px;padding:12px;margin-top:14px;background:rgba(120,53,15,.12)';
      const heading=document.createElement('div');
      heading.className='drawer-section-title';
      heading.textContent='ПРОВЕРКА ДОСТУПА';
      const explanation=document.createElement('div');
      explanation.id='owner-auth-error-text';
      explanation.style.cssText='font-size:12px;line-height:1.6;opacity:.9;overflow-wrap:anywhere;margin:9px 0';
      const retry=document.createElement('button');
      retry.type='button';
      retry.className='drawer-item';
      retry.style.cssText='font-size:13px;min-height:42px;width:100%;cursor:pointer';
      retry.textContent='↻ Проверить ещё раз';
      retry.addEventListener('click',()=>checkOwner(true));
      notice.append(heading,explanation,retry);
      drawer.appendChild(notice);
    }
    const message=document.getElementById('owner-auth-error-text');
    if(message)message.textContent=describeAuthError(code)+' Код: '+String(code||'UNKNOWN').slice(0,48);
  }

  function hideSubjectOnAdmin(){
    const admin=document.getElementById('admin-screen');
    document.body.classList.toggle('owner-admin-active',!!admin&&!admin.classList.contains('hidden'));
  }

  function makeScreen(){
    const existing=document.getElementById('admin-screen');
    if(existing)return existing;
    const app=document.querySelector('.app');
    if(!app)return null;
    const style=document.createElement('style');
    style.textContent=[
      '#admin-screen{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}',
      '.owner-admin-header{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:4px 0 12px}',
      '.owner-admin-header h2{margin:0;font-size:19px;color:var(--txt)}',
      '.owner-admin-frame{display:block;width:100%;height:calc(100dvh - 150px);min-height:420px;border:1px solid var(--line);border-radius:16px;background:#0b1424}',
      '.owner-admin-active .subject-switch-wrap{display:none!important}',
      'body:has(#admin-screen:not(.hidden)) .subject-switch-wrap{display:none!important}',
      '#owner-admin-link{width:100%;cursor:pointer;text-align:left}',
      '@media(max-width:560px){.owner-admin-frame{height:calc(100dvh - 142px);min-height:370px;border-radius:13px}.owner-admin-header h2{font-size:16px}}'
    ].join('\n');
    document.head.appendChild(style);

    const section=document.createElement('section');
    section.id='admin-screen';
    section.className='screen hidden';
    section.setAttribute('aria-label','Панель владельца');
    const header=document.createElement('div');
    header.className='owner-admin-header';
    const heading=document.createElement('h2');
    heading.textContent='⚙️ Админ-панель';
    const back=document.createElement('button');
    back.type='button';
    back.className='btn btn-gray btn-small';
    back.textContent='← В меню';
    back.onclick=()=>{
      if(typeof window.backToMenu==='function')window.backToMenu();
      else if(typeof window.showScreen==='function')window.showScreen('start-screen');
      hideSubjectOnAdmin();
      // An owner may have just created a subject or imported questions.
      // Pull the new catalog without restarting Telegram or altering the database.
      if(typeof window.refreshSubjectCatalog==='function'){
        window.refreshSubjectCatalog().catch(()=>{});
      }
    };
    header.append(heading,back);
    const frame=document.createElement('iframe');
    frame.id='owner-admin-frame';
    frame.className='owner-admin-frame';
    frame.title='Управление Premium, банами и вопросами';
    frame.setAttribute('referrerpolicy','same-origin');
    section.append(header,frame);
    app.appendChild(section);

    if(typeof MutationObserver==='function'){
      const watch=new MutationObserver(hideSubjectOnAdmin);
      watch.observe(section,{attributes:true,attributeFilter:['class']});
    }
    return section;
  }

  function openAdmin(){
    if(!authorized)return;
    const section=makeScreen();
    if(!section||typeof window.showScreen!=='function')return;
    window.showScreen('admin-screen');
    hideSubjectOnAdmin();
    const iframe=document.getElementById('owner-admin-frame');
    if(iframe&&!iframe.getAttribute('src'))iframe.src='/admin/index.html?embedded=1&v=6';
  }

  function insertMenu(){
    if(!authorized)return;
    clearDiagnostic();
    makeScreen();
    const drawer=document.querySelector('#side-drawer .drawer-list');
    if(!drawer)return;
    if(!document.getElementById('owner-admin-link')){
      const group=document.createElement('div');
      group.className='drawer-section owner-admin-group';
      const heading=document.createElement('div');
      heading.className='drawer-section-title';
      heading.textContent='УПРАВЛЕНИЕ';
      const button=document.createElement('button');
      button.id='owner-admin-link';
      button.type='button';
      button.className='drawer-item drawer-owner';
      const ico=document.createElement('span');
      ico.textContent='⚙️';
      const title=document.createElement('span');
      title.textContent='Панель администратора';
      button.append(ico,title);
      button.addEventListener('click',openAdmin);
      group.append(heading,button);
      drawer.append(group);
    }
    installed=true;
    if(!observer && typeof MutationObserver==='function'){
      observer=new MutationObserver(()=>{
        if(authorized&&!document.getElementById('owner-admin-link'))insertMenu();
      });
      observer.observe(drawer,{childList:true});
    }
  }

  function removeMenu(){
    document.querySelector('.owner-admin-group')?.remove();
    document.getElementById('admin-screen')?.remove();
    document.body.classList.remove('owner-admin-active');
    authorized=false;
    installed=false;
  }

  async function checkOwner(force=false){
    if(checking)return;
    const initData=telegramInitData();
    const id=displayId();
    if(id!==OWNER_ID){
      if(authorized)removeMenu();
      clearDiagnostic();
      return;
    }
    if(!initData){
      showDiagnostic('INITDATA_EMPTY');
      return;
    }
    if(authorized&&checkedData===initData){if(!installed)insertMenu();return}
    if(!force&&Date.now()<nextCheckAt)return;
    checking=true;
    nextCheckAt=Date.now()+5000;
    try{
      const response=await fetch(AUTH_ENDPOINT,{
        method:'GET',
        headers:{'X-Telegram-Init-Data':initData},
        cache:'no-store',credentials:'same-origin'
      });
      const result=await response.json().catch(()=>null);
      const allowed=response.ok&&result?.ok===true&&result?.admin===true;
      if(!allowed){
        checkedData='';
        if(authorized)removeMenu();
        const code=String(result?.code||('HTTP_'+response.status));
        showDiagnostic(code);
        // This diagnostic does not reveal admin controls or accept client IDs.
        return;
      }
      checkedData=initData;
      authorized=true;
      clearDiagnostic();
      insertMenu();
    }catch(e){
      if(authorized)removeMenu();
      showDiagnostic('NETWORK_ERROR');
      console.warn('Owner authorization check unavailable');
    }finally{checking=false}
  }

  // Telegram WebApp may finish initialization after this script is evaluated.
  // Wait for it but do not show an admin button until the backend confirms identity.
  checkOwner();
  let retries=0;
  const timer=setInterval(()=>{
    checkOwner();
    if(++retries>=90||authorized)clearInterval(timer);
  },650);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)checkOwner();
  });
  window.addEventListener('focus',checkOwner);
})();
