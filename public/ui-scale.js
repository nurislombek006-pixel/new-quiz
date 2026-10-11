/* TSUEQuiz readable scale v2: text-only scaling, never zooms page layout.
   The controls live in the fixed side drawer, outside the resized content. */
(function(){
  'use strict';
  const KEY='quizbot_readability_percent_v2';
  const LEGACY='quizbot_ui_scale_percent_v1';
  const MIN=60,MAX=180,STEP=10;
  const clamp=value=>{
    const n=Number(value);
    return Number.isFinite(n)?Math.max(MIN,Math.min(MAX,Math.round(n/STEP)*STEP)):100;
  };
  let current=100;
  const get=id=>document.getElementById(id);
  function neutralizeBrokenZoom(){
    const app=document.querySelector('.app');
    if(app){
      app.style.removeProperty('zoom');
      app.style.removeProperty('width');
      app.style.removeProperty('max-width');
    }
    try{localStorage.removeItem(LEGACY)}catch(e){}
  }
  function update(value,write=true){
    const n=clamp(value);
    current=n;
    neutralizeBrokenZoom();
    const root=document.documentElement;
    root.style.setProperty('--qb-reader-scale',String(n/100));
    root.style.setProperty('--qb-control-scale',String(Math.min(1.25,Math.max(.82,n/100))));
    const output=get('ui-scale-value');
    if(output)output.textContent=n+'%';
    const minus=get('ui-scale-minus'),plus=get('ui-scale-plus'),reset=get('ui-scale-reset');
    if(minus)minus.disabled=n<=MIN;
    if(plus)plus.disabled=n>=MAX;
    if(reset)reset.disabled=n===100;
    if(write)try{localStorage.setItem(KEY,String(n))}catch(e){}
    return n;
  }
  function boot(){
    // No migration of old values: a legacy 180% whole-page zoom could trap the user.
    neutralizeBrokenZoom();
    let saved=100;
    try{saved=localStorage.getItem(KEY)??100}catch(e){}
    update(saved,false);
    get('ui-scale-minus')?.addEventListener('click',()=>update(current-STEP));
    get('ui-scale-plus')?.addEventListener('click',()=>update(current+STEP));
    get('ui-scale-reset')?.addEventListener('click',()=>update(100));
    window.addEventListener('storage',e=>{
      if(e.key===KEY)update(e.newValue??100,false);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
