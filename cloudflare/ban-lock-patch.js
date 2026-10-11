function applyQuizbotBanLock(html){
 const blocked="function showBlockedPaywall(){\n  window.__quizbotHardBlocked=true;\n  document.body.classList.remove('qb-access-pending');\n  document.body.classList.add('qb-hard-banned');\n  try{clearInterval(timerInterval);clearInterval(realExamTimer)}catch(e){}\n  const p=document.getElementById('paywall');\n  if(!p)return;\n  p.classList.remove('hidden');\n  p.classList.add('blocked-mode');\n  const icon=document.getElementById('pay-icon');\n  if(icon)icon.textContent='🚫';\n  const title=document.getElementById('pay-title');\n  if(title)title.textContent='Доступ заблокирован';\n  const sub=document.getElementById('pay-sub');\n  if(sub)sub.textContent='Вы были заблокированы администрацией';\n  const x=document.getElementById('pay-close-btn');\n  if(x){x.hidden=true;x.disabled=true;x.setAttribute('aria-hidden','true')}\n  const note=document.getElementById('pay-danger-note');\n  if(note)note.textContent='';\n  const error=document.getElementById('pay-error');\n  if(error)error.textContent='';\n  let contact=document.getElementById('blocked-contact-card');\n  if(!contact){\n    contact=document.createElement('div');\n    contact.id='blocked-contact-card';\n    contact.className='pay-card blocked-card';\n    const previous=document.querySelector('#paywall .pay-card-payment');\n    if(previous)previous.insertAdjacentElement('afterend',contact);\n    else p.querySelector('.paybox')?.append(contact);\n  }\n  contact.innerHTML='<a class=\"btn btn-red btn-full\" href=\"https://t.me/nurislombekm\" target=\"_blank\" rel=\"noopener\" style=\"text-decoration:none\">💬 Написать администратору</a>';\n}";
 const once=(from,to,label)=>{
   const idx=html.indexOf(from);
   if(idx<0||html.indexOf(from,idx+1)>=0)throw Error('Ban patch failed: '+label);
   html=html.slice(0,idx)+to+html.slice(idx+from.length);
 };
 once('<body>','<body class="qb-access-pending">','keep regular menu hidden until access verified');
 once('<link rel="stylesheet" href="./ui-controls.css?v=2"/>',
      '<link rel="stylesheet" href="./ui-controls.css?v=2"/>\n<link rel="stylesheet" href="./ban-lock.css?v=1"/>',
      'load ban stylesheet');
 once('function resetPaywallMode(){','function resetPaywallMode(){\n  if(window.__quizbotHardBlocked)return;','preserve blocking state');
 once("function showPaywall(msg=''){\n  resetPaywallMode();",
      "function showPaywall(msg=''){\n  if(window.__quizbotHardBlocked){showBlockedPaywall();return;}\n  resetPaywallMode();",
      'cannot replace ban with premium dialog');
 const st=html.indexOf("function showBlockedPaywall(reason=''){");
 const end=html.indexOf('\nfunction hidePaywall(){',st);
 if(st<0||end<=st||html.indexOf("function showBlockedPaywall(reason=''){",st+10)>=0)throw Error('Show blocked handler unavailable');
 html=html.slice(0,st)+blocked+html.slice(end);
 once("function hidePaywall(){document.getElementById('paywall').classList.add('hidden')}",
      "function hidePaywall(){if(window.__quizbotHardBlocked){showBlockedPaywall();return;}document.getElementById('paywall').classList.add('hidden')}",
      'prevent closing ban');
 once("  window.accessLists=accessLists;\n  return accessLists;\n}",
      "  window.accessLists=accessLists;\n  document.body.classList.remove('qb-access-pending');\n  return accessLists;\n}",
      'clear auth loading lock');
 once("    if(id&&data.isBlocked){\n      bannedUsers[id]={active:true,reason:data.blockReason||'Доступ заблокирован.',type:data.blockType||'permanent',until:data.until||''};\n    }",
      "    if(id&&data.isBlocked){\n      bannedUsers[id]={active:true,reason:data.blockReason||'Доступ заблокирован.',type:data.blockType||'permanent',until:data.until||''};\n      if(data.trusted===true)showBlockedPaywall();\n    }",
      'apply trusted ban as soon as access reply arrives');
 once("async function guardedStart(){\n  buttonPop(event);",
      "async function guardedStart(){\n  if(window.__quizbotHardBlocked){showBlockedPaywall();return;}\n  buttonPop(event);",
      'no free tests when banned');
 once("function startTest(){\n  hideConfigError();",
      "function startTest(){\n  if(window.__quizbotHardBlocked){showBlockedPaywall();return;}\n  hideConfigError();",
      'block direct test start');
 once("function startRealExam(){\n  let pool=[...database];",
      "function startRealExam(){\n  if(window.__quizbotHardBlocked){showBlockedPaywall();return;}\n  let pool=[...database];",
      'block real exams');
 once("function showScreen(id){['start-screen'",
      "function showScreen(id){if(window.__quizbotHardBlocked){showBlockedPaywall();return;}['start-screen'",
      'no menu via navigation');
 const target="    }).catch(()=>{});\n\n  }catch(e){\n    showScreen('start-screen');";
 once(target,"    }).catch(()=>{});\n    setInterval(()=>{if(tgUserId&&!document.hidden)loadLists().catch(()=>{});},45000);\n\n  }catch(e){\n    showScreen('start-screen');",
      'ban refresh on open sessions');
 if(html.includes('id="ui-scale-slider"')||!html.includes('ban-lock.css?v=1')||!html.includes("window.__quizbotHardBlocked=true"))throw Error('Ban patch verification failed');
 return html;
}
