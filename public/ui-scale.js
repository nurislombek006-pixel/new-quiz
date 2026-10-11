/* TSUEQuiz: adjustable interface scale on this device; quiz logic remains unchanged. */
(function(){
  'use strict';
  const KEY='quizbot_ui_scale_percent_v1',MIN=60,MAX=180,STEP=5;
  const clamp=value=>{
    const n=Number(value);
    return Number.isFinite(n)?Math.min(MAX,Math.max(MIN,Math.round(n/STEP)*STEP)):100;
  };
  const app=()=>document.querySelector('.app');
  const slider=()=>document.getElementById('ui-scale-slider');
  function apply(value){
    const n=clamp(value),target=app();
    if(target){
      const factor=n/100;
      target.style.zoom=String(factor);
      target.style.width=(100/factor)+'%';
      /* Inline width offsets zoom to preserve the mobile viewport. */
      target.style.maxWidth='520px';
    }
    const input=slider(),label=document.getElementById('ui-scale-value');
    if(input)input.value=String(n);
    if(label)label.textContent=n+'%';
    try{localStorage.setItem(KEY,String(n))}catch(e){}
    return n;
  }
  function boot(){
    let remembered=100;
    try{remembered=clamp(localStorage.getItem(KEY)??100)}catch(e){}
    apply(remembered);
    slider()?.addEventListener('input',e=>apply(e.target.value));
    document.getElementById('ui-scale-minus')?.addEventListener('click',()=>apply(Number(slider()?.value||100)-STEP));
    document.getElementById('ui-scale-plus')?.addEventListener('click',()=>apply(Number(slider()?.value||100)+STEP));
    document.getElementById('ui-scale-reset')?.addEventListener('click',()=>apply(100));
    window.addEventListener('storage',e=>{if(e.key===KEY)apply(e.newValue??100)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
