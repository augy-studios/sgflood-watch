import { doUnsubscribe } from '../actions.js';

export async function unsubHandler(ctx) {
    const { text, keyboard } = doUnsubscribe(ctx.chat.id);
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } });
}
