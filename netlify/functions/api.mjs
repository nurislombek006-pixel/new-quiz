import { getStore } from "@netlify/blobs";

const STORE_NAME = "quizbot-data";

const ACCESS_KEY = "access_state";
const TESTS_KEY = "tests_data";
const TESTS_META_KEY = "tests_meta";
const REPORT_SETTINGS_KEY = "report_settings";

const EMPTY_TESTS = {
  data_version: "empty",
  subjects: {
    macro: {
      title: "Маркетинг",
      short: "Маркетинг",
      emoji: "📚",
      tests: []
    }
  }
};

const DEFAULT_ACCESS_STATE = {
  version: 2,
  updated_at: new Date().toISOString(),
  premium_users: { users: {} },
  banned_users: { users: {} },
  device_locks: { users: {} }
};

function getKV() {
  const store = getStore(STORE_NAME);
  return {
    async get(key, opts) {
      const type = typeof opts === "string" ? opts : opts?.type;
      if (type === "json") return await store.get(key, { type: "json" });
      return await store.get(key);
    },
    async put(key, value) {
      if (typeof value === "string") await store.set(key, value);
      else await store.set(key, JSON.stringify(value));
    },
    async delete(key) {
      if (store.delete) await store.delete(key);
    }
  };
}

function env() {
  return {
    ...process.env,
    APP_KV: getKV()
  };
}

function cleanId(v) {
  return String(v || "").replace(/\D+/g, "");
}

function cleanFp(v) {
  return String(v || "").trim().toUpperCase();
}

function safeText(v) {
  return String(v ?? "").replace(/[<>&]/g, "").slice(0, 3900);
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Telegram-Init-Data,X-Admin-Secret",
    "Vary": "Origin"
  };
}

function jsonResponse(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
}

function normalizeUsersBox(data) {
  if (!data || typeof data !== "object") return { users: {} };
  if (!data.users || typeof data.users !== "object" || Array.isArray(data.users)) {
    data.users = {};
  }
  return data;
}

function normalizeAccessState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    version: 2,
    updated_at: s.updated_at || new Date().toISOString(),
    premium_users: normalizeUsersBox(s.premium_users || s.premium || { users: {} }),
    banned_users: normalizeUsersBox(s.banned_users || s.banned || { users: {} }),
    device_locks: normalizeUsersBox(s.device_locks || s.devices || { users: {} })
  };
}

async function getAccessState(e) {
  const raw = await e.APP_KV.get(ACCESS_KEY, { type: "json" }).catch(() => null);
  return normalizeAccessState(raw || DEFAULT_ACCESS_STATE);
}

async function saveAccessState(e, state) {
  const s = normalizeAccessState(state);
  s.updated_at = new Date().toISOString();
  await e.APP_KV.put(ACCESS_KEY, s);
  return s;
}

function isExpired(dateStr) {
  if (!dateStr) return false;
  const end = new Date(String(dateStr) + "T23:59:59Z").getTime();
  if (!Number.isFinite(end)) return false;
  return Date.now() > end;
}

function countState(state) {
  return {
    premium: Object.keys(normalizeUsersBox(state.premium_users).users).length,
    banned: Object.keys(normalizeUsersBox(state.banned_users).users).length,
    devices: Object.keys(normalizeUsersBox(state.device_locks).users).length
  };
}

async function evaluateAccess(e, userId, fingerprint = "") {
  const id = cleanId(userId);
  const fp = cleanFp(fingerprint);

  if (!id) {
    return {
      isPremium: false,
      isBlocked: false,
      blockReason: "",
      blockType: "",
      until: "",
      deviceBlocked: false,
      deviceReason: ""
    };
  }

  const state = await getAccessState(e);

  const premium = normalizeUsersBox(state.premium_users).users[id];
  const ban = normalizeUsersBox(state.banned_users).users[id];
  const device = normalizeUsersBox(state.device_locks).users[id];

  let isBlocked = false;
  let blockReason = "";
  let blockType = "";
  let until = "";

  if (ban && ban.active !== false && !isExpired(ban.until)) {
    isBlocked = true;
    blockReason = ban.reason || "Доступ заблокирован.";
    blockType = ban.type || "permanent";
    until = ban.until || "";
  }

  let deviceBlocked = false;
  let deviceReason = "";

  if (device && device.active !== false && device.fingerprint) {
    const needFp = cleanFp(device.fingerprint);
    if (fp && needFp && fp !== needFp) {
      deviceBlocked = true;
      deviceReason = device.reason || "Устройство не совпадает.";
    }
  }

  let isPremium = false;

  if (!isBlocked && premium && premium.active !== false && !isExpired(premium.expires)) {
    if (premium.fingerprint) {
      isPremium = fp && cleanFp(premium.fingerprint) === fp;
    } else {
      isPremium = true;
    }
  }

  return {
    isPremium,
    isBlocked,
    blockReason,
    blockType,
    until,
    deviceBlocked,
    deviceReason
  };
}

function normalizeTestsData(raw) {
  if (Array.isArray(raw)) {
    return {
      data_version: "imported-array",
      subjects: {
        macro: {
          title: "Маркетинг",
          short: "Маркетинг",
          emoji: "📚",
          tests: raw
        }
      }
    };
  }

  if (raw && typeof raw === "object") {
    if (raw.subjects && typeof raw.subjects === "object") return raw;

    if (Array.isArray(raw.tests)) {
      return {
        data_version: raw.data_version || "imported-tests",
        subjects: {
          macro: {
            title: raw.title || "Маркетинг",
            short: raw.short || raw.title || "Маркетинг",
            emoji: raw.emoji || "📚",
            tests: raw.tests
          }
        }
      };
    }

    if (raw.data && raw.data.subjects) return raw.data;
  }

  return EMPTY_TESTS;
}

async function getTestsData(e) {
  const raw = await e.APP_KV.get(TESTS_KEY, { type: "json" }).catch(() => null);
  return normalizeTestsData(raw || EMPTY_TESTS);
}

function countTestsData(data) {
  data = normalizeTestsData(data);

  const per_subject = {};
  let total = 0;

  for (const [key, sub] of Object.entries(data.subjects || {})) {
    const n = Array.isArray(sub.tests) ? sub.tests.length : 0;
    per_subject[key] = n;
    total += n;
  }

  const firstKey = data.subjects?.macro ? "macro" : Object.keys(data.subjects || {})[0] || "macro";
  const sub = data.subjects?.[firstKey] || {};

  return {
    total,
    per_subject,
    data_version: data.data_version || "",
    subject_key: firstKey,
    subject_title: sub.title || "Маркетинг",
    subject_short: sub.short || sub.title || "Маркетинг",
    subject_emoji: sub.emoji || "📚"
  };
}

async function saveTestsData(e, data) {
  const normalized = normalizeTestsData(data);
  const meta = {
    updated: new Date().toISOString(),
    ...countTestsData(normalized)
  };

  await e.APP_KV.put(TESTS_KEY, normalized);
  await e.APP_KV.put(TESTS_META_KEY, meta);

  return { data: normalized, meta };
}

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К"];

function shuffleArray(arr) {
  const a = Array.isArray(arr) ? [...arr] : [];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function shuffleQuestionOptions(q) {
  const options = Array.isArray(q?.options) ? q.options : [];
  let oldAnswer = Number(q?.answer);

  if (!Number.isFinite(oldAnswer)) {
    const answerText = String(q?.answerText || "").trim();
    oldAnswer = Math.max(0, options.findIndex(x => String(x).trim() === answerText));
  }

  if (oldAnswer < 0) oldAnswer = 0;

  if (options.length < 2) {
    return {
      ...q,
      options: [...options],
      answer: oldAnswer,
      answerLetter: LETTERS[oldAnswer] || String(oldAnswer + 1),
      answerText: options[oldAnswer] || q.answerText || ""
    };
  }

  const mixed = shuffleArray(
    options.map((text, index) => ({
      text,
      index
    }))
  );

  const newAnswer = mixed.findIndex(x => x.index === oldAnswer);

  return {
    ...q,
    options: mixed.map(x => x.text),
    answer: newAnswer >= 0 ? newAnswer : oldAnswer,
    answerLetter: LETTERS[newAnswer] || String(newAnswer + 1),
    answerText: options[oldAnswer] || q.answerText || "",
    optionsRandomized: true
  };
}

function shuffleTestsForClient(data) {
  const out = JSON.parse(JSON.stringify(normalizeTestsData(data)));

  for (const key of Object.keys(out.subjects || {})) {
    const sub = out.subjects[key];

    if (Array.isArray(sub.tests)) {
      sub.tests = sub.tests.map(shuffleQuestionOptions);
    }
  }

  out.options_randomized = true;
  out.options_randomized_at = Date.now();

  return out;
}

function adminSecretOk(request, e) {
  const url = new URL(request.url);
  const provided = request.headers.get("X-Admin-Secret") || url.searchParams.get("key") || "";
  const expected = e.ADMIN_SECRET || e.ADMIN_KEY || "";

  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: "ADMIN_SECRET не задан в Netlify Environment variables"
    };
  }

  if (String(provided) !== String(expected)) {
    return {
      ok: false,
      status: 403,
      error: "Неверный ADMIN_SECRET"
    };
  }

  return { ok: true };
}

function normalizeUserIdFromBody(body) {
  return cleanId(body.user_id || body.uid || body.id || body.telegram_id);
}

function addDaysIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function maskToken(token) {
  const t = String(token || "").trim();
  if (!t) return "";
  if (t.length <= 12) return "***";
  return t.slice(0, 6) + "..." + t.slice(-6);
}

async function getReportSettings(e) {
  const data = await e.APP_KV.get(REPORT_SETTINGS_KEY, { type: "json" }).catch(() => null);

  if (!data || typeof data !== "object") {
    return {
      bot_token: "",
      chat_id: ""
    };
  }

  return {
    bot_token: String(data.bot_token || data.token || data.report_bot_token || "").trim(),
    chat_id: String(data.chat_id || data.user_id || data.owner_id || "").trim(),
    updated: data.updated || ""
  };
}

async function saveReportSettings(e, settings) {
  const current = await getReportSettings(e);

  const saved = {
    bot_token: String(settings.bot_token || settings.token || settings.report_bot_token || "").trim() || current.bot_token,
    chat_id: String(settings.chat_id || settings.user_id || settings.owner_id || "").trim() || current.chat_id,
    updated: new Date().toISOString()
  };

  await e.APP_KV.put(REPORT_SETTINGS_KEY, saved);

  return saved;
}

function getReportBotToken(e) {
  return e.REPORT_BOT_TOKEN || e.REPORT_TELEGRAM_BOT_TOKEN || e.BOT_TOKEN || "";
}

function getAppBotToken(e) {
  return e.APP_BOT_TOKEN || e.WEBAPP_BOT_TOKEN || e.QUIZBOT_TOKEN || e.BOT_TOKEN || "";
}

function allowUntrustedAccess(e) {
  return String(e.ALLOW_UNTRUSTED_ACCESS || "").trim() === "1";
}

async function sendTelegram(e, text) {
  const settings = await getReportSettings(e);

  const token = settings.bot_token || getReportBotToken(e);
  const chatId = settings.chat_id || e.CHAT_ID || e.OWNER_CHAT_ID || e.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      ok: false,
      error: "Токен бота или Telegram ID для отчётов не задан. Укажи их в админке → Отчёты."
    };
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: safeText(text),
      disable_web_page_preview: true
    })
  });

  return await r.json().catch(() => ({
    ok: false,
    status: r.status
  }));
}

function textEncoder() {
  return new TextEncoder();
}

function hex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSign(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  return crypto.subtle.sign("HMAC", key, textEncoder().encode(data));
}

async function verifyTelegramInitData(initData, botToken) {
  try {
    if (!initData || !botToken) return null;

    const params = new URLSearchParams(initData);
    const givenHash = params.get("hash") || "";

    if (!givenHash) return null;

    params.delete("hash");

    const checkString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = await hmacSign(textEncoder().encode("WebAppData"), botToken);
    const calcHash = hex(await hmacSign(secretKey, checkString));

    if (calcHash !== givenHash) return null;

    const userRaw = params.get("user");
    return userRaw ? JSON.parse(userRaw) : {};
  } catch {
    return null;
  }
}

async function handleAdmin(request, e, path) {
  const auth = adminSecretOk(request, e);

  if (!auth.ok) {
    return jsonResponse(request, {
      ok: false,
      error: auth.error
    }, auth.status);
  }

  const url = new URL(request.url);
  const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));

  if (path === "/api/admin/debug-auth") {
    return jsonResponse(request, {
      ok: true,
      has_APP_BOT_TOKEN: !!e.APP_BOT_TOKEN,
      has_BOT_TOKEN: !!e.BOT_TOKEN,
      has_REPORT_BOT_TOKEN: !!e.REPORT_BOT_TOKEN,
      using_app_token_from: e.APP_BOT_TOKEN ? "APP_BOT_TOKEN" : e.BOT_TOKEN ? "BOT_TOKEN" : "NONE",
      using_report_token_from: e.REPORT_BOT_TOKEN ? "REPORT_BOT_TOKEN" : e.BOT_TOKEN ? "BOT_TOKEN" : "NONE",
      allow_untrusted_access: allowUntrustedAccess(e)
    });
  }

  if (path === "/api/admin/init") {
    const state = await getAccessState(e);
    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      message: "Storage готов",
      counts: countState(state)
    });
  }

  if (path === "/api/admin/export" && request.method === "GET") {
    const state = await getAccessState(e);

    return jsonResponse(request, {
      ok: true,
      access_state: state,
      ...state
    });
  }

  if (path === "/api/admin/import" && request.method === "POST") {
    const state = await saveAccessState(e, body.access_state || body);

    return jsonResponse(request, {
      ok: true,
      action: "imported",
      counts: countState(state),
      access_state: state
    });
  }

  if (path === "/api/admin/list" && request.method === "GET") {
    const type = String(url.searchParams.get("type") || "all").toLowerCase();
    const state = await getAccessState(e);

    if (type === "premium") {
      return jsonResponse(request, {
        ok: true,
        type,
        data: state.premium_users
      });
    }

    if (type === "banned" || type === "ban") {
      return jsonResponse(request, {
        ok: true,
        type: "banned",
        data: state.banned_users
      });
    }

    if (type === "devices" || type === "device" || type === "device_locks") {
      return jsonResponse(request, {
        ok: true,
        type: "device_locks",
        data: state.device_locks
      });
    }

    return jsonResponse(request, {
      ok: true,
      ...state,
      counts: countState(state)
    });
  }

  if (path === "/api/admin/premium" && request.method === "POST") {
    const id = normalizeUserIdFromBody(body);

    if (!id) {
      return jsonResponse(request, {
        ok: false,
        error: "user_id обязателен"
      }, 400);
    }

    const state = await getAccessState(e);
    const rec = {
      active: body.active !== false,
      uid: id,
      user_id: id,
      created: new Date().toISOString(),
      note: body.note || "Выдано через админку"
    };

    if (body.expires) rec.expires = String(body.expires);
    else if (body.days && Number(body.days) > 0) rec.expires = addDaysIso(Number(body.days));

    if (body.fingerprint || body.fp || body.device) {
      rec.fingerprint = cleanFp(body.fingerprint || body.fp || body.device);
    }

    state.premium_users = normalizeUsersBox(state.premium_users);
    state.premium_users.users[id] = rec;

    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      action: "premium_set",
      user_id: id,
      record: rec
    });
  }

  if (path === "/api/admin/premium/clear" && request.method === "POST") {
    if (String(body.confirm || "").trim() !== "CLEAR_PREMIUM") {
      return jsonResponse(request, {
        ok: false,
        error: "Для очистки всех премиумов передай confirm: CLEAR_PREMIUM"
      }, 400);
    }

    const state = await getAccessState(e);
    state.premium_users = { users: {} };

    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      action: "premium_cleared",
      counts: countState(state)
    });
  }

  if ((path === "/api/admin/premium/remove" || path === "/api/admin/premium/delete") && request.method === "POST") {
    const id = normalizeUserIdFromBody(body);

    if (!id) {
      return jsonResponse(request, {
        ok: false,
        error: "user_id обязателен"
      }, 400);
    }

    const state = await getAccessState(e);
    state.premium_users = normalizeUsersBox(state.premium_users);
    delete state.premium_users.users[id];

    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      action: "premium_removed",
      user_id: id
    });
  }

  if (path === "/api/admin/ban" && request.method === "POST") {
    const id = normalizeUserIdFromBody(body);

    if (!id) {
      return jsonResponse(request, {
        ok: false,
        error: "user_id обязателен"
      }, 400);
    }

    const state = await getAccessState(e);

    const rec = {
      active: body.active !== false,
      uid: id,
      user_id: id,
      created: new Date().toISOString(),
      type: body.type || "permanent",
      reason: body.reason || "Доступ заблокирован."
    };

    if (body.until) rec.until = String(body.until);

    state.banned_users = normalizeUsersBox(state.banned_users);
    state.banned_users.users[id] = rec;

    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      action: "banned",
      user_id: id,
      record: rec
    });
  }

  if (path === "/api/admin/unban" && request.method === "POST") {
    const id = normalizeUserIdFromBody(body);

    if (!id) {
      return jsonResponse(request, {
        ok: false,
        error: "user_id обязателен"
      }, 400);
    }

    const state = await getAccessState(e);
    state.banned_users = normalizeUsersBox(state.banned_users);
    delete state.banned_users.users[id];

    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      action: "unbanned",
      user_id: id
    });
  }

  if (path === "/api/admin/device" && request.method === "POST") {
    const id = normalizeUserIdFromBody(body);
    const fp = cleanFp(body.fingerprint || body.fp || body.device);

    if (!id) {
      return jsonResponse(request, {
        ok: false,
        error: "user_id обязателен"
      }, 400);
    }

    if (!fp) {
      return jsonResponse(request, {
        ok: false,
        error: "fingerprint обязателен"
      }, 400);
    }

    const state = await getAccessState(e);

    const rec = {
      active: body.active !== false,
      uid: id,
      user_id: id,
      fingerprint: fp,
      created: new Date().toISOString(),
      reason: body.reason || "Устройство привязано вручную"
    };

    state.device_locks = normalizeUsersBox(state.device_locks);
    state.device_locks.users[id] = rec;

    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      action: "device_locked",
      user_id: id,
      record: rec
    });
  }

  if ((path === "/api/admin/device/remove" || path === "/api/admin/device/delete") && request.method === "POST") {
    const id = normalizeUserIdFromBody(body);

    if (!id) {
      return jsonResponse(request, {
        ok: false,
        error: "user_id обязателен"
      }, 400);
    }

    const state = await getAccessState(e);
    state.device_locks = normalizeUsersBox(state.device_locks);
    delete state.device_locks.users[id];

    await saveAccessState(e, state);

    return jsonResponse(request, {
      ok: true,
      action: "device_lock_removed",
      user_id: id
    });
  }

  if (path === "/api/admin/report-settings" && request.method === "GET") {
    const settings = await getReportSettings(e);

    return jsonResponse(request, {
      ok: true,
      has_token: !!settings.bot_token,
      token_mask: maskToken(settings.bot_token),
      chat_id: settings.chat_id || "",
      updated: settings.updated || ""
    });
  }

  if (path === "/api/admin/report-settings" && request.method === "POST") {
    const saved = await saveReportSettings(e, body);

    return jsonResponse(request, {
      ok: true,
      action: "report_settings_saved",
      has_token: !!saved.bot_token,
      token_mask: maskToken(saved.bot_token),
      chat_id: saved.chat_id,
      updated: saved.updated
    });
  }

  if (path === "/api/admin/report-test" && request.method === "POST") {
    const result = await sendTelegram(e, body.text || "✅ Тестовый отчёт от QuizBot");

    return jsonResponse(request, {
      ok: !!result.ok,
      action: "report_test",
      telegram: result
    }, result.ok === false ? 500 : 200);
  }

  if (path === "/api/admin/tests/info" && request.method === "GET") {
    const data = await getTestsData(e);

    return jsonResponse(request, {
      ok: true,
      key: TESTS_KEY,
      ...countTestsData(data)
    });
  }

  if (path === "/api/admin/tests/export" && request.method === "GET") {
    const data = await getTestsData(e);

    return jsonResponse(request, {
      ok: true,
      key: TESTS_KEY,
      tests_data: data,
      ...countTestsData(data)
    });
  }

  if (path === "/api/admin/tests/import" && request.method === "POST") {
    const incoming = body.tests_data || body.data || body;
    const saved = await saveTestsData(e, incoming);

    return jsonResponse(request, {
      ok: true,
      action: "tests_imported",
      key: TESTS_KEY,
      meta: saved.meta,
      counts: countTestsData(saved.data)
    });
  }

  if (path === "/api/admin/tests/subject" && request.method === "POST") {
    const title = String(body.title || body.subject_title || "").trim();
    const short = String(body.short || body.subject_short || title || "").trim();
    const emoji = String(body.emoji || body.subject_emoji || "📚").trim();

    if (!title) {
      return jsonResponse(request, {
        ok: false,
        error: "Название предмета обязательно"
      }, 400);
    }

    const data = await getTestsData(e);
    const normalized = normalizeTestsData(data);

    normalized.subjects = normalized.subjects || {};

    const key = String(
      body.key ||
      body.subject_key ||
      (normalized.subjects.macro ? "macro" : Object.keys(normalized.subjects)[0] || "macro")
    ).trim() || "macro";

    if (!normalized.subjects[key]) {
      normalized.subjects[key] = {
        tests: []
      };
    }

    normalized.subjects[key].title = title;
    normalized.subjects[key].short = short || title;
    normalized.subjects[key].emoji = emoji || "📚";
    normalized.data_version = normalized.data_version || "custom";

    const saved = await saveTestsData(e, normalized);

    return jsonResponse(request, {
      ok: true,
      action: "subject_updated",
      subject_key: key,
      counts: countTestsData(saved.data)
    });
  }

  if (path === "/api/admin/tests/reset" && request.method === "POST") {
    if (String(body.confirm || "").trim() !== "RESET_TESTS") {
      return jsonResponse(request, {
        ok: false,
        error: "Для сброса вопросов передай confirm: RESET_TESTS"
      }, 400);
    }

    const saved = await saveTestsData(e, EMPTY_TESTS);

    return jsonResponse(request, {
      ok: true,
      action: "tests_reset",
      meta: saved.meta,
      counts: countTestsData(saved.data)
    });
  }

  if (path === "/api/admin/check" && request.method === "POST") {
    const id = normalizeUserIdFromBody(body);
    const fp = cleanFp(body.fingerprint || body.fp || body.device);

    return jsonResponse(request, {
      ok: true,
      user_id: id,
      ...(await evaluateAccess(e, id, fp))
    });
  }

  return jsonResponse(request, {
    ok: false,
    error: "Admin endpoint not found"
  }, 404);
}

async function handleRequest(request, e) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  const url = new URL(request.url);

  let path = url.pathname.replace(/\/+$/, "") || "/";
  path = path.replace(/^\/\.netlify\/functions\/api/, "/api");

  if (path === "/" || path === "/api/health") {
    return jsonResponse(request, {
      ok: true,
      service: "quizbot-backend",
      storage: "netlify-blobs",
      access_key: ACCESS_KEY,
      tests_key: TESTS_KEY
    });
  }

  if (path.startsWith("/api/admin")) {
    return handleAdmin(request, e, path);
  }

  if (path === "/api/tests" && request.method === "GET") {
    const data = await getTestsData(e);

    return jsonResponse(request, shuffleTestsForClient(data));
  }

  if (path === "/api/access" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    const botToken = getAppBotToken(e);
    const user = await verifyTelegramInitData(body.initData || "", botToken);

    const untrustedAllowed = allowUntrustedAccess(e);

    let id = user?.id ? cleanId(user.id) : cleanId(body.telegram_id);

    if (botToken && !user && !untrustedAllowed) {
      id = "";
    }

    if (!id) {
      return jsonResponse(request, {
        ok: true,
        isPremium: false,
        isBlocked: false,
        deviceBlocked: false,
        trusted: false,
        auth: "telegram_auth_failed"
      });
    }

    return jsonResponse(request, {
      ok: true,
      user_id: id,
      trusted: !!user,
      auth: user ? "verified" : untrustedAllowed ? "untrusted_allowed" : "unverified",
      ...(await evaluateAccess(e, id, body.fingerprint || ""))
    });
  }

  if (path === "/api/report" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (String(e.REQUIRE_REPORT_AUTH || "0") === "1") {
      const user = await verifyTelegramInitData(body.initData || "", getAppBotToken(e));

      if (!user) {
        return jsonResponse(request, {
          ok: false,
          error: "Bad Telegram auth"
        }, 403);
      }
    }

    const result = await sendTelegram(e, body.text || "");

    return jsonResponse(request, result, result.ok === false ? 500 : 200);
  }

  return jsonResponse(request, {
    ok: false,
    error: "Not found"
  }, 404);
}

export default async function handler(request) {
  return handleRequest(request, env());
}
