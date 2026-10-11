/* QuizBot subject picker: refresh available subjects after owner imports
   and make selecting a subject reliable on iOS Telegram WebView.
   Read-only catalog: never writes questions, Premium or access state. */
(function(){
  'use strict';
  const select=document.getElementById('subject-select');
  const trigger=document.getElementById('subject-picker-trigger');
  if(!select||!trigger)return;

  let popup=null;
  let pending=null;
  let lastSuccess=0;
  const esc=str=>String(str||'');
  function catalog(){
    try {
      if(typeof subjects!=='undefined'&&subjects&&typeof subjects==='object')return Object.entries(subjects);
    }catch(e){}
    return [];
  }
  function syncTrigger(){
    const selected=Array.from(select.options||[]).find(o=>o.value===select.value);
    const text=selected?.textContent?.trim()||'Выбрать предмет';
    trigger.textContent=text;
    trigger.title=text;
    trigger.setAttribute('aria-label','Выбрать предмет. Сейчас: '+text);
    trigger.setAttribute('aria-expanded',String(!!popup));
  }
  async function refreshSubjectCatalog(){
    if(pending)return pending;
    pending=(async()=>{
      const raw=typeof apiUrl==='function'?apiUrl('/api/tests'):'/api/tests';
      const url=new URL(raw,location.href);
      url.searchParams.set('subjects_refresh',String(Date.now()));
      const headers={};
      try{
        const signed=window.Telegram?.WebApp?.initData||'';
        if(signed)headers['X-Telegram-Init-Data']=signed;
      }catch(e){}
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),10000);
      try{
        const res=await fetch(url.toString(),{cache:'no-store',credentials:'same-origin',headers,signal:controller.signal});
        if(!res.ok)throw Error('Ошибка обновления: '+res.status);
        const data=await res.json();
        if(!data?.subjects||typeof data.subjects!=='object'||!Object.keys(data.subjects).length){
          throw Error('Список предметов временно недоступен');
        }
        if(typeof applySubjectMeta!=='function')throw Error('Не удалось обновить предметы');
        // This is a read-only refresh; keep any active quiz session untouched.
        applySubjectMeta(data);
        lastSuccess=Date.now();
        syncTrigger();
        if(popup)renderOptions();
        return data.subjects;
      }finally{
        clearTimeout(timeout);
      }
    })();
    try{return await pending}finally{pending=null}
  }
  window.refreshSubjectCatalog=refreshSubjectCatalog;

  function closePicker(){
    if(!popup)return;
    popup.remove();
    popup=null;
    document.body.classList.remove('subject-picker-open');
    syncTrigger();
    trigger.focus({preventScroll:true});
  }
  function renderOptions(message=''){
    if(!popup)return;
    const container=popup.querySelector('#subject-picker-items');
    const notice=popup.querySelector('#subject-picker-note');
    if(!container||!notice)return;
    const items=catalog();
    container.replaceChildren();
    if(!items.length){
      const empty=document.createElement('p');
      empty.className='subject-picker-empty';
      empty.textContent='Пока нет доступных предметов.';
      container.appendChild(empty);
    }else{
      for(const [key,sub] of items){
        const button=document.createElement('button');
        button.type='button';
        button.className='subject-picker-item';
        if(String(window.currentSubjectKey)===String(key)){
          button.classList.add('selected');
          button.setAttribute('aria-current','true');
        }
        const label=document.createElement('span');
        label.className='subject-picker-label';
        label.textContent=(sub?.emoji||'📚')+' '+(sub?.short||sub?.title||key);
        const count=document.createElement('span');
        count.className='subject-picker-count';
        count.textContent=String(Array.isArray(sub?.tests)?sub.tests.length:0)+' вопр.';
        button.append(label,count);
        button.addEventListener('click',()=>{
          if(typeof switchSubject==='function')switchSubject(key);
          syncTrigger();
          closePicker();
          if(typeof showScreen==='function')showScreen('start-screen');
        });
        container.appendChild(button);
      }
    }
    notice.textContent=message||'Выбери предмет — тесты переключатся автоматически.';
  }
  async function updatePopup(){
    const refreshButton=popup?.querySelector('#subject-picker-reload');
    if(refreshButton)refreshButton.disabled=true;
    renderOptions('Обновляю список предметов…');
    try{
      await refreshSubjectCatalog();
      renderOptions('Показаны актуальные предметы из QuizBot.');
    }catch(error){
      renderOptions('Не удалось обновить: '+esc(error?.message||error)+'. Нажми «Обновить».');
    }finally{
      if(refreshButton)refreshButton.disabled=false;
    }
  }
  function openPicker(){
    if(popup){return}
    popup=document.createElement('div');
    popup.id='subject-picker-layer';
    popup.className='subject-picker-layer';
    popup.setAttribute('role','presentation');
    popup.innerHTML=
      '<div class="subject-picker-panel" role="dialog" aria-modal="true" aria-labelledby="subject-picker-title">'+
        '<div class="subject-picker-heading"><h2 id="subject-picker-title">Выбор предмета</h2>'+
        '<button type="button" class="subject-picker-close" aria-label="Закрыть">✕</button></div>'+
        '<p class="subject-picker-note" id="subject-picker-note" role="status"></p>'+
        '<div id="subject-picker-items" class="subject-picker-items"></div>'+
        '<button type="button" id="subject-picker-reload" class="subject-picker-reload">↻ Обновить список</button>'+
      '</div>';
    document.body.appendChild(popup);
    document.body.classList.add('subject-picker-open');
    popup.querySelector('.subject-picker-close').addEventListener('click',closePicker);
    popup.querySelector('#subject-picker-reload').addEventListener('click',updatePopup);
    popup.addEventListener('click',e=>{if(e.target===popup)closePicker()});
    syncTrigger();
    renderOptions();
    updatePopup();
    popup.querySelector('.subject-picker-close').focus({preventScroll:true});
  }

  trigger.addEventListener('click',openPicker);
  select.addEventListener('change',syncTrigger);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&popup)closePicker()});
  if(typeof MutationObserver==='function'){
    const observer=new MutationObserver(syncTrigger);
    observer.observe(select,{childList:true,subtree:true});
  }
  // Owner changes questions in the embedded admin frame. On return, the
  // parent should fetch the updated catalog without reloading the Mini App.
  let lastFocusAttempt=0;
  window.addEventListener('focus',()=>{
    if(popup||document.hidden||document.getElementById('admin-screen')?.classList.contains('hidden')===false)return;
    if(Date.now()-lastFocusAttempt<20000)return;
    lastFocusAttempt=Date.now();
    refreshSubjectCatalog().catch(()=>{});
  });
  syncTrigger();
  document.body.classList.add('subject-picker-ready');
})();