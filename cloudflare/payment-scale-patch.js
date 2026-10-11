function applyPaymentScalePatch(html,live=false){
 if(typeof html!=='string')throw Error('HTML is not text');
 const payMarkup="<!-- ═══════════════ PAYWALL (активация администратором) ═══════════════ -->\n<div id=\"paywall\" class=\"paywall hidden\">\n  <div class=\"paybox\">\n    <button id=\"pay-close-btn\" class=\"pay-close\" type=\"button\" onclick=\"hidePaywall()\" aria-label=\"Закрыть\">×</button>\n    <div id=\"pay-icon\" class=\"pay-icon\">💎</div>\n    <div id=\"pay-title\" class=\"pay-title\">Премиум-доступ</div>\n    <p id=\"pay-sub\" class=\"pay-sub\">Тесты без ограничений</p>\n    <div class=\"pay-card pay-card-payment\">\n      <div class=\"pay-price-box\">\n        <div class=\"pay-price-title\">Стоимость подписки</div>\n        <div class=\"pay-price\">30 000 сум</div>\n      </div>\n      <div class=\"pay-label\">Номер карты</div>\n      <div class=\"pay-card-number-row\">\n        <div id=\"pay-card-number\" class=\"pay-card-number\">5614 6805 7717 0398</div>\n        <button type=\"button\" class=\"copy copy-card\" onclick=\"copyCardNumber()\" aria-label=\"Скопировать номер карты\">📋</button>\n      </div>\n      <button type=\"button\" class=\"btn btn-primary btn-full\" onclick=\"copySubscriptionData()\" style=\"margin-top:9px\">📋 Скопировать данные</button>\n      <a class=\"btn btn-green btn-full\" href=\"https://t.me/nurislombekm\" target=\"_blank\" rel=\"noopener\" style=\"text-decoration:none;margin-top:8px\">💬 Отправить чек</a>\n    </div>\n    <div class=\"pay-steps\"><span>Оплата</span><span class=\"pay-step-dot\"></span><span>Чек</span><span class=\"pay-step-dot\"></span><span>Активация</span></div>\n    <details class=\"pay-extra-details\" id=\"pay-extra-details\">\n      <summary>Мои данные для активации</summary>\n      <div class=\"pay-extra-details-content\">\n        <div class=\"pay-card\">\n          <div class=\"pay-label\">Telegram ID</div>\n          <div class=\"row\"><div id=\"pay-user-id\" class=\"pay-value\" style=\"flex:1\">Определяется...</div><button type=\"button\" class=\"copy\" onclick=\"copyUserId()\" aria-label=\"Скопировать Telegram ID\">📋</button></div>\n        </div>\n        <div class=\"pay-card\">\n          <div class=\"pay-label\">ID устройства</div>\n          <div class=\"row\"><div id=\"pay-device-id\" class=\"pay-value\" style=\"flex:1\">Определяется...</div><button type=\"button\" class=\"copy\" onclick=\"copyDeviceId()\" aria-label=\"Скопировать ID устройства\">📋</button></div>\n        </div>\n      </div>\n    </details>\n    <div id=\"pay-error\" class=\"pay-error\"></div>\n    <div id=\"pay-success-msg\" class=\"pay-success hidden\"></div>\n    <div id=\"pay-danger-note\" class=\"danger-note\"></div>\n  </div>\n</div>\n";
 const zoomMarkup="<div class=\"setting-card scale-setting\" id=\"ui-scale-setting\">\n        <div class=\"ui-scale-header\">\n          <label class=\"ui-scale-title\" for=\"ui-scale-slider\">🔍 Масштаб интерфейса</label>\n          <output class=\"ui-scale-value\" id=\"ui-scale-value\" for=\"ui-scale-slider\">100%</output>\n        </div>\n        <div class=\"ui-scale-row\">\n          <button type=\"button\" class=\"ui-scale-adjust\" id=\"ui-scale-minus\" aria-label=\"Уменьшить масштаб\">−</button>\n          <input type=\"range\" class=\"ui-scale-slider\" id=\"ui-scale-slider\" min=\"60\" max=\"180\" step=\"5\" value=\"100\" aria-label=\"Масштаб интерфейса от 60 до 180 процентов\">\n          <button type=\"button\" class=\"ui-scale-adjust\" id=\"ui-scale-plus\" aria-label=\"Увеличить масштаб\">+</button>\n        </div>\n        <div class=\"ui-scale-bottom\"><span>60%</span><button type=\"button\" class=\"ui-scale-reset\" id=\"ui-scale-reset\">Сбросить 100%</button><span>180%</span></div>\n      </div>";
 const single=(source,from,to,label)=>{
   const i=source.indexOf(from);
   if(i<0||source.indexOf(from,i+1)>=0)throw Error('Patch mismatch: '+label);
   return source.slice(0,i)+to+source.slice(i+from.length);
 };
 const start=html.indexOf('<!-- ═══════════════ PAYWALL');
 const end=html.indexOf('\n<div class="app">',start);
 if(start<0||end<0||html.indexOf('<!-- ═══════════════ PAYWALL',start+10)>=0)throw Error('Unknown paywall structure');
 const previousPay=html.slice(start,end);
 if(!previousPay.includes('pay-danger-note')||!previousPay.includes('pay-card-number'))throw Error('Missing original payment controls');
 html=html.slice(0,start)+payMarkup+html.slice(end);
 html=single(html,
 '</div>\n\n      <div class="mini-note compact-total">',
 '</div>\n\n      '+zoomMarkup+'\n\n      <div class="mini-note compact-total">',
 'settings scale slot');
 html=single(html,
 "function openActivationPanel(){showPaywall('Для активации оплатите 30 000 сум на карту 5614 6805 7717 0398, затем отправьте чек, Telegram ID и ID устройства @nurislombekm.');}",
 "function openActivationPanel(){showPaywall();}",
 'activation entry');
 html=single(html,
 "const sub=document.getElementById('pay-sub');if(sub)sub.textContent='Чтобы получить доступ к тестам без ограничений, оплатите подписку и отправьте данные администратору.';",
 "const sub=document.getElementById('pay-sub');if(sub)sub.textContent='Тесты без ограничений';",
 'normal payment subtitle');
 html=single(html,
 "const note=document.getElementById('pay-danger-note');if(note)note.textContent='Доступ активируется вручную после проверки оплаты. Когда администратор подтвердит оплату, обновите сайт — статус станет «Премиум пользователь».';",
 "const note=document.getElementById('pay-danger-note');if(note)note.textContent='';",
 'remove verbose note');
 html=single(html,
 "const e=document.getElementById('pay-error');if(e)e.style.color='';\n}",
 "const e=document.getElementById('pay-error');if(e){e.style.color='';e.textContent='';}\n}",
 'clear prior pay error');
 html=single(html,
 "const deviceCard=document.getElementById('pay-device-id')?.closest?.('.pay-card');",
 "const paymentCard=document.querySelector('#paywall .pay-card-payment');",
 'blocked user card location');
 html=single(html,
 "if(deviceCard)deviceCard.insertAdjacentElement('afterend',card);",
 "if(paymentCard)paymentCard.insertAdjacentElement('afterend',card);",
 'blocked user card insertion');
 html=single(html,
 "if(showMsg)showPaywall('Подписка не найдена для ID '+id+'. Оплатите 30 000 сум на карту 5614 6805 7717 0398 и отправьте чек @nurislombekm.');",
 "if(showMsg)showPaywall('Подписка пока не активна.');",
 'short status notice');
 html=single(html,
 '<link rel="stylesheet" href="./drawer-v2.css?v=1"/>',
 '<link rel="stylesheet" href="./drawer-v2.css?v=1"/>\n<link rel="stylesheet" href="./ui-controls.css?v=1"/>',
 'CSS link');
 const inject='<script src="./ui-scale.js?v=1" defer></script>';
 const scriptBefore=live?'<script src="./session-improve.js?v=2" defer></script>':'<script src="./activity-tracker.js?v=1" defer></script>';
 html=single(html,scriptBefore,scriptBefore+'\n'+inject,'JS loader');
 if(!html.includes('id="ui-scale-slider"')||!html.includes('id="pay-extra-details"')||html.includes('Для активации оплатите 30 000'))throw Error('Post-patch HTML verification failed');
 return html;
}
