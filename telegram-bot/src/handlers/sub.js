import { doSubscribe } from '../actions.js';

export async function subHandler(ctx) {
    const { text, keyboard } = doSubscribe(ctx.chat.id, ctx.from);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}
