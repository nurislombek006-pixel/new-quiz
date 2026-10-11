# QuizBot on Cloudflare (Astor account)

Test worker: https://quizbot-astor-migration.astor2035.workers.dev/
D1: quizbot-astor-data (database_id cea9f28b-1c64-417b-a19f-cc7868f7e3fc)

## Preserved
- Original public/ UI, all CSS/JS, Telegram owner-only embedded admin, quick Premium/ban actions, question forms, test modes.
- Original /api/* endpoints and Telegram Ed25519 signed ownership checks.
- Data keys access_state, tests_data, tests_meta, report_settings, and QuizBot-only user activity.
- Complete migration tool in the new admin's “Ещё” tab. Server-side D1 adapter chunks large question banks.

## Before switching Telegram users
1. Do not delete the Netlify site or Netlify Blobs.
2. Open the test worker directly and verify that the public QuizBot UI renders.
3. In @BotFather, temporarily switch the *QuizBot Mini App* menu URL to the new workers.dev URL. The Telegram bot identity stays the same. (Use the official BotFather or bot configuration flow; no bot tokens are needed in the repository.)
4. As the real Telegram owner, open the new Mini App → Админка → Ещё → Перенос данных из Netlify. Confirm displayed old counts, then click transfer. This uses signed Telegram initData to export from the old site's admin API; it does NOT write anything to the old site. New D1 import is count-checked. Avoid adding questions to the new DB before migration.
5. Compare counts of questions/Premium/bans and test Premium with a non-owner before releasing the new link broadly.
6. Set a new report bot token and recipient chat ID in secure new admin settings. The prior report token is not provided by Netlify's normal export.
7. Only retire Netlify after validating QuizBot features, admin panel, reports, and data in the new environment.

## Redeploy with Wrangler
Using a compatible Node environment:
```sh
npx wrangler deploy
```
D1 is configured by wrangler.json. Secret values must be configured with `wrangler secret put APP_BOT_TOKEN` or the Cloudflare dashboard if the Telegram client lacks Ed25519 signatures. Never commit bot tokens. The owner-only admin auth also verifies Telegram's public signature tied to the configured Mini App bot ID. To deploy via Wrangler, cloudflare/assets.mjs embeds the static files for parity; when public/ changes, rebuild the asset module first.

## Limitations
- Existing user activity from earlier deployments can only be transferred if the old production site exposes /api/admin/users.
- Full Netlify export requires the old production owner's authenticated Telegram session; it cannot be copied from an empty GitHub fork.
- Reference site testappsharipboyev.web.app was not copied. Its private backend or database is not available.
- D1 free-tier quotas and limits apply; “free” does not mean unlimited.
