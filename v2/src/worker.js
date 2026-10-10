// v2: Cloudflare Worker + D1. No trust in client-provided Telegram IDs.
const H = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const fail=(message,status=400)=>json({ok:false,error:message},status);
const now=()=>Math.floor(Date.now()/1000);
const positiveId=(x)=>/^[1-9]\d{0,18}$/.test(String(x||''))?String(x):null;
const same=(a,b)=>{
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
};
const bytes=(s)=>new TextEncoder().encode(s);
const hmac=async(key,data)=>{
  const k=await crypto.subtle.importKey('raw',typeof key==='string'?bytes(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(data)));
};
const toHex=(buf)=>Array.from(buf,x=>x.toString(16).padStart(2,'0')).join('');
async function auth(req,env){
  const raw=req.headers.get('X-Telegram-Init-Data')||'';
  if(!raw||raw.length>8000||!env.BOT_TOKEN)return null;
  const p=new URLSearchParams(raw),hash=p.get('hash'),date=Number(p.get('auth_date')||0);
  if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!date||Math.abs(now()-date)>86400)return null;
  const lines=Array.from(p.entries()).filter(([k])=>k!=='hash'&&k!=='signature').sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
  const secret=await hmac('WebAppData',env.BOT_TOKEN),expected=toHex(await hmac(secret,lines));
  if(!same(hash.toLowerCase(),expected))return null;
  try{
    const user=JSON.parse(p.get('user')||'null');
    if(!positiveId(user?.id))return null;
    return {id:String(user.id),username:String(user.username||'').slice(0,64),first_name:String(user.first_name||'').slice(0,120),last_name:String(user.last_name||'').slice(0,120)};
  }catch{return null;}
}
async function body(req,max=1024*1024){
  if(Number(req.headers.get('content-length')||0)>max)throw Error('Слишком большой запрос');
  const raw=await req.text();if(raw.length>max)throw Error('Слишком большой запрос');
  return JSON.parse(raw||'{}');
}
async function touch(db,user,source='app'){
  const t=now();
  await db.prepare('INSERT INTO users (telegram_id,username,first_name,last_name,first_seen,last_seen,source) VALUES (?,?,?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,last_seen=excluded.last_seen,source=excluded.source')
    .bind(user.id,user.username,user.first_name,user.last_name,t,t,source).run();
}
async function profile(db,id){
  return await db.prepare('SELECT telegram_id,username,first_name,last_name,last_seen,premium_until,is_banned,ban_reason,version FROM users WHERE telegram_id=?').bind(id).first();
}
async function requireAdmin(req,env){
  const u=await auth(req,env);
  return u&&String(u.id)===String(env.OWNER_TG_ID||'')?u:null;
}
async function audit(db,id,action,target,details){
  await db.prepare('INSERT INTO audit_log (admin_id,action,target,details,created_at) VALUES (?,?,?,?,?)').bind(id,action,target,JSON.stringify(details),now()).run();
}
async function telegram(env,method,payload){
  const r=await fetch('https://api.telegram.org/bot'+env.BOT_TOKEN+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json();if(!data.ok)throw Error('Telegram API: '+(data.description||r.status));return data;
}
async function webhook(req,env){
  if(!env.WEBHOOK_SECRET||!same(req.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',env.WEBHOOK_SECRET))return fail('Forbidden',403);
  const update=await body(req,200000),m=update.message,from=m?.from;
  if(!from||m.chat?.type!=='private'||!positiveId(from.id))return json({ok:true});
  const user={id:String(from.id),username:from.username||'',first_name:from.first_name||'',last_name:from.last_name||''};
  await touch(env.DB,user,'bot');
  const admin=user.id===String(env.OWNER_TG_ID||'');
  const cmd=String(m.text||'').split(/\s+/)[0].split('@')[0];
  const appUrl=String(env.PUBLIC_URL||'').replace(/\/+$/,'');
  if((cmd==='/start'||cmd==='/admin'||cmd==='/menu')&&/^https:\/\//.test(appUrl)){
    const buttons=[[{text:'📚 Открыть тест',web_app:{url:appUrl+'/index.html'}}]];
    if(admin)buttons.push([{text:'⚙️ Админ-панель',web_app:{url:appUrl+'/index.html#admin'}}]);
    await telegram(env,'sendMessage',{chat_id:user.id,text:admin?'Панель владельца и тесты:':'Добро пожаловать! Откройте приложение:',reply_markup:{inline_keyboard:buttons}});
  }else if(cmd==='/admin'&&!admin){
    await telegram(env,'sendMessage',{chat_id:user.id,text:'Команда недоступна.'});
  }
  return json({ok:true});
}
const secure=(x)=>String(x||'').slice(0,4000);
async function route(req,env){
  if(!env.DB||!env.BOT_TOKEN)return fail('Не настроены база D1 или токен бота',503);
  const url=new URL(req.url),path=url.pathname;
  if(path==='/api/telegram-webhook'&&req.method==='POST')return webhook(req,env);
  if(path==='/api/health')return json({ok:true,service:'new-quiz-v2'});
  const user=await auth(req,env);
  if(!user)return fail('Откройте приложение через Telegram',401);
  const admin=user.id===String(env.OWNER_TG_ID||'');
  if(path==='/api/session'&&req.method==='GET'){
    await touch(env.DB,user);
    const p=await profile(env.DB,user.id);
    return json({ok:true,user:p,admin,server_time:now(),online_window:45});
  }
  if(path==='/api/ping'&&req.method==='POST'){
    await touch(env.DB,user);const p=await profile(env.DB,user.id);
    return json({ok:true,banned:!!p?.is_banned,premium_until:p?.premium_until||0,version:p?.version||0});
  }
  const me=await profile(env.DB,user.id);
  if(!me)return fail('Сначала откройте главную страницу',409);
  if(!admin&&me.is_banned)return fail('Доступ заблокирован: '+secure(me.ban_reason),403);
  if(path==='/api/subjects'&&req.method==='GET'){
    const r=await env.DB.prepare('SELECT s.id,s.title,COUNT(q.id) AS count FROM subjects s LEFT JOIN questions q ON q.subject_id=s.id GROUP BY s.id ORDER BY s.title').all();
    return json({ok:true,subjects:r.results});
  }
  if(path==='/api/questions'&&req.method==='GET'){
    const sub=url.searchParams.get('subject');if(!sub)return fail('Укажите предмет');
    const max=admin||(me.premium_until||0)>now()?100:20;
    const limit=Math.min(max,Math.max(1,Number(url.searchParams.get('limit'))||20));
    const r=await env.DB.prepare('SELECT id,topic,text,options,correct_index FROM questions WHERE subject_id=? ORDER BY RANDOM() LIMIT ?').bind(sub,limit).all();
    return json({ok:true,questions:r.results.map(q=>({...q,options:JSON.parse(q.options)})),limit:max});
  }
  if(!admin)return fail('Только владелец',403);
  if(path==='/api/admin/users'&&req.method==='GET'){
    const offset=Math.min(100000,Math.max(0,Number(url.searchParams.get('offset'))||0));
    const q=(url.searchParams.get('q')||'').trim().slice(0,60);
    let res;
    if(q)res=await env.DB.prepare('SELECT * FROM users WHERE telegram_id LIKE ? OR username LIKE ? OR first_name LIKE ? ORDER BY last_seen DESC LIMIT 60 OFFSET ?')
      .bind('%'+q+'%','%'+q+'%','%'+q+'%',offset).all();
    else res=await env.DB.prepare('SELECT * FROM users ORDER BY last_seen DESC LIMIT 60 OFFSET ?').bind(offset).all();
    const totals=await env.DB.prepare('SELECT COUNT(*) total,SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END) online,SUM(CASE WHEN premium_until > ? THEN 1 ELSE 0 END) premium,SUM(is_banned) banned FROM users').bind(now()-45,now()).first();
    return json({ok:true,users:res.results,totals,server_time:now(),next_offset:res.results.length===60?offset+60:null});
  }
  if(path==='/api/admin/stats'&&req.method==='GET'){
    const [s,q]=await env.DB.batch([env.DB.prepare('SELECT COUNT(*) n FROM subjects'),env.DB.prepare('SELECT COUNT(*) n FROM questions')]);
    return json({ok:true,subjects:s.results[0].n,questions:q.results[0].n});
  }
  if(path==='/api/admin/access'&&req.method==='POST'){
    const d=await body(req),id=positiveId(d.telegram_id),action=String(d.action||'');
    if(!id||!['premium','revoke','ban','unban'].includes(action))return fail('Некорректный ID или операция');
    await env.DB.prepare('INSERT OR IGNORE INTO users (telegram_id,first_seen,last_seen) VALUES (?,?,?)').bind(id,now(),0).run();
    if(action==='premium'){
      const days=Number(d.days);if(!Number.isInteger(days)||days<1||days>3650)return fail('Дней: от 1 до 3650');
      await env.DB.prepare('UPDATE users SET premium_until=?,version=version+1 WHERE telegram_id=?').bind(now()+days*86400,id).run();
    }else if(action==='revoke'){
      await env.DB.prepare('UPDATE users SET premium_until=0,version=version+1 WHERE telegram_id=?').bind(id).run();
    }else if(action==='ban'){
      await env.DB.prepare('UPDATE users SET is_banned=1,ban_reason=?,version=version+1 WHERE telegram_id=?').bind(secure(d.reason||'Нарушение правил').slice(0,200),id).run();
    }else{
      await env.DB.prepare('UPDATE users SET is_banned=0,ban_reason=NULL,version=version+1 WHERE telegram_id=?').bind(id).run();
    }
    await audit(env.DB,user.id,action,id,{days:d.days,reason:d.reason});
    return json({ok:true,user:await profile(env.DB,id)});
  }
  if(path==='/api/admin/subject'&&req.method==='POST'){
    const d=await body(req),id=String(d.id||'').trim().toLowerCase(),title=String(d.title||'').trim().slice(0,100);
    if(!/^[a-z0-9_-]{2,45}$/.test(id))return fail('Ключ: латиница, цифры, - или _');
    if(d.action==='delete'){
      await env.DB.batch([env.DB.prepare('DELETE FROM questions WHERE subject_id=?').bind(id),env.DB.prepare('DELETE FROM subjects WHERE id=?').bind(id)]);
      await audit(env.DB,user.id,'delete_subject',id,{});return json({ok:true});
    }
    if(!title)return fail('Название обязательно');
    await env.DB.prepare('INSERT INTO subjects (id,title,created_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title').bind(id,title,now()).run();
    await audit(env.DB,user.id,'save_subject',id,{title});return json({ok:true});
  }
  if(path==='/api/admin/import'&&req.method==='POST'){
    const d=await body(req,1500000),subject=String(d.subject||''),qs=d.questions;
    if(!Array.isArray(qs)||qs.length<1||qs.length>150)return fail('От 1 до 150 вопросов за запрос');
    if(!await env.DB.prepare('SELECT id FROM subjects WHERE id=?').bind(subject).first())return fail('Предмет не найден');
    const clean=qs.map((q,i)=>{
      const t=String(q.text||'').trim(),topic=String(q.topic||d.topic||'Общие').trim().slice(0,100);
      const opts=q.options;
      if(t.length<3||t.length>1600||!Array.isArray(opts)||opts.length!==4||opts.some(x=>!String(x||'').trim()||String(x).length>500)||!Number.isInteger(q.correct_index)||q.correct_index<0||q.correct_index>3)throw Error('Неверный формат вопроса #'+(i+1));
      return {text:t,topic,options:JSON.stringify(opts.map(x=>String(x).trim())),correct:q.correct_index};
    });
    const cmds=[];
    for(let i=0;i<clean.length;i+=12){
      const group=clean.slice(i,i+12);
      const placeholders=group.map(()=>'(?,?,?,?,?,?)').join(',');
      const params=group.flatMap(q=>[subject,q.topic,q.text,q.options,q.correct,now()]);
      cmds.push(env.DB.prepare('INSERT INTO questions (subject_id,topic,text,options,correct_index,created_at) VALUES '+placeholders).bind(...params));
    }
    await env.DB.batch(cmds);
    await audit(env.DB,user.id,'import',subject,{count:clean.length});
    return json({ok:true,inserted:clean.length});
  }
  if(path==='/api/admin/questions'&&req.method==='GET'){
    const sub=url.searchParams.get('subject')||'';
    const r=await env.DB.prepare('SELECT id,topic,text,options,correct_index FROM questions WHERE subject_id=? ORDER BY id DESC LIMIT 100').bind(sub).all();
    return json({ok:true,questions:r.results.map(q=>({...q,options:JSON.parse(q.options)}))});
  }
  if(path==='/api/admin/question/delete'&&req.method==='POST'){
    const d=await body(req),id=Number(d.id);if(!Number.isSafeInteger(id)||id<1)return fail('Неверный ID');
    await env.DB.prepare('DELETE FROM questions WHERE id=?').bind(id).run();
    await audit(env.DB,user.id,'delete_question',String(id),{});return json({ok:true});
  }
  return fail('Маршрут не найден',404);
}
export default {
  async fetch(req,env,ctx){
    const path=new URL(req.url).pathname;
    if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
    try{return await route(req,env);}catch(e){console.error('API',e);return fail(e?.message||'Внутренняя ошибка',500);}
  }
};
