/* Track activity exclusively inside the QuizBot Mini App.
   Telegram ID/username are NEVER taken from JavaScript fields for storage:
   the Netlify API extracts them only after verifying signed Telegram initData.
   We don't track Telegram's global presence or activity outside this app. */
(function(){
  'use strict';
  let opened=false;
  let sending=false;
  let lastOk=0;

  function initData(){
    try{return String(window.Telegram?.WebApp?.initData||'')}
    catch{return ''}
  }
  async function heartbeat(){
    if(sending||document.hidden)return;
    const data=initData();
    if(!data)return;
    const now=Date.now();
    if(opened&&now-lastOk<70000)return;
    sending=true;
    try{
      const response=await fetch('/api/activity',{
        method:'POST',
        cache:'no-store',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-Telegram-Init-Data':data},
        body:JSON.stringify({event:opened?'heartbeat':'open'})
      });
      if(response.ok){
        opened=true;
        lastOk=Date.now();
      }
    }catch(e){
      // Tracking errors must never prevent the quiz from working.
    }finally{sending=false}
  }
  // A user is considered active only while their Mini App is visible.
  setTimeout(heartbeat,1200);
  setInterval(heartbeat,90000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)heartbeat();
  });
  window.addEventListener('focus',heartbeat);
})();
