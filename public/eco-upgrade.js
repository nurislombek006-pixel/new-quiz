(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const safeCall=(fn,fallback)=>{try{return fn()}catch(e){return fallback}};
  let toastTimer=null;

  function toast(msg){
    let el=$('#upgrade-toast');
    if(!el){el=document.createElement('div');el.id='upgrade-toast';el.className='toast-upgrade';document.body.appendChild(el)}
    el.textContent=msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
  }
  window.ecoToast=toast;

  function percent(n,d){return d?Math.round(n*100/d):0}
  function refreshDashboard(){
    // Главное меню должно быть лёгким: статистику оставляем в боковом меню,
    // а старые перегруженные блоки, если они уже были добавлены, убираем.
    ['#upgrade-dashboard','#upgrade-coach','#upgrade-quick'].forEach(sel=>$(sel)?.remove());
  }

  function simplifyMainMenu(){
    // Disabled in final build: settings must stay visible and must not appear/disappear on load.
    document.querySelector('#settings-collapse')?.remove?.();
    document.querySelector('#simple-start-hint')?.remove?.();
  }

  window.ecoQuickStart=function(type){
    const select=$('#count-select');
    if(!select)return;
    select.value=type;
    const custom=$('#count-custom'); if(custom) custom.value='';
    const rangeFrom=$('#range-from'), rangeTo=$('#range-to');
    if(rangeFrom)rangeFrom.value=''; if(rangeTo)rangeTo.value='';
    setRunMode('normal');
    setOrderMode('random');
    guardedStart();
  };

  function addDrawerExtras(){
    const list=$('.drawer-list');
    if(!list || $('#upgrade-drawer-extra'))return;
    const wrap=document.createElement('div');
    wrap.id='upgrade-drawer-extra';
    wrap.style.display='grid';
    wrap.style.gap='9px';
    wrap.innerHTML=`
      <button class="drawer-item" onclick="closeDrawer();ecoQuickStart('mistakes')">🎯 Быстрый тест по ошибкам</button>
      <button class="drawer-item" onclick="closeDrawer();ecoResetFilters()">🧹 Сбросить настройки теста</button>`;
    list.appendChild(wrap);
  }

  window.ecoResetFilters=function(){
    safeCall(()=>setRunMode('normal'));
    safeCall(()=>setOrderMode('random'));
    const ids=['time-custom','count-custom','range-from','range-to'];
    ids.forEach(id=>{const el=$('#'+id); if(el)el.value=''});
    const cs=$('#count-select');
    if(cs)cs.value='all';
    safeCall(()=>onTimeSelectChange());
    toast('Настройки теста сброшены');
  };

  function renderQuestionMap(){
    // Disabled in final build: do not show the full list/map of questions during solving.
    document.querySelector('#q-map')?.remove?.();
  }

  function enhanceSearchHead(){
    const head=$('.sticky-list-head');
    if(!head || $('#search-tools'))return;
    const tools=document.createElement('div');
    tools.id='search-tools';tools.className='search-tools';
    tools.innerHTML='<div id="search-counter" class="search-counter">Готово</div><button type="button" class="clear-search" onclick="ecoClearSearch()">Очистить</button>';
    const toggle=$('#study-options-row');
    if(toggle)toggle.insertAdjacentElement('afterend',tools); else head.appendChild(tools);
  }
  window.ecoClearSearch=function(){const s=$('#search-box'); if(s){s.value=''; filterList(); s.focus();}};
  function updateSearchCounter(n){const c=$('#search-counter'); if(c)c.textContent=typeof n==='number'?`Найдено: ${n}`:'Готово';}

  function addScrollTop(){
    if($('#scroll-top-upgrade'))return;
    const b=document.createElement('button');
    b.id='scroll-top-upgrade';b.className='scroll-top-upgrade';b.type='button';b.textContent='↑';
    b.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
    document.body.appendChild(b);
    window.addEventListener('scroll',()=>b.classList.toggle('show',window.scrollY>450),{passive:true});
  }

  function bindHotkeys(){
    if(window.__ecoHotkeys)return; window.__ecoHotkeys=true;
    document.addEventListener('keydown',e=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      if(['input','textarea','select'].includes(tag))return;
      if(!$('#test-screen') || $('#test-screen').classList.contains('hidden'))return;
      if(e.key>='1'&&e.key<='9'){
        const idx=Number(e.key)-1;
        const opts=$$('#options .option');
        if(opts[idx]){opts[idx].click();toast('Выбран вариант '+e.key)}
      }else if(e.key==='Enter'){
        const btn=$('#accept-btn'); if(btn && !btn.classList.contains('hidden'))btn.click();
      }else if(e.key==='ArrowRight'){
        const btn=$('#next-btn'); if(btn && !btn.classList.contains('hidden'))btn.click();
      }else if(e.key==='ArrowLeft'){
        const btn=$('#prev-btn'); if(btn && !btn.classList.contains('hidden'))btn.click();
      }
    });
  }

  function monkeyPatch(){
    if(window.__ecoPatched)return; window.__ecoPatched=true;
    const oldRender=renderQuestion;
    renderQuestion=function(){oldRender.apply(this,arguments);renderQuestionMap();};
    const oldUpdate=updateProgressUI;
    updateProgressUI=function(){oldUpdate.apply(this,arguments);refreshDashboard();};
    const oldShowList=showListScreen;
    showListScreen=function(title,data,withSearch){oldShowList.apply(this,arguments);enhanceSearchHead();updateSearchCounter(Array.isArray(data)?data.length:0);};
    const oldRenderList=renderDataList;
    renderDataList=function(data){oldRenderList.apply(this,arguments);enhanceSearchHead();updateSearchCounter(Array.isArray(data)?data.length:0);};
    const oldCopyCard=copyCard;
    copyCard=function(){oldCopyCard.apply(this,arguments);toast('Номер карты скопирован');};
    const oldCopyUser=copyUserId;
    copyUserId=function(){oldCopyUser.apply(this,arguments);toast('Telegram ID скопирован');};
  }

  function boot(){
    safeCall(monkeyPatch);
    simplifyMainMenu();
    addDrawerExtras();
    addScrollTop();
    bindHotkeys();
    refreshDashboard();
    setTimeout(()=>{simplifyMainMenu();refreshDashboard();},800);
    setTimeout(()=>{simplifyMainMenu();refreshDashboard();},1800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();
})();
