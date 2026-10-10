// Encrypted, owner-managed Telegram bot token. Never put secrets in git.
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const validToken=t=>/^[0-9]{6,15}:[A-Za-z0-9_-]{25,}$/.test(t);
const safeUrl=u=>{
  const x=new URL(u);
  if(x.protocol!=='https:'||!x.hostname||x.username||x.password||x.search||x.hash)throw new Error('PUBLIC_URL должен быть HTTPS-адресом приложения');
  return x.origin+x.pathname.replace(/\/+$/,'');
};
function encryptionSecret(env){
  const k=String(env.BOT_TOKEN_ENCRYPTION_KEY||'');
  if(k.length<32)throw new Error('Сначала настройте BOT_TOKEN_ENCRYPTION_KEY (не менее 32 случайных символов) в Cloudflare Secrets');
  return k;
}
async function aesKey(env){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(encryptionSecret(env)));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const base64=b=>btoa(Array.from(b,c=>String.fromCharCode(c)).join(''));
const unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function encryptToken(token,env){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(env),encoder.encode(token)));
  const bytes=new Uint8Array(iv.length+encrypted.length);bytes.set(iv);bytes.set(encrypted,iv.length);
  return base64(bytes);
}
export async function decryptToken(value,env){
  const bytes=unbase64(value);
  if(bytes.length<29)throw new Error('Зашифрованная настройка бота повреждена');
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},await aesKey(env),bytes.subarray(12));
  return decoder.decode(plaintext);
}
export async function currentToken(env){
  const row=await env.DB.prepare('SELECT ciphertext FROM bot_settings WHERE id=1').first();
  if(row){
    // Deliberately fail closed rather than silently restoring a previously rotated key.
    const token=await decryptToken(row.ciphertext,env);
    if(!validToken(token))throw new Error('Неверный токен в настройках бота');
    return token;
  }
  return String(env.BOT_TOKEN||'');
}
export async function telegramCall(token,method,data={}){
  const response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)
  });
  let result;
  try{result=await response.json()}catch{throw new Error('Telegram API недоступен (HTTP '+response.status+')')}
  // Do not log or echo Telegram tokens in API errors.
  if(!response.ok||!result?.ok)throw new Error('Telegram API: '+String(result?.description||response.status).slice(0,220));
  return result.result;
}
export async function getBotStatus(env){
  const token=await currentToken(env);
  if(!token)return {configured:false};
  try{
    const bot=await telegramCall(token,'getMe');
    return {configured:true,reachable:true,id:bot.id,username:bot.username||'',name:bot.first_name||''};
  }catch{
    return {configured:true,reachable:false};
  }
}
export async function rotateBotToken(env,newToken){
  const token=String(newToken||'').trim();
  if(!validToken(token))throw new Error('Введите корректный токен Telegram-бота от BotFather');
  encryptionSecret(env);
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(env.WEBHOOK_SECRET||''))throw new Error('Настройте WEBHOOK_SECRET: 16–64 символа A-Z, a-z, 0-9, _ или -');
  if(!env.PUBLIC_URL)throw new Error('Не настроен PUBLIC_URL');
  const webhookUrl=safeUrl(env.PUBLIC_URL)+'/api/telegram-webhook';

  // Validate the provided token before touching configuration.
  const newBot=await telegramCall(token,'getMe');
  if(!newBot?.is_bot)throw new Error('Этот токен не принадлежит Telegram-боту');

  const prior=await env.DB.prepare('SELECT ciphertext FROM bot_settings WHERE id=1').first();
  const previousToken=await currentToken(env);
  const ciphertext=await encryptToken(token,env);
  await env.DB.prepare('INSERT INTO bot_settings(id,ciphertext,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at').bind(ciphertext,Math.floor(Date.now()/1000)).run();
  try{
    await telegramCall(token,'setWebhook',{url:webhookUrl,secret_token:env.WEBHOOK_SECRET,allowed_updates:['message'],drop_pending_updates:false});
  }catch(e){
    // Revert if Telegram refuses the new webhook so the previous bot stays available.
    try{
      if(prior)await env.DB.prepare('UPDATE bot_settings SET ciphertext=? WHERE id=1').bind(prior.ciphertext).run();
      else await env.DB.prepare('DELETE FROM bot_settings WHERE id=1').run();
    }catch{throw new Error('Не удалось установить webhook и автоматически восстановить старые настройки. Проверьте Cloudflare D1.')}
    throw e;
  }
  if(previousToken&&previousToken!==token){
    try{await telegramCall(previousToken,'deleteWebhook',{drop_pending_updates:false})}catch{}
  }
  return {id:newBot.id,username:newBot.username||'',name:newBot.first_name||'',webhook_ready:true};
}
