/* QuizBot Premium palette and stable quiz layout */
(()=>{'use strict';
const KEY='qb_premium_palette_v1';
const palettes=[
 ['default','Классика','#4854a4','#a7b1df'],
 ['ocean','Океан','#17648a','#92bdd2'],
 ['amethyst','Аметист','#7057a3','#bba8d5'],
 ['rose','Розовый кварц','#a84e60','#dbadb8'],
 ['emerald','Изумруд','#137158','#93c3aa'],
 ['sunset','Закат','#a75834','#dfb49c'],
 ['midnight','Полночь','#3d5286','#9baed2'],
 ['lagoon','Лагуна','#0b6876','#8cbec1'],
 ['orchid','Орхидея','#8b4e74','#d3a9c4'],
 ['moss','Мох','#547145','#b0c59c'],
 ['copper','Медь','#8c5a39','#d2ad8c'],
 ['slate','Сланец','#374f67','#a0b2c0']
];
function premium(){try{return typeof isPremiumUser==='function'&&isPremiumUser()===true&&!window.__quizbotHardBlocked}catch{return false}}
async function refreshPremium(){if(premium())return true;try{if(typeof loadLists==='function')await loadLists()}catch(e){}return premium()}
function apply(){
 let saved='default';try{saved=localStorage.getItem(KEY)||'default'}catch(e){}
 const allowed=!window.__quizbotHardBlocked&&(!window.__qbPaletteAccessResolved||window.__qbPaletteAccessAllowed===true);
 document.body.dataset.qbPalette=allowed&&palettes.some(p=>p[0]===saved)?saved:'default';
 document.querySelectorAll('.qb-palette-choice').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===document.body.dataset.qbPalette)));
}
function init(){
const section=document.querySelector('#side-drawer [aria-label="Настройки и доступ"]');
const overlay=document.createElement('div');overlay.className='qb-palette-overlay';overlay.hidden=true;
overlay.innerHTML='<div class="qb-palette-dialog" role="dialog" aria-modal="true" aria-label="Настройки оформления"><div class="qb-palette-heading"><h2>🎨 Палитра сайта</h2><button type="button" class="qb-palette-close" aria-label="Закрыть">✕</button></div><p>Цвета автоматически работают в светлой и ночной теме.</p><div class="qb-palette-grid"></div></div>';
document.body.appendChild(overlay);
overlay.querySelector('.qb-palette-close').onclick=()=>overlay.hidden=true;
overlay.onclick=e=>{if(e.target===overlay)overlay.hidden=true};
document.addEventListener('keydown',e=>{if(e.key==='Escape')overlay.hidden=true});
for(const [id,label,a,b] of palettes){const button=document.createElement('button');button.type='button';button.className='qb-palette-choice';button.dataset.palette=id;button.innerHTML='<span class="qb-palette-swatches"><i style="background:'+a+'"></i><i style="background:'+b+'"></i></span><span>'+label+'</span>';button.onclick=()=>{if(!premium())return;localStorage.setItem(KEY,id);apply()};overlay.querySelector('.qb-palette-grid').appendChild(button)}
if(section){const btn=document.createElement('button');btn.type='button';btn.className='drawer-item qb-drawer-item';btn.innerHTML='<span class="qb-drawer-icon">🎨</span><span class="qb-drawer-item-name">Настройки оформления · PRO</span><span class="qb-drawer-arrow">›</span>';section.appendChild(btn);btn.onclick=async()=>{window.closeDrawer?.();btn.disabled=true;try{if(!(await refreshPremium())){window.openActivationPanel?.();return}overlay.hidden=false;apply()}finally{btn.disabled=false}}}
const screen=document.getElementById('test-screen'),badge=document.getElementById('gen-badge-test');
if(screen&&badge&&!screen.querySelector('.qb-question-scroll')){const scroll=document.createElement('div');scroll.className='qb-question-scroll';screen.insertBefore(scroll,badge);for(const id of ['gen-badge-test','q-index','question','options']){const el=document.getElementById(id);if(el)scroll.appendChild(el)}for(const name of ['nextQuestion','prevQuestion']){const original=window[name];if(typeof original==='function')window[name]=function(...args){const value=original.apply(this,args);scroll.scrollTop=0;return value}}}
window.addEventListener('qb:access-updated',apply);
window.addEventListener('storage',e=>{if(e.key===KEY)apply()});
apply();setInterval(apply,3000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
