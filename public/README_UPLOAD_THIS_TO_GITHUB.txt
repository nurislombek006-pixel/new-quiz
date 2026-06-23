Загружай в GitHub Pages именно эти файлы.

Важно:
- env.js уже настроен на https://quizbot-backend.application-site.workers.dev
- в GitHub не загружай tests.json, premium_users.json, banned_users.json, device_locks.json, worker.js, activate.py
- после загрузки открой сайт через Telegram Mini App, потому что в обычном браузере нет Telegram ID.

Проверка в консоли сайта:
fetch(window.__APP_ENV.BACKEND_URL.replace(/\/+$/, "") + "/api/access", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({telegram_id:"32341234124", fingerprint:"TEST"})}).then(async r=>console.log(r.status, await r.text()))
