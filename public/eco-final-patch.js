(function(){
  'use strict';
  const ADMIN='nurislombekm';
  const ADMIN_URL='https://t.me/'+ADMIN;
  const DAY=86400000;
  const LIMIT=3;
  const USAGE_KEY='macro_daily_limit_v2';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const ready=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn):fn();
  const pad=n=>String(n).padStart(2,'0');
  const fmt=ts=>{const d=new Date(ts);return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`};
  const esc=s=>String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]||m));
  let accessPromise=null;

  function tgId(){try{return typeof cleanUserId==='function'?cleanUserId(tgUserId):String(window.tgUserId||'').replace(/\D+/g,'')}catch(e){return ''}}
  function premiumRec(id){
    id=String(id||'').replace(/\D+/g,'');
    const primary=window.accessLists?.premium;
    const access=window.accessLists?.access;
    if((!primary && !access) || !id)return null;
    const sources=[];
    function pushList(list){ if(!list)return; sources.push(list.users, list.premium_users, list.premium, list.user_ids, list.telegram_ids, list); }
    pushList(primary);
    pushList(access);
    if(access&&access.keys&&typeof access.keys==='object'){
      for(const [key,rec] of Object.entries(access.keys)){
        const uid=String(rec&&typeof rec==='object'?(rec.uid||rec.user_id||rec.telegram_id):'').replace(/\D+/g,'');
        if(uid===id)return {...rec,key};
      }
    }
    for(const u of sources){
      if(!u)continue;
      if(Array.isArray(u)){
        const found=u.find(x=>String(typeof x==='object'?(x.id||x.user_id||x.telegram_id):x).replace(/\D+/g,'')===id);
        if(found)return typeof found==='object'?found:{active:true};
      }
      if(typeof u==='object'){
        const direct=u[id]||u[String(id)];
        if(direct)return direct;
        const found=Object.entries(u).find(([k,v])=>String(k).replace(/\D+/g,'')===id);
        if(found)return found[1];
      }
    }
    return null;
  }
  function activeRec(rec){
    if(!rec)return false;
    if(rec===true)return true;
    if(typeof rec==='object'){
      if(rec.active===false || rec.status==='inactive' || rec.status==='blocked')return false;
      const until=rec.until||rec.exp||rec.expires;
      if(until && Date.now()>new Date(String(until).includes('T')?until:until+'T23:59:59').getTime())return false;
      return true;
    }
    return false;
  }
  function recDeviceReason(rec){
    if(!rec || typeof rec!=='object')return '';
    const expected=String(rec.device||rec.fingerprint||rec.fp||'').trim().toUpperCase();
    if(!expected)return '';
    const current=(typeof getDeviceFingerprint==='function'?getDeviceFingerprint():'').toUpperCase();
    if(current && expected!==current)return rec.reason||`Подписка привязана к другому устройству. Ваше устройство: ${current}`;
    return '';
  }
  function isPremium(){
    const id=tgId();
    if(!id)return false;
    const rec=premiumRec(id);
    if(!activeRec(rec))return false;
    if(recDeviceReason(rec))return false;
    try{if(typeof banReason==='function' && banReason(id))return false}catch(e){}
    try{if(typeof deviceLockReason==='function' && deviceLockReason(id))return false}catch(e){}
    return true;
  }
  function updateBadge(){
    const el=$('#premium-badge');
    if(!el)return;
    const p=isPremium();
    el.classList.remove('hidden');
    el.classList.toggle('ordinary',!p);
    el.textContent=p?'Премиум пользователь':'Обычный пользователь';
  }
  function usageRecords(){
    let a=[];try{a=JSON.parse(localStorage.getItem(USAGE_KEY)||'[]')}catch(e){}
    const now=Date.now();
    a=(Array.isArray(a)?a:[]).map(Number).filter(x=>Number.isFinite(x)&&now-x<DAY).sort((a,b)=>a-b);
    try{localStorage.setItem(USAGE_KEY,JSON.stringify(a))}catch(e){}
    return a;
  }
  function setUsage(a){try{localStorage.setItem(USAGE_KEY,JSON.stringify(a))}catch(e){}}
  function limitInfo(){
    const p=isPremium();
    const records=p?[]:usageRecords();
    const used=records.length;
    const left=p?Infinity:Math.max(0,LIMIT-used);
    return {premium:p,used,left,locked:!p&&left<=0,resetAt:records[0]?records[0]+DAY:null};
  }
  function ensureLimitNote(){
    let n=$('#usage-limit-note');
    if(n)return n;
    n=document.createElement('div');n.id='usage-limit-note';
    const anchor=$('#resume-card')||$('#start-screen .center')||$('#start-screen');
    if(anchor)anchor.insertAdjacentElement('afterend',n);
    return n;
  }
  function renderLimit(){
    updateBadge();
    const info=limitInfo();
    try{ if(typeof updateMainLimitBadge==='function') updateMainLimitBadge(info); }catch(e){}
    const startVisible=!!($('#start-screen') && !$('#start-screen').classList.contains('hidden'));
    document.body.classList.toggle('usage-locked',info.locked && startVisible);
    const n=$('#usage-limit-note');
    if(n){n.style.display='none';n.innerHTML='';n.className='limit-ready';}
    const err=$('#config-error');
    if(err && /лимит/i.test(err.textContent||'')){err.textContent='';err.classList.add('hidden');}
    return info;
  }
  window.registerCompletedTest=function(){
    const info=limitInfo();
    if(info.premium)return info;
    const a=usageRecords();a.push(Date.now());setUsage(a);return renderLimit();
  };
  window.hasAnyFullAccessNow=function(){return isPremium()};
  window.refreshPremiumBadge=async function(){
    if(typeof loadLists==='function'){
      try{ if(!accessPromise)accessPromise=loadLists().finally(()=>setTimeout(()=>{accessPromise=null},30000)); await accessPromise; }catch(e){}
    }
    updateBadge();renderLimit();
  };
  window.updatePremiumBadge=function(){updateBadge()};

  function subscriptionText(){
    const fp=typeof getDeviceFingerprint==='function'?getDeviceFingerprint():'-';
    const summary=typeof getDeviceSummary==='function'?getDeviceSummary():'';
    return `Здравствуйте! Хочу активировать премиум-доступ.\nСумма оплаты: 30 000 сум\nКарта: 5614 6805 7717 0398\nОплату отправил(а). Чек прикрепляю.\nTelegram ID: ${tgId()||'-'}\nID устройства: ${fp}\n${summary}`;
  }
  window.copyDeviceId=function(){navigator.clipboard?.writeText(String(typeof getDeviceFingerprint==='function'?getDeviceFingerprint():''));};
window.copyCardNumber=function(){navigator.clipboard?.writeText('5614 6805 7717 0398');const e=$('#pay-error');if(e){e.style.color='#38bdf8';e.textContent='Номер карты скопирован: 5614 6805 7717 0398';}};
  window.copySubscriptionData=function(){navigator.clipboard?.writeText(subscriptionText());const e=$('#pay-error');if(e){e.style.color='#38bdf8';e.textContent='Данные скопированы. Отправьте их вместе с чеком @'+ADMIN+'.';}};
  window.openSubscriptionModal=function(){
    const uid=$('#pay-user-id');if(uid)uid.textContent=tgId()||'Откройте через Telegram Mini App';
    const dev=$('#pay-device-id');if(dev)dev.textContent=typeof getDeviceFingerprint==='function'?getDeviceFingerprint():'-';
    const pay=$('#paywall');if(pay)pay.classList.remove('hidden');
    const err=$('#pay-error');if(err){err.style.color='#f87171';err.textContent='Оплатите 30 000 сум на карту 5614 6805 7717 0398, затем отправьте чек, Telegram ID и ID устройства @'+ADMIN+'.';}
  };
  window.showPaywall=function(msg=''){
    window.openSubscriptionModal();
    const e=$('#pay-error');if(e&&msg){e.style.color='#f87171';e.textContent=msg;}
  };
  window.hidePaywall=function(){ $('#paywall')?.classList.add('hidden'); };
  window.activateAccessCode=function(){ window.openSubscriptionModal(); };
  window.checkAccess=async function(showMsg=true){
    if(typeof loadLists==='function'){
      try{ if(!accessPromise)accessPromise=loadLists().finally(()=>setTimeout(()=>{accessPromise=null},30000)); await accessPromise; }catch(e){}
    }
    const id=tgId();
    if(!id){updateBadge();if(showMsg)showPaywall('Откройте сайт через Telegram Mini App, чтобы получить Telegram ID.');return false;}
    try{const b=typeof banReason==='function'?banReason(id):'';if(b){updateBadge();if(typeof clearLocalCode==='function')clearLocalCode();if(showMsg)showPaywall(b);return false;}}catch(e){}
    const rec=premiumRec(id);
    if(!rec){
      window.unlocked=false;updateBadge();renderLimit();
      if(showMsg)showPaywall('Подписка не найдена для ID '+id+'. Проверьте доступ в закрытом backend и обновите сайт.');
      return false;
    }
    if(!activeRec(rec)){
      window.unlocked=false;updateBadge();renderLimit();
      const until=(rec&&typeof rec==='object')?(rec.expires||rec.exp||rec.until||''):'';
      if(showMsg)showPaywall('Подписка для ID '+id+' не активна'+(until?' или срок истёк: '+until:'')+'. Для продления оплатите 30 000 сум на карту 5614 6805 7717 0398 и отправьте чек @'+ADMIN+'.');
      return false;
    }
    const devReason=recDeviceReason(rec) || (typeof deviceLockReason==='function'?deviceLockReason(id):'');
    if(devReason){updateBadge();if(showMsg)showPaywall(devReason);return false;}
    window.unlocked=true;hidePaywall();renderLimit();return true;
  };
  window.debugSubscriptionInfo=async function(){
    if(typeof loadLists==='function')await loadLists();
    const id=tgId();
    const fp=typeof getDeviceFingerprint==='function'?getDeviceFingerprint():'';
    const rec=premiumRec(id);
    const info={detectedTelegramId:id, fingerprint:fp, premiumRecord:rec, active:activeRec(rec), deviceReason:recDeviceReason(rec), premiumAccessFromBackend:window.accessLists?.premium};
    console.log('SUBSCRIPTION DEBUG', info);
    alert('ID сайта: '+(id||'-')+'\nУстройство: '+(fp||'-')+'\nЗапись найдена: '+(rec?'да':'нет')+'\nАктивна: '+(activeRec(rec)?'да':'нет')+'\nПричина устройства: '+(recDeviceReason(rec)||'-'));
    return info;
  };
  window.guardedAction=async function(fn){try{buttonPop(event)}catch(e){};const ok=await (typeof withOneSecondLoader==='function'?withOneSecondLoader(()=>checkAccess(true)):checkAccess(true));if(ok && !renderLimit().locked)fn();};
  window.guardedStart=async function(mode){
    try{buttonPop(event)}catch(e){}
    if(typeof loadLists==='function'){try{ if(!accessPromise)accessPromise=loadLists().finally(()=>setTimeout(()=>{accessPromise=null},30000)); await accessPromise; }catch(e){}}
    const id=tgId();
    try{const b=typeof banReason==='function'?banReason(id):'';if(b){updateBadge();if(typeof showBlockedPaywall==='function')showBlockedPaywall(b);else showPaywall(b);return;}}catch(e){}
    const info=renderLimit();
    if(info.locked){
      const reset=info.resetAt?new Date(info.resetAt).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}):'позже';
      if(typeof showConfigError==='function')showConfigError(`Лимит бесплатных тестов исчерпан (${LIMIT}/${LIMIT}). Сброс в ${reset}. Активируйте подписку, чтобы решать без лимита.`);
      if(typeof openSubscriptionModal==='function')openSubscriptionModal();
      return;
    }
    startTest(mode);
    if(!info.premium){const a=usageRecords();a.push(Date.now());setUsage(a);renderLimit();}
  };

  function makeDrawerSection(title,items){
    return `<div class="drawer-section"><div class="drawer-section-title">${title}</div>${items.join('')}</div>`;
  }
  function improveDrawer(){
    const list=$('.drawer-list');
    if(!list || list.dataset.grouped==='1')return;
    list.dataset.grouped='1';
    list.innerHTML=makeDrawerSection('Обучение',[`<button class="drawer-item drawer-learn" onclick="closeDrawer();guardedAction(initStudy)">📖 <span>Изучить тесты</span></button>`,`<button class="drawer-item drawer-star" onclick="closeDrawer();guardedAction(showFavorites)">⭐ <span>Избранные вопросы</span></button>`,`<button class="drawer-item drawer-error" onclick="closeDrawer();guardedAction(()=>showMistakeList())">❗ <span>Изучить ошибки</span></button>`])+
      makeDrawerSection('Результаты',[`<button class="drawer-item drawer-history" onclick="closeDrawer();guardedAction(showHistory)">🕘 <span>История результатов</span></button>`])+
      makeDrawerSection('Подписка',[`<button id="activate-sub-drawer" class="drawer-item drawer-premium" onclick="closeDrawer();openSubscriptionModal()">👑 <span>Получить подписку</span></button>`])+
      makeDrawerSection('Помощь',[`<button id="offer-drawer-btn" class="drawer-item drawer-rules" onclick="openOfferModal()">📄 <span>Оферта и правила</span></button>`,`<a class="drawer-item drawer-admin" href="${ADMIN_URL}" target="_blank" onclick="closeDrawer()">💬 <span>Написать @${ADMIN}</span></a>`]);
  }
  function ensureOfferModal(){
    let modal=$('#offer-modal');if(modal)return modal;
    modal=document.createElement('div');modal.id='offer-modal';modal.className='offer-modal hidden';
    modal.innerHTML=`<div class="offer-box" role="dialog" aria-modal="true"><div class="offer-head"><div class="offer-title">📄 Оферта и правила</div><button type="button" class="offer-close" onclick="closeOfferModal()">×</button></div><div class="offer-body"><div class="offer-card"><b>1. Доступ</b> Подписка активируется только администратором через Termux: доступ добавляется только в закрытом backend.</div><div class="offer-card"><b>2. Устройство</b> Доступ может быть привязан к одному устройству. Передавать аккаунт другому человеку запрещено.</div><div class="offer-card"><b>3. Лимит</b> Без премиума доступно ${LIMIT} теста за 24 часа. Премиум снимает лимит.</div><div class="offer-card"><b>4. Администратор</b> По вопросам подписки пишите <a href="${ADMIN_URL}" target="_blank">@${ADMIN}</a>.</div></div></div>`;
    modal.addEventListener('click',e=>{if(e.target===modal)window.closeOfferModal();});document.body.appendChild(modal);return modal;
  }
  window.openOfferModal=function(){ensureOfferModal().classList.remove('hidden');try{closeDrawer()}catch(e){}};
  window.closeOfferModal=function(){$('#offer-modal')?.classList.add('hidden')};

  function patchScreenHooks(){
    if(window.__ecoStableHooks)return;window.__ecoStableHooks=true;
    const oldShow=window.showScreen;
    if(typeof oldShow==='function')window.showScreen=function(id){const r=oldShow.apply(this,arguments);document.body.classList.toggle('inner-section-open',id!=='start-screen');requestAnimationFrame(syncRealBar);if(id==='start-screen')setTimeout(renderLimit,0);return r};
    const oldFinish=window.finishTest;
    if(typeof oldFinish==='function')window.finishTest=function(){return oldFinish.apply(this,arguments)};
    const oldFinishReal=window.finishRealExam;
    if(typeof oldFinishReal==='function')window.finishRealExam=function(){const r=oldFinishReal.apply(this,arguments);requestAnimationFrame(syncRealBar);return r};
    const oldRenderReal=window.renderRealExam;
    if(typeof oldRenderReal==='function')window.renderRealExam=function(){const r=oldRenderReal.apply(this,arguments);requestAnimationFrame(syncRealBar);return r};
    const oldSelectReal=window.selectRealAnswer;
    if(typeof oldSelectReal==='function')window.selectRealAnswer=function(qi,oi){
      if(window.realExamFinished)return;
      // For reliability keep original render, but delay visual sync to one frame.
      const r=oldSelectReal.apply(this,arguments);requestAnimationFrame(syncRealBar);return r;
    };
  }
  function ensureRealBar(){
    let bar=$('#real-fixed-top');if(bar)return bar;
    bar=document.createElement('div');bar.id='real-fixed-top';bar.className='hidden';
    bar.innerHTML='<div class="real-fixed-row"><div><div class="real-fixed-title">Реальный тест</div><div id="real-fixed-time" class="real-fixed-time">30:00</div></div><button type="button" id="real-fixed-finish" class="btn btn-green real-fixed-finish">Завершить</button></div><div class="real-fixed-line"><div id="real-fixed-fill" class="real-fixed-fill"></div></div>';
    document.body.appendChild(bar);
    $('#real-fixed-finish',bar).onclick=()=>{const finish=$('#real-finish-btn'),back=$('#real-back-btn');if(finish&&!finish.classList.contains('hidden'))finish.click();else if(back&&!back.classList.contains('hidden'))back.click();};
    return bar;
  }
  function syncRealBar(){
    const bar=ensureRealBar();const screen=$('#real-exam-screen');const active=!!(screen&&!screen.classList.contains('hidden'));
    bar.classList.toggle('hidden',!active);document.body.classList.toggle('real-exam-fixed-on',active);if(!active)return;
    const t=$('#real-fixed-time');if(t)t.textContent=$('#real-timer')?.textContent||'30:00';
    const f=$('#real-fixed-fill');if(f)f.style.width=$('#real-line-fill')?.style?.width||'100%';
    const finish=$('#real-finish-btn'),back=$('#real-back-btn'),btn=$('#real-fixed-finish');
    if(btn){const done=finish&&finish.classList.contains('hidden')&&back&&!back.classList.contains('hidden');btn.textContent=done?'В меню':'Завершить';btn.classList.toggle('btn-primary',done);btn.classList.toggle('btn-green',!done);}
  }

  function patchRealExamTimerLive(){
    const oldStart=window.startRealExamTimer;
    if(typeof oldStart!=='function'||oldStart.__livePatched)return;
    window.startRealExamTimer=function(){
      clearInterval(window.realExamTimer);
      const tick=()=>{
        if(window.realExamFinished){clearInterval(window.realExamTimer);return}
        const left=Number(window.realExamTimeLeft||0);
        const total=Number(window.realExamTotalSeconds||1800);
        const m=Math.floor(left/60),s=left%60;
        const txt=`${m}:${s<10?'0'+s:s}`;
        const rt=$('#real-timer');if(rt)rt.textContent=txt;
        const pct=Math.max(0,left/total*100);
        const line=$('#real-line-fill');if(line)line.style.width=pct+'%';
        const ft=$('#real-fixed-time');if(ft)ft.textContent=txt;
        const ff=$('#real-fixed-fill');if(ff)ff.style.width=pct+'%';
        if(left<=0){window.finishRealExam(true);return}
        window.realExamTimeLeft=left-1;
      };
      tick();
      window.realExamTimer=setInterval(tick,1000);
    };
    window.startRealExamTimer.__livePatched=true;
  }

  function patchSearch(){
    if(window.__ecoSearchStable)return;window.__ecoSearchStable=true;
    const oldFilter=window.filterList;
    let timer=null;
    if(typeof oldFilter==='function')window.filterList=function(){clearTimeout(timer);timer=setTimeout(()=>oldFilter(),180)};
  }
  function boot(){
    ensureOfferModal();improveDrawer();patchScreenHooks();patchSearch();renderLimit();
    window.refreshPremiumBadge();
    [80,300,900].forEach(t=>setTimeout(()=>{improveDrawer();renderLimit();syncRealBar()},t));
    window.addEventListener('storage',e=>{if(e.key===USAGE_KEY)renderLimit()});
    window.addEventListener('resize',()=>requestAnimationFrame(syncRealBar),{passive:true});
  }
  ready(boot);
})();
