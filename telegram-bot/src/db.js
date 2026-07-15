import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/bot.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS subscribers (
    chat_id         INTEGER PRIMARY KEY,
    username        TEXT,
    first_name      TEXT,
    subscribed_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_state (
    chat_id     INTEGER PRIMARY KEY,
    state       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Every inline button the bot ever sends is registered here. The button's
-- callback_data is just its row id, so pressing it after a bot restart (or
-- weeks later) still resolves to the original action/payload instead of
-- relying on in-memory session state that would be lost on restart.
CREATE TABLE IF NOT EXISTS interactions (
    button_id   TEXT PRIMARY KEY,
    chat_id     INTEGER NOT NULL,
    action      TEXT NOT NULL,
    payload     TEXT,
    created_at  TEXT NOT NULL
);

-- Tracks the last known status of every alert LTA has reported so the
-- scheduler can tell "new alert" / "cancelled alert" apart from "same alert
-- as last poll" across restarts.
CREATE TABLE IF NOT EXISTS seen_alerts (
    alert_key       TEXT PRIMARY KEY,
    headline        TEXT,
    area_desc       TEXT,
    status          TEXT NOT NULL,
    first_seen_at   TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL
);

-- Drives the polling loop. next_run_at is persisted so a bot restart doesn't
-- immediately re-poll (or lose track of) the schedule.
CREATE TABLE IF NOT EXISTS schedule (
    job_name            TEXT PRIMARY KEY,
    interval_seconds    INTEGER NOT NULL,
    next_run_at         INTEGER NOT NULL,
    last_run_at         INTEGER
);
`);

// ── Subscribers ──────────────────────────────────────────────────────────
export function subscribe(chatId, username, firstName) {
    db.prepare(`
        INSERT INTO subscribers (chat_id, username, first_name, subscribed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
    `).run(chatId, username || null, firstName || null, new Date().toISOString());
}

export function unsubscribe(chatId) {
    db.prepare('DELETE FROM subscribers WHERE chat_id = ?').run(chatId);
}

export function isSubscribed(chatId) {
    return !!db.prepare('SELECT 1 FROM subscribers WHERE chat_id = ?').get(chatId);
}

export function getAllSubscribers() {
    return db.prepare('SELECT chat_id FROM subscribers').all();
}

// ── User state (multi-step flows, e.g. /nearme awaiting a location) ────────
export function setUserState(chatId, state) {
    db.prepare(`
        INSERT INTO user_state (chat_id, state, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
    `).run(chatId, state, new Date().toISOString());
}

export function getUserState(chatId) {
    const row = db.prepare('SELECT state FROM user_state WHERE chat_id = ?').get(chatId);
    return row ? row.state : null;
}

export function clearUserState(chatId) {
    db.prepare('DELETE FROM user_state WHERE chat_id = ?').run(chatId);
}

// ── Interactions (persistent inline button registry) ───────────────────────
export function registerInteraction(buttonId, chatId, action, payload) {
    db.prepare(`
        INSERT INTO interactions (button_id, chat_id, action, payload, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(buttonId, chatId, action, payload ? JSON.stringify(payload) : null, new Date().toISOString());
}

export function getInteraction(buttonId) {
    const row = db.prepare('SELECT * FROM interactions WHERE button_id = ?').get(buttonId);
    if (!row) return null;
    return { ...row, payload: row.payload ? JSON.parse(row.payload) : null };
}

// ── Seen alerts (dedup for the poll/broadcast scheduler) ───────────────────
export function getSeenAlert(alertKey) {
    return db.prepare('SELECT * FROM seen_alerts WHERE alert_key = ?').get(alertKey);
}

export function upsertSeenAlert(alertKey, headline, areaDesc, status) {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO seen_alerts (alert_key, headline, area_desc, status, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(alert_key) DO UPDATE SET status = excluded.status, last_seen_at = excluded.last_seen_at
    `).run(alertKey, headline || null, areaDesc || null, status, now, now);
}

export function getActiveSeenAlertKeys() {
    return db.prepare("SELECT alert_key FROM seen_alerts WHERE status = 'active'").all().map(r => r.alert_key);
}

// ── Schedule ─────────────────────────────────────────────────────────────
export function getSchedule(jobName) {
    return db.prepare('SELECT * FROM schedule WHERE job_name = ?').get(jobName);
}

export function upsertSchedule(jobName, intervalSeconds, nextRunAt, lastRunAt) {
    db.prepare(`
        INSERT INTO schedule (job_name, interval_seconds, next_run_at, last_run_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(job_name) DO UPDATE SET
            interval_seconds = excluded.interval_seconds,
            next_run_at = excluded.next_run_at,
            last_run_at = excluded.last_run_at
    `).run(jobName, intervalSeconds, nextRunAt, lastRunAt ?? null);
}
