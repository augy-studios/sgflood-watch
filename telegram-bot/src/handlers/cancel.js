import { Markup } from 'telegraf';
import { clearUserState, getUserState } from '../db.js';

export async function cancelHandler(ctx) {
    const hadState = getUserState(ctx.chat.id);
    clearUserState(ctx.chat.id);
    await ctx.reply(
        hadState ? '❌ Cancelled\\.' : 'Nothing to cancel\\.',
        { parse_mode: 'MarkdownV2', ...Markup.removeKeyboard() }
    );
}
