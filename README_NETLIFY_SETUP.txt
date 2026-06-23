QuizBot Netlify version

Что это:
- public/ = сайт и админка
- netlify/functions/api.mjs = backend
- Netlify Blobs = хранение premium/ban/device/questions

Как деплоить:
1) Создай новый GitHub репозиторий.
2) Загрузи ВСЕ файлы из этой папки в корень репозитория.
3) Netlify → Add new site → Import from Git → выбери репозиторий.
4) Build command можно оставить пустым или npm install. Publish directory: public. Functions directory: netlify/functions.
5) В Netlify → Site configuration → Environment variables добавь:
   APP_BOT_TOKEN = токен бота, через который открывается Mini App
   BOT_TOKEN = токен бота для отчетов
   CHAT_ID = куда приходят отчеты
   ADMIN_SECRET = твой пароль
   ALLOW_UNTRUSTED_ACCESS = 1
   REQUIRE_REPORT_AUTH = 0
6) Redeploy site.
7) Админка: https://твоя-ссылка.netlify.app/admin
8) Сайт для BotFather: https://твоя-ссылка.netlify.app/

Важно:
- Cloudflare больше не нужен.
- В GitHub токены не загружай.
- В админке Backend URL можно оставить как ссылка Netlify сайта, например https://xxx.netlify.app
