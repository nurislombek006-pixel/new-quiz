/* Accessibility and state labels for the existing interface. No data writes. */
(()=>{'use strict';
 function init(){
  const labels={
   'time-custom':'Время теста в секундах','count-select':'Количество вопросов',
   'count-custom':'Своё количество вопросов','range-from':'Первый номер вопроса',
   'range-to':'Последний номер вопроса','search-box':'Поиск по вопросам',
   'subject-select':'Выбрать предмет','menu-toggle':'Открыть меню',
   'prev-btn':'Предыдущий вопрос'
  };
  for(const [id,label] of Object.entries(labels)){
   const el=document.getElementById(id);if(el)el.setAttribute('aria-label',label);
  }
  const inputs=['time-custom','count-select'];
  for(const id of inputs){
   const el=document.getElementById(id),caption=el?.closest('.setting-card')?.querySelector('.simple-label');
   if(caption&&caption.tagName!=='LABEL'){
    const label=document.createElement('label');label.className=caption.className;label.htmlFor=id;
    label.textContent=caption.textContent;caption.replaceWith(label);
   }
  }
  const modes=[...document.querySelectorAll('.mode-tab,.seg button')];
  const update=()=>{
   for(const el of modes)el.setAttribute('aria-pressed',String(el.classList.contains('active')));
   const fav=document.getElementById('fav-current');
   if(fav){const selected=fav.classList.contains('active');fav.setAttribute('aria-label',selected?'Убрать из избранного':'Добавить в избранное');fav.setAttribute('aria-pressed',String(selected))}
   const theme=document.getElementById('theme-btn');
   if(theme)theme.setAttribute('aria-label',document.body.classList.contains('light')?'Включить тёмную тему':'Включить светлую тему');
  };
  update();
  const observer=new MutationObserver(update);
  for(const el of [...modes,document.body,document.getElementById('fav-current')].filter(Boolean))observer.observe(el,{attributes:true,attributeFilter:['class']});
  document.getElementById('theme-btn')?.addEventListener('click',()=>{
   document.documentElement.classList.add('qb-theme-swap');
   requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.remove('qb-theme-swap')));
  },true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
