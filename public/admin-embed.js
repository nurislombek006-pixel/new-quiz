/* Owner-only navigation: the server, not the browser, decides who is admin.
   Works with the existing Netlify /api/* backend and signed Telegram Mini App sessions. */
(function(){
  'use strict';
  let installed=false, checking=false, attempts=0;

  function telegramInitData(){
    try { return String(window.Telegram?.WebApp?.initData || ''); }
    catch(e){ return ''; }
  }

  function installOwnerPanel(){
    if(installed || document.getElementById('owner-admin-link'))return;
    const drawer=document.querySelector('#side-drawer .drawer-list');
    const app=document.querySelector('.app');
    if(!drawer || !app)return;

    const style=document.createElement('style');
    style.textContent=[
      '#admin-screen {padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}',
      '.owner-admin-header {display:flex;justify-content:space-between;gap:12px;align-items:center;margin:4px 0 12px}',
      '.owner-admin-header h2 {margin:0;font-size:19px;color:var(--txt)}',
      '.owner-admin-frame {display:block;width:100%;height:calc(100dvh - 156px);min-height:450px;',
      'border:1px solid var(--line);border-radius:16px;background:#0b1424;-webkit-overflow-scrolling:touch}',
      '@media(max-width:560px) {.owner-admin-frame {height:calc(100dvh - 145px);min-height:380px;border-radius:13px}',
      '.owner-admin-header h2 {font-size:16px}}'
    ].join('\n');
    document.head.appendChild(style);

    const section=document.createElement('section');
    section.id='admin-screen';
    section.className='screen hidden';
    section.setAttribute('aria-label','Панель администратора');

    const header=document.createElement('div');
    header.className='owner-admin-header';
    const heading=document.createElement('h2');
    heading.textContent='⚙️ Админ-панель';
    const back=document.createElement('button');
    back.type='button';
    back.className='btn btn-gray btn-small';
    back.textContent='← В меню';
    back.addEventListener('click',()=>{
      if(typeof window.backToMenu==='function')window.backToMenu();
      else if(typeof window.showScreen==='function')window.showScreen('start-screen');
    });
    header.append(heading,back);

    const frame=document.createElement('iframe');
    frame.className='owner-admin-frame';
    frame.id='owner-admin-frame';
    frame.title='Управление Premium, банами, предметами и вопросами';
    frame.loading='lazy';
    frame.setAttribute('referrerpolicy','same-origin');
    section.append(header,frame);
    app.appendChild(section);

    const button=document.createElement('button');
    button.type='button';
    button.id='owner-admin-link';
    button.className='drawer-item';
    button.textContent='⚙️ Панель администратора';
    button.addEventListener('click',()=>{
      if(typeof window.showScreen!=='function')return;
      window.showScreen('admin-screen');
      if(!frame.getAttribute('src'))frame.setAttribute('src','/admin/index.html?embedded=1');
    });
    drawer.appendChild(button);
    installed=true;
  }

  async function checkOwner(){
    if(checking || installed)return;
    const initData=telegramInitData();
    if(!initData)return;
    checking=true;
    try{
      const response=await fetch('/api/admin/me',{
        method:'GET',
        headers:{'X-Telegram-Init-Data':initData},
        cache:'no-store',
        credentials:'same-origin'
      });
      if(response.ok){
        const payload=await response.json();
        if(payload && payload.ok===true && payload.admin===true)installOwnerPanel();
      }
    }catch(e){
      // Connection failures never expose admin controls.
      console.warn('Owner admin verification unavailable',e);
    }finally{checking=false}
  }

  const timer=setInterval(()=>{
    if(installed || ++attempts>=32){clearInterval(timer);return}
    if(document.visibilityState==='visible')checkOwner();
  },650);
  checkOwner();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkOwner()});
})();
