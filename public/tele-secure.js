// tele-secure.js
// Отчёты отправляются через Cloudflare Worker.
// Telegram bot token и chat ID НЕ должны храниться в этом файле.

(function () {
  "use strict";

  function safe(value) {
    return String(value ?? "")
      .replace(/[<>&]/g, "")
      .trim();
  }

  function getEnv() {
    return window.__APP_ENV || {};
  }

  function apiUrl(path) {
    const env = getEnv();
    const base = String(env.BACKEND_URL || env.REPORT_PROXY_URL || '').replace(/\/+$/, '');
    if (/^https?:\/\//i.test(path)) return path;
    return base ? base + '/' + String(path || '').replace(/^\/+/,'') : path;
  }

  function telegramInitData() {
    try { return window.Telegram?.WebApp?.initData || ''; } catch (e) { return ''; }
  }

  async function sendReport(text) {
    const env = getEnv();

    const reportUrl = env.REPORT_URL || apiUrl('/api/report');
    if (!reportUrl) {
      console.warn("BACKEND_URL не указан в env.js");
      return false;
    }

    try {
      const res = await fetch(reportUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: String(text || "").slice(0, 3900),
          initData: telegramInitData()
        })
      });

      if (!res.ok) {
        console.warn("Report proxy error:", res.status, await res.text());
        return false;
      }

      return true;
    } catch (e) {
      console.warn("Report send failed:", e);
      return false;
    }
  }

  function getTgUser() {
    try {
      return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
    } catch (e) {
      return null;
    }
  }

  function getRealTelegramId(userId) {
    const tgUser = getTgUser();
    const id = String(userId || tgUser?.id || "").replace(/\D+/g, "");
    return id || "";
  }

  function nowText() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");

    return (
      p(d.getDate()) +
      "." +
      p(d.getMonth() + 1) +
      "." +
      d.getFullYear() +
      ", " +
      p(d.getHours()) +
      ":" +
      p(d.getMinutes()) +
      ":" +
      p(d.getSeconds())
    );
  }

  function getUserInfo(userProfile, userId, meta) {
    const tgUser = getTgUser() || {};

    const firstName = meta?.firstName || tgUser.first_name || "";
    const lastName = meta?.lastName || tgUser.last_name || "";

    let name = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (!name && userProfile) {
      name = String(userProfile)
        .replace(/\s*\(@[^)]*\)\s*/g, "")
        .trim();
    }

    if (!name) name = "Гость";

    const usernameRaw = meta?.telegramUsername || tgUser.username || "";
    const username = usernameRaw
      ? "@" + String(usernameRaw).replace(/^@/, "")
      : "-";

    const id = getRealTelegramId(userId) || "-";

    return {
      name,
      username,
      id
    };
  }

  function getOSInfo() {
    const ua = navigator.userAgent || "";
    let os = "Неизвестно";
    let version = "";

    const ios =
      ua.match(/(?:CPU iPhone OS|CPU OS|iPhone OS|OS)\s+([0-9_]+(?:_[0-9_]+)?)/i) ||
      ua.match(/Version\/([0-9.]+)/i);

    const android = ua.match(/Android\s+([0-9.]+)/i);
    const windows = ua.match(/Windows NT\s+([0-9.]+)/i);
    const mac = ua.match(/Mac OS X\s+([0-9_]+)/i);

    if (/iPhone|iPad|iPod/i.test(ua)) {
      os = "iOS";
      if (ios) version = ios[1].replace(/_/g, ".");
    } else if (/Android/i.test(ua)) {
      os = "Android";
      if (android) version = android[1];
    } else if (/Windows/i.test(ua)) {
      os = "Windows";
      if (windows) version = windows[1];
    } else if (/Mac OS X/i.test(ua)) {
      os = "macOS";
      if (mac) version = mac[1].replace(/_/g, ".");
    } else if (/Linux/i.test(ua)) {
      os = "Linux";
    }

    return version ? `${os} ${version}` : os;
  }

  function getDeviceInfo() {
    let timezone = "Неизвестно";

    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Неизвестно";
    } catch (e) {}

    return {
      os: getOSInfo(),
      screen: `${window.screen?.width || "-"}x${window.screen?.height || "-"}`,
      language: (navigator.language || "Неизвестно").split("-")[0],
      timezone
    };
  }

  async function makeFingerprint() {
    try {
      if (typeof window.getDeviceFingerprint === "function") {
        return String(window.getDeviceFingerprint() || "UNKNOWN").toUpperCase();
      }

      const raw = [
        navigator.userAgent || "",
        navigator.language || "",
        screen.width || "",
        screen.height || "",
        screen.colorDepth || "",
        Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      ].join("|");

      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(raw)
      );

      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 10)
        .toUpperCase();
    } catch (e) {
      return "UNKNOWN";
    }
  }

  function detectStatus(meta) {
    if (meta?.isBlocked) return "🚫 Заблокированный пользователь";
    if (meta?.isPremium) return "Премиум пользователь";

    try {
      const badge = document.getElementById("premium-badge");
      const text = badge?.textContent || "";

      if (/заблок/i.test(text)) return "🚫 Заблокированный пользователь";
      if (/премиум/i.test(text)) return "Премиум пользователь";
    } catch (e) {}

    return "Обычный пользователь";
  }

  async function baseInfo(userProfile, userId, meta) {
    const user = getUserInfo(userProfile, userId, meta || {});
    const device = getDeviceInfo();
    const fingerprint = await makeFingerprint();

    return {
      user,
      device,
      fingerprint
    };
  }

  window.sendVisitNotification = async function (userProfile, userId, meta) {
    const tgUser = getTgUser();
    const realId = getRealTelegramId(userId);

    if (!tgUser || !realId) return;

    if (window.__ecoVisitReportSent) return;
    window.__ecoVisitReportSent = true;

    const data = await baseInfo(userProfile, realId, meta || {});
    const status = detectStatus(meta || {});

    const text =
`👁️ ВХОД НА САЙТ

📅 Дата/время: ${nowText()}
👤 Пользователь: ${safe(data.user.name)}
🔗 Username: ${safe(data.user.username)}
🆔 Telegram ID: ${safe(data.user.id)}
⭐ Статус: ${safe(status)}

📱 ОС: ${safe(data.device.os)}
🖥️ Экран: ${safe(data.device.screen)}
🌐 Язык: ${safe(data.device.language)}
📍 Часовой пояс: ${safe(data.device.timezone)}
🔑 Fingerprint: ${safe(data.fingerprint)}`;

    await sendReport(text);
  };

  window.sendSecureReport = async function (
    userProfile,
    correct,
    total,
    userId,
    meta
  ) {
    const tgUser = getTgUser();
    const realId = getRealTelegramId(userId);

    if (!tgUser || !realId) return;

    const data = await baseInfo(userProfile, realId, meta || {});
    const status = detectStatus(meta || {});

    const percent =
      total > 0 ? Math.round((Number(correct || 0) / Number(total || 1)) * 100) : 0;

    const subject = meta?.subject || "Тест";
    const mode = meta?.mode || "Обычный тест";
    const range = meta?.range || "-";
    const order = meta?.order || "-";

    const text =
`✅ ТЕСТ ЗАВЕРШЁН

📅 Дата/время: ${nowText()}
👤 Пользователь: ${safe(data.user.name)}
🔗 Username: ${safe(data.user.username)}
🆔 Telegram ID: ${safe(data.user.id)}
⭐ Статус: ${safe(status)}

📚 Предмет: ${safe(subject)}
🧩 Режим: ${safe(mode)}
🔢 Диапазон: ${safe(range)}
🔀 Порядок: ${safe(order)}

📊 Результат: ${correct}/${total}
📈 Процент: ${percent}%

📱 ОС: ${safe(data.device.os)}
🖥️ Экран: ${safe(data.device.screen)}
🌐 Язык: ${safe(data.device.language)}
📍 Часовой пояс: ${safe(data.device.timezone)}
🔑 Fingerprint: ${safe(data.fingerprint)}`;

    await sendReport(text);
  };

  window.sendDeviceControlReport = async function (userProfile, userId, meta) {
    const tgUser = getTgUser();
    const realId = getRealTelegramId(userId);

    if (!tgUser || !realId) return;

    const data = await baseInfo(userProfile, realId, meta || {});
    const status = detectStatus(meta || {});

    const text =
`⚠️ КОНТРОЛЬ УСТРОЙСТВА

📅 Дата/время: ${nowText()}
👤 Пользователь: ${safe(data.user.name)}
🔗 Username: ${safe(data.user.username)}
🆔 Telegram ID: ${safe(data.user.id)}
⭐ Статус: ${safe(status)}

📌 Событие: ${safe(meta?.status || "Подозрительная активность")}
📝 Причина: ${safe(meta?.reason || "-")}

📱 ОС: ${safe(data.device.os)}
🖥️ Экран: ${safe(data.device.screen)}
🌐 Язык: ${safe(data.device.language)}
📍 Часовой пояс: ${safe(data.device.timezone)}
🔑 Fingerprint: ${safe(data.fingerprint)}`;

    await sendReport(text);
  };

  window.sendReportToTelegram = sendReport;
})();
