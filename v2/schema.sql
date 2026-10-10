PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 telegram_id TEXT PRIMARY KEY,
 username TEXT NOT NULL DEFAULT '',
 first_name TEXT NOT NULL DEFAULT '',
 last_name TEXT NOT NULL DEFAULT '',
 first_seen INTEGER NOT NULL DEFAULT 0,
 last_seen INTEGER NOT NULL DEFAULT 0,
 source TEXT NOT NULL DEFAULT 'app',
 premium_until INTEGER NOT NULL DEFAULT 0,
 is_banned INTEGER NOT NULL DEFAULT 0,
 ban_reason TEXT,
 version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_activity ON users(last_seen DESC);
CREATE TABLE IF NOT EXISTS subjects (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
 topic TEXT NOT NULL DEFAULT 'Общие',
 text TEXT NOT NULL,
 options TEXT NOT NULL,
 correct_index INTEGER NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admin_id TEXT NOT NULL,
 action TEXT NOT NULL,
 target TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '{}',
 created_at INTEGER NOT NULL
);

-- Bot token ciphertext is AES-GCM-encrypted with the server-only BOT_TOKEN_ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS bot_settings (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 ciphertext TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
