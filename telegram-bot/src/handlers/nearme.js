import { Markup } from 'telegraf';
import { setUserState, clearUserState, isSubscribed } from '../db.js';
import { fetchFloodAlerts } from '../lta.js';
import { formatActiveAlertsList, escapeMarkdownV2 } from '../format.js';
import { button } from '../interactions.js';

export async function nearmeHandler(ctx) {
    setUserState(ctx.chat.id, 'awaiting_location');
    await ctx.reply(
        '📍 Tap the button below to share your location, and I\'ll check for flood alerts near you\\.\n\nSend /cancel to back out\\.',
        { parse_mode: 'MarkdownV2', ...Markup.keyboard([Markup.button.locationRequest('📍 Send My Location')]).resize().oneTime() }
    );
}

// Shared by the location-message handler (GPS, via /nearme) and the plain-text
// search handler (Nominatim geocoded point) — both just need "here's a point,
// tell me what's active nearby".
export async function replyNearbyStatus(ctx, lat, lng, label) {
    await ctx.sendChatAction('typing');
    const { ok, alerts, error } = await fetchFloodAlerts();
    if (!ok) {
        await ctx.reply(`⚠️ Couldn't reach the LTA flood alert API right now \\(${escapeMarkdownV2(error)}\\)\\. Try again shortly\\.`, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });
        return;
    }

    const active = alerts.filter(a => a.msgType !== 'Cancel');
    const heading = label ? `📍 *${escapeMarkdownV2(label)}*\n\n` : '';
    const text = heading + formatActiveAlertsList(active, lat, lng);

    // Telegram's reply_markup can only be one keyboard type at a time, so the
    // custom "send location" keyboard is cleared in its own message before
    // the inline "Subscribe" button is offered.
    await ctx.reply(text, { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() });

    if (!isSubscribed(ctx.chat.id)) {
        await ctx.reply('Want to be notified automatically next time?', {
            parse_mode: 'MarkdownV2',
            reply_markup: { inline_keyboard: [[button('🔔 Subscribe to all updates', ctx.chat.id, 'sub')]] }
        });
    }
}

export async function locationMessageHandler(ctx) {
    clearUserState(ctx.chat.id);
    const { latitude, longitude } = ctx.message.location;
    await replyNearbyStatus(ctx, latitude, longitude, 'Near your location');
}
