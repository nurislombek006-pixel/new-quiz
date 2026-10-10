/* Owner-only entry point inside the existing QuizBot Mini App.
   This module controls visibility only. Every real admin action is authenticated
   on Netlify by signed Telegram initData and exact owner ID. */
(function(){
  'use strict';
  const OWNER_ID='5305261101';
  let installed=false;
  let bootAttempts=0;
  let reattachObserver=null;

  function telegramApp(){
    try { return window.Telegram?.WebApp || null; }
    catch { return null; }
  }
  function signedInitData(){
    try { return String(telegramApp()?.initData || ''); }
    catch { return ''; }
  }
  // Untrusted metadata is used ONLY to decide whether to show a button.
  // Never use it to authorize requests or disclose admin data.
  function viewerId(){
    try {
      const app=telegramApp();
      let id=String(app?.initDataUnsafe?.user?.id || '').trim();
      if(!id && app?.initData){
        const raw=new URLSearchParams(app.initData).get('user');
        id=String(JSON.parse(raw || '{}').id || '').trim();
      }
      if(!id && signedInitData() && typeof tgUserId !== 'undefined'){
        id=String(tgUserId || '').trim();
      }
      return /^[1-9][0-9]{0,18}$/.test(id) ? id : '';
    }catch { return ''; }
  }
  function ownerVisible(){ return viewerId()===OWNER_ID; }

  function buildScreen(){
    if(document.getElementById('admin-screen'))return;
    const app=document.querySelector('.app');
    if(!app)return;
    const style=document.createElement('style');
    style.textContent=[
      '#admin-screen{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}',
      '.owner-admin-header{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:4px 0 12px}',
      '.owner-admin-header h2{margin:0;font-size:19px;color:var(--txt)}',
      '.owner-admin-frame{display:block;width:100%;height:calc(100dvh - 152px);min-height:420px;border:1px solid var(--line);border-radius:16px;background:#0b1424}',
      '#owner-admin-link{width:100%;cursor:pointer;text-align:left}',
      '@media(max-width:560px){.owner-admin-frame{height:calc(100dvh - 146px);min-height:370px;border-radius:13px}.owner-admin-header h2{font-size:16px}}'
    ].join('\n');
    document.head.appendChild(style);

    const section=document.createElement('section');
    section.id='admin-screen';
    section.className='screen hidden';
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
    };
    header.append(heading,back);
    const frame=document.createElement('iframe');
    frame.id='owner-admin-frame';
    frame.className='owner-admin-frame';
    frame.title='Панель управления';
    frame.setAttribute('referrerpolicy','same-origin');
    section.append(header,frame);
    app.appendChild(section);
  }

  function openOwnerPanel(){
    if(!ownerVisible())return;
    buildScreen();
    if(typeof window.showScreen!=='function')return;
    window.showScreen('admin-screen');
    const frame=document.getElementById('owner-admin-frame');
    if(frame && !frame.getAttribute('src'))frame.src='/admin/index.html?embedded=1';
  }

  function ensureOwnerMenu(){
    if(!ownerVisible())return;
    buildScreen();
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
      const icon=document.createElement('span');
      icon.textContent='⚙️';
      const title=document.createElement('span');
      title.textContent='Панель администратора';
      button.append(icon,title);
      button.addEventListener('click',openOwnerPanel);
      group.append(heading,button);
      drawer.append(group);
    }
    installed=true;
    if(!reattachObserver && typeof MutationObserver==='function'){
      reattachObserver=new MutationObserver(()=>{
        if(ownerVisible() && !document.getElementById('owner-admin-link'))
          ensureOwnerMenu();
      });
      reattachObserver.observe(drawer,{childList:true});
    }
  }

  function init(){
    if(ownerVisible())ensureOwnerMenu();
  }
  init();
  const timer=setInterval(()=>{
    init();
    bootAttempts++;
    if((installed && bootAttempts>=12) || bootAttempts>=120)clearInterval(timer);
  },500);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)init();
  });
  // Telegram may be initialized after async telegram-web-app.js loads.
  window.addEventListener('focus',init);
})();
