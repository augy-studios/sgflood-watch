import { getSchedule, upsertSchedule, getSeenAlert, upsertSeenAlert, getActiveSeenAlertKeys, getAllSubscribers } from './db.js';
import { fetchFloodAlerts, alertKey, isActive } from './lta.js';
import { formatAlert, escapeMarkdownV2 } from './format.js';

const JOB_NAME = 'poll_alerts';
const TICK_MS = 30_000; // how often the loop wakes up to check the schedule table

async function broadcast(bot, text) {
    const subscribers = getAllSubscribers();
    for (const { chat_id } of subscribers) {
        try {
            await bot.telegram.sendMessage(chat_id, text, { parse_mode: 'MarkdownV2' });
        } catch (err) {
            // A blocked/deleted chat shouldn't take down the whole broadcast.
            console.error(`Failed to notify chat ${chat_id}:`, err.message);
        }
    }
}

async function pollOnce(bot, seedOnly) {
    const { ok, alerts, error } = await fetchFloodAlerts();
    if (!ok) {
        console.error('Scheduler: failed to fetch LTA flood alerts:', error);
        return;
    }

    const currentActiveKeys = new Set();

    for (const alert of alerts) {
        const key = alertKey(alert);
        const active = isActive(alert);
        const previouslySeen = getSeenAlert(key);

        if (active) {
            currentActiveKeys.add(key);
            const isNew = !previouslySeen || previouslySeen.status !== 'active';
            if (isNew && !seedOnly) {
                await broadcast(bot, `🚨 *New flood alert*\n\n${formatAlert(alert)}`);
            }
            upsertSeenAlert(key, alert.headline, alert.areaDesc, 'active');
        } else {
            const wasActive = previouslySeen && previouslySeen.status === 'active';
            if (wasActive && !seedOnly) {
                await broadcast(bot, `✅ *Flood alert cancelled*\n\n${escapeMarkdownV2(alert.headline || 'A flood alert')} has been called off\\.`);
            }
            upsertSeenAlert(key, alert.headline, alert.areaDesc, 'cancelled');
        }
    }

    // Any alert key that was previously active but is no longer in the feed
    // at all (rather than explicitly cancelled) is treated as resolved too.
    if (!seedOnly) {
        for (const key of getActiveSeenAlertKeys()) {
            if (!currentActiveKeys.has(key)) {
                upsertSeenAlert(key, null, null, 'cancelled');
            }
        }
    }
}

export function startScheduler(bot) {
    const intervalSeconds = Number(process.env.POLL_INTERVAL_SECONDS) || 180;
    const existing = getSchedule(JOB_NAME);

    if (!existing) {
        // First ever boot: seed seen_alerts with whatever is already active so
        // those pre-existing alerts aren't broadcast as "new" the moment the
        // bot comes online, then schedule the first real poll.
        pollOnce(bot, true).finally(() => {
            upsertSchedule(JOB_NAME, intervalSeconds, Date.now() + intervalSeconds * 1000, Date.now());
        });
    } else if (existing.interval_seconds !== intervalSeconds) {
        upsertSchedule(JOB_NAME, intervalSeconds, existing.next_run_at, existing.last_run_at);
    }

    setInterval(async () => {
        const schedule = getSchedule(JOB_NAME);
        if (!schedule || Date.now() < schedule.next_run_at) return;

        await pollOnce(bot, false);
        upsertSchedule(JOB_NAME, schedule.interval_seconds, Date.now() + schedule.interval_seconds * 1000, Date.now());
    }, TICK_MS);
}
