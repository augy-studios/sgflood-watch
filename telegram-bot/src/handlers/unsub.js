import { doUnsubscribe } from '../actions.js';

export async function unsubHandler(ctx) {
    const { text, keyboard } = doUnsubscribe(ctx.chat.id);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}
