import { validateMiniAppGateInitData, reportBrowserGateEvent, quizbotIsBlockedUser } from './backend.mjs';

const COOKIE='__Host-tsuequiz-auth';
const TTL=8*3600;
const enc=new TextEncoder();
const response=(o,status=200,headers={})=>new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function hmac(secret,text){
 const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=await crypto.subtle.sign('HMAC',k,enc.encode(text));
 return Array.from(new Uint8Array(signed),n=>n.toString(16).padStart(2,'0')).join('');
}
function same(a,b){a=String(a||'');b=String(b||'');let v=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)v|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return v===0}
const sourceIP=req=>String(req.headers.get('CF-Connecting-IP')||'неизвестен').slice(0,70);
async function cookie(env,type,id=''){
 const end=Math.floor(Date.now()/1000)+TTL;
 const subject=type==='telegram'?String(id||''):'';
 if(type==='telegram'&&!/^[1-9][0-9]{0,18}$/.test(subject))throw Error('MISSING_VERIFIED_TELEGRAM_ID');
 const body=type==='telegram'?'telegram.'+subject+'.'+end:'owner.'+end;
 return body+'.'+await hmac(env.GATE_SESSION_SECRET,body);
}
function cookieHeader(value){return COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+TTL}
async function authorized(req,env){
 const raw=req.headers.get('Cookie')||'';
 const value=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 const owner=value.match(/^owner\.(\d{10})\.([a-f0-9]{64})$/);
 const telegram=value.match(/^telegram\.([1-9][0-9]{0,18})\.(\d{10})\.([a-f0-9]{64})$/);
 const m=telegram||owner;
 if(!m)return null;
 const type=telegram?'telegram':'owner',id=telegram?m[1]:null,expiry=Number(telegram?m[2]:m[1]),signature=telegram?m[3]:m[2];
 if(expiry<Math.floor(Date.now()/1000))return null;
 const body=type==='telegram'?'telegram.'+id+'.'+expiry:'owner.'+expiry;
 if(!same(signature,await hmac(env.GATE_SESSION_SECRET,body)))return null;
 return {type,id};
}

function validPost(req){
 const origin=req.headers.get('Origin');
 return (!origin||origin===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site'&&(req.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json');
}
async function loginLimit(req,env){
 const k=await hmac(env.GATE_SESSION_SECRET,'attempt:'+sourceIP(req)),now=Date.now(),min=now-900000;
 await env.DB.prepare('INSERT INTO quizbot_browser_gate(k,window_start,attempts,last_report_at) VALUES(?,?,1,0) ON CONFLICT(k) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END').bind(k,now,min,min,now).run();
 const row=await env.DB.prepare('SELECT attempts FROM quizbot_browser_gate WHERE k=?').bind(k).first();
 return Number(row?.attempts||0)<=7;
}
async function report(req,env,ctx,kind){
 const ip=sourceIP(req),now=Date.now(),k=await hmac(env.GATE_SESSION_SECRET,'report:'+kind+':'+ip),delay=kind==='success'?0:600000;
 const r=await env.DB.prepare('INSERT INTO quizbot_browser_gate(k,window_start,attempts,last_report_at) VALUES(?,?,0,?) ON CONFLICT(k) DO UPDATE SET last_report_at=? WHERE last_report_at<?').bind(k,now,now,now,now-delay).run();
 if(!Number(r.meta?.changes||0))return;
 const title={visit:'🌐 Открыта браузерная версия QuizBot (вход не подтверждён)',failed:'⛔ Неверный логин или код браузерного входа',blocked:'🚫 Много неверных попыток входа',success:'✅ Подтверждённый вход администратора через браузер'}[kind];
 const ua=String(req.headers.get('User-Agent')||'').slice(0,250);
 const os=/iPhone|iPad/i.test(ua)?'iOS':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Неизвестно';
 const app=/Telegram/i.test(ua)?'Telegram WebView':/CriOS|Chrome/i.test(ua)?'Chrome':/Firefox|FxiOS/i.test(ua)?'Firefox':/Safari/i.test(ua)?'Safari':'Браузер';
 const info=[title,'Время UTC: '+new Date(now).toISOString(),'IP (Cloudflare): '+ip,'Страна (Cloudflare): '+(req.cf?.country||'нет данных'),'Устройство: '+os+' / '+app,'Telegram/Google личность: не установлена'].join('\n');
 if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(reportBrowserGateEvent(env,info).catch(e=>console.warn('Report error',String(e))));
}
function loginPage(){
 const html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>QuizBot — защищённый вход</title><script src="https://telegram.org/js/telegram-web-app.js" async></script><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:#f3f6fb;color:#0f172a;font:15px system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center;padding:20px}.box{width:min(100%,390px);background:#fff;border:1px solid #d9e2ee;border-radius:20px;padding:24px;box-shadow:0 15px 42px rgba(15,23,42,.08)}h1{font-size:22px;margin:0 0 8px}p{color:#64748b;line-height:1.5;margin:0 0 14px}label{display:block;margin:13px 0 6px;font-weight:650}input{width:100%;height:47px;padding:10px 12px;border-radius:11px;border:1px solid #cbd5e1;font:inherit}button{width:100%;height:48px;margin-top:20px;border:0;border-radius:11px;background:#2563eb;color:#fff;font:inherit;font-weight:650}button:disabled{opacity:.5}.small{font-size:12px;margin-top:17px}.status{min-height:20px;color:#b91c1c;font-size:13px;margin-top:10px}#login{display:none}#checking{text-align:center;padding:28px 0;color:#64748b}</style></head><body><main class="box"><div id="checking">Проверяем вход через Telegram…</div><section id="login"><h1>Вход администратора</h1><p>Браузерная версия доступна только владельцу. Студентам нужно открыть QuizBot через Telegram.</p><form id="form"><label for="user">Логин</label><input id="user" name="username" autocomplete="username" required maxlength="80"><label for="code">Код администратора</label><input id="code" name="password" type="password" autocomplete="current-password" required maxlength="128"><button id="submit" type="submit">Войти</button><div id="status" class="status" role="status"></div></form><p class="small">В Telegram Mini App вводить логин не нужно.</p></section></main><script>(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));let ok=false;for(let i=0;i<25;i++){const data=window.Telegram?.WebApp?.initData||"";if(data){try{const r=await fetch("/__gate/telegram",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({initData:data})});if(r.ok){ok=true;location.replace("/");}}catch(e){}break;}await wait(110)}if(ok)return;document.getElementById("checking").style.display="none";document.getElementById("login").style.display="block";fetch("/__gate/visit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",credentials:"same-origin"}).catch(()=>{});document.getElementById("form").addEventListener("submit",async e=>{e.preventDefault();const btn=document.getElementById("submit"),status=document.getElementById("status");status.textContent="";btn.disabled=true;try{const r=await fetch("/__gate/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:document.getElementById("user").value,code:document.getElementById("code").value})});if(r.ok){location.replace("/");return}status.textContent=r.status===429?"Слишком много попыток. Повторите через 15 минут.":"Неверный логин или код."}catch(e){status.textContent="Ошибка подключения."}finally{btn.disabled=false}})})();</script></body></html>';
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
}
export async function gate(req,env,ctx){
 if(!env.GATE_SESSION_SECRET||!env.BROWSER_ADMIN_USER||!env.BROWSER_ADMIN_CODE||!env.DB)return response({ok:false,error:'AUTH_NOT_CONFIGURED'},503);
 const route=new URL(req.url).pathname,method=req.method;
 if(route==='/__gate/telegram'&&method==='POST'){
  if(!validPost(req))return response({ok:false,error:'INVALID_ORIGIN'},403);
  const b=await req.json().catch(()=>null);
  if(!b||typeof b.initData!=='string'||b.initData.length>8192)return response({ok:false,error:'INVALID_TELEGRAM'},401);
  const signedUser=await validateMiniAppGateInitData(b.initData,env);
  if(!signedUser?.id)return response({ok:false,error:'INVALID_TELEGRAM'},401);
  return response({ok:true},200,{'Set-Cookie':cookieHeader(await cookie(env,'telegram',signedUser.id))});
 }
 if(route==='/__gate/login'&&method==='POST'){
  if(!validPost(req))return response({ok:false,error:'INVALID_ORIGIN'},403);
  if(!(await loginLimit(req,env))){await report(req,env,ctx,'blocked');return response({ok:false,error:'TOO_MANY_ATTEMPTS'},429)}
  const b=await req.json().catch(()=>null);
  const username=typeof b?.username==='string'?b.username.slice(0,80):'';
  const code=typeof b?.code==='string'?b.code.slice(0,128):'';
  const userOK=same(await hmac(env.GATE_SESSION_SECRET,username),await hmac(env.GATE_SESSION_SECRET,env.BROWSER_ADMIN_USER));
  const codeOK=same(await hmac(env.GATE_SESSION_SECRET,code),await hmac(env.GATE_SESSION_SECRET,env.BROWSER_ADMIN_CODE));
  if(!userOK||!codeOK){await report(req,env,ctx,'failed');return response({ok:false,error:'WRONG_CREDENTIALS'},401)}
  await report(req,env,ctx,'success');
  return response({ok:true},200,{'Set-Cookie':cookieHeader(await cookie(env,'owner'))});
 }
 if(route==='/__gate/visit'&&method==='POST'){
  if(!validPost(req))return response({ok:false,error:'INVALID_ORIGIN'},403);
  await report(req,env,ctx,'visit');return response({ok:true});
 }
 if(route==='/__gate/logout'&&method==='POST'){
  if(!validPost(req))return response({ok:false,error:'INVALID_ORIGIN'},403);
  return response({ok:true},200,{'Set-Cookie':COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
 }
 if(route.startsWith('/__gate/'))return response({ok:false,error:'NOT_FOUND'},404);
 const session=await authorized(req,env);
 if(session){
  // Admin password sign-in is independent. Telegram visitors are checked against
  // the real access list before any API data (including questions) is returned.
  // /api/access remains reachable so the client can show its ban screen.
  if(session.type==='telegram'&&route.startsWith('/api/')&&route!=='/api/access'){
   if(await quizbotIsBlockedUser(env,session.id)){
    return response({ok:false,error:'ACCOUNT_BLOCKED',message:'Вы были заблокированы администрацией'},403);
   }
  }
  return null;
 }
 if((method==='GET'||method==='HEAD')&&['/','/index.html','/admin','/admin/index.html'].includes(route))return loginPage();
 if(route.startsWith('/api/'))return response({ok:false,error:'AUTH_REQUIRED'},401);
 return new Response('Требуется вход через Telegram или авторизация администратора.',{status:403,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
}