import { subscribe, unsubscribe, isSubscribed } from './db.js';
import { fetchFloodAlerts } from './lta.js';
import { formatActiveAlertsList, escapeMarkdownV2 } from './format.js';
import { button } from './interactions.js';

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://sgflood.uwuapps.org';
const DONATE_URL = process.env.DONATE_URL || 'https://sgflood.uwuapps.org';

export function doSubscribe(chatId, from) {
    subscribe(chatId, from?.username, from?.first_name);
    return {
        text: '🔔 You\'re subscribed\\! You\'ll get a message here whenever a flood alert is issued or cancelled anywhere in Singapore\\.',
        keyboard: [[button('🔕 Unsubscribe', chatId, 'unsub')]]
    };
}

export function doUnsubscribe(chatId) {
    unsubscribe(chatId);
    return {
        text: '🔕 You\'re unsubscribed\\. You won\'t receive any more automatic flood alert messages\\.',
        keyboard: [[button('🔔 Subscribe again', chatId, 'sub')]]
    };
}

export function doMySub(chatId) {
    const subbed = isSubscribed(chatId);
    return {
        text: subbed
            ? '🔔 You are currently *subscribed* to all flood alert updates\\.'
            : '🔕 You are currently *not subscribed* to flood alert updates\\.',
        keyboard: [[subbed ? button('🔕 Unsubscribe', chatId, 'unsub') : button('🔔 Subscribe', chatId, 'sub')]]
    };
}

export async function doStatus(chatId) {
    const { ok, alerts, error } = await fetchFloodAlerts();
    if (!ok) return { text: `⚠️ Couldn't reach the LTA flood alert API right now \\(${escapeMarkdownV2(error)}\\)\\. Try again shortly\\.`, keyboard: [] };

    const active = alerts.filter(a => a.msgType !== 'Cancel');
    return {
        text: formatActiveAlertsList(active),
        keyboard: [[button('🔄 Refresh', chatId, 'status')]]
    };
}

export function startMessage() {
    const text = [
        '🌊 *SG Flood Watch*',
        '',
        'Real\\-time Singapore flood alerts, sourced live from LTA DataMall\'s flood alert feed\\.',
        '',
        '*Commands*',
        '/sub \\- subscribe to all flood alert updates',
        '/unsub \\- unsubscribe from all flood alert updates',
        '/mysub \\- check your current subscription status',
        '/nearme \\- check flood status near your current location',
        '/status \\- see all active alerts right now',
        '/cancel \\- cancel whatever this bot is currently asking you for',
        '',
        'You can also just type a place name \\(e\\.g\\. "Bukit Timah" or "Orchard Road"\\) and the bot will look up the flood status there\\.'
    ].join('\n');

    return {
        text,
        keyboard: [
            [{ text: '🌐 Open Web App', url: WEBAPP_URL }],
            [{ text: '☕ Support the project', url: DONATE_URL }]
        ]
    };
}
