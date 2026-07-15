import { doMySub } from '../actions.js';

export async function mysubHandler(ctx) {
    const { text, keyboard } = doMySub(ctx.chat.id);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}
