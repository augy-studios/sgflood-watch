import { subscribe, unsubscribe, isSubscribed } from './db.js';
import { fetchFloodAlerts } from './lta.js';
import { formatActiveAlertsList, escapeMd, mdTable } from './format.js';
import { button } from './interactions.js';

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://sgflood.uwuapps.org';
const DONATE_URL = process.env.DONATE_URL || 'https://sgflood.uwuapps.org';

// Every action returns `{ rich, keyboard }` where `rich` is the message
// contract from format.js (`{ markdown, fallback }`). One-line notices carry
// only `fallback` and are sent as plain text by reply.js.

function notice(fallback) {
    return { markdown: null, fallback };
}

export function doSubscribe(chatId, from) {
    subscribe(chatId, from?.username, from?.first_name);
    return {
        rich: notice('🔔 You\'re subscribed! You\'ll get a message here whenever a flood alert is issued or cancelled anywhere in Singapore.'),
        keyboard: [[button('🔕 Unsubscribe', chatId, 'unsub')]]
    };
}

export function doUnsubscribe(chatId) {
    unsubscribe(chatId);
    return {
        rich: notice('🔕 You\'re unsubscribed. You won\'t receive any more automatic flood alert messages.'),
        keyboard: [[button('🔔 Subscribe again', chatId, 'sub')]]
    };
}

export function doMySub(chatId) {
    const subbed = isSubscribed(chatId);
    return {
        rich: notice(subbed
            ? '🔔 You are currently subscribed to all flood alert updates.'
            : '🔕 You are currently not subscribed to flood alert updates.'),
        keyboard: [[subbed ? button('🔕 Unsubscribe', chatId, 'unsub') : button('🔔 Subscribe', chatId, 'sub')]]
    };
}

export function apiErrorNotice(error) {
    return notice(`⚠️ Couldn't reach the LTA flood alert API right now (${error}). Try again shortly.`);
}

export async function doStatus(chatId) {
    const { ok, alerts, error } = await fetchFloodAlerts();
    if (!ok) return { rich: apiErrorNotice(error), keyboard: [] };

    const active = alerts.filter(a => a.msgType !== 'Cancel');
    return {
        rich: formatActiveAlertsList(active),
        keyboard: [[button('🔄 Refresh', chatId, 'status')]]
    };
}

const COMMANDS = [
    ['/sub', 'subscribe to all flood alert updates'],
    ['/unsub', 'unsubscribe from all flood alert updates'],
    ['/mysub', 'check your current subscription status'],
    ['/nearme', 'check flood status near your current location'],
    ['/status', 'see all active alerts right now'],
    ['/cancel', 'cancel whatever this bot is currently asking you for']
];

export function startMessage() {
    const intro = 'Real-time Singapore flood alerts, sourced live from LTA DataMall\'s flood alert feed.';
    const hint = 'You can also just type a place name (e.g. "Bukit Timah" or "Orchard Road") and the bot will look up the flood status there.';

    const markdown = [
        '# 🌊 SG Flood Watch',
        escapeMd(intro),
        '## Commands',
        mdTable(['Command', 'What it does'], COMMANDS),
        escapeMd(hint)
    ].join('\n\n');

    const fallback = [
        '🌊 SG Flood Watch',
        '',
        intro,
        '',
        'Commands',
        ...COMMANDS.map(([cmd, desc]) => `${cmd} - ${desc}`),
        '',
        hint
    ].join('\n');

    return {
        rich: { markdown, fallback },
        keyboard: [
            [{ text: '🌐 Open Web App', url: WEBAPP_URL }],
            [{ text: '☕ Support the project', url: DONATE_URL }]
        ]
    };
}
