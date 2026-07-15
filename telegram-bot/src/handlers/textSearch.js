import { clearUserState } from '../db.js';
import { searchLocation } from '../geocode.js';
import { replyNearbyStatus } from './nearme.js';
import { escapeMarkdownV2 } from '../format.js';

export async function textSearchHandler(ctx) {
    const query = ctx.message.text.trim();
    if (!query || query.startsWith('/')) return; // unknown command, ignore

    clearUserState(ctx.chat.id);
    await ctx.sendChatAction('typing');

    let match;
    try {
        match = await searchLocation(query);
    } catch (err) {
        await ctx.reply(`⚠️ Location search failed \\(${escapeMarkdownV2(err.message)}\\)\\. Try again shortly\\.`, { parse_mode: 'MarkdownV2' });
        return;
    }

    if (!match) {
        await ctx.reply(`🔍 Couldn't find "${escapeMarkdownV2(query)}" in Singapore\\. Try a different spelling, or send /nearme to use your GPS location instead\\.`, { parse_mode: 'MarkdownV2' });
        return;
    }

    await replyNearbyStatus(ctx, match.lat, match.lng, match.label);
}
