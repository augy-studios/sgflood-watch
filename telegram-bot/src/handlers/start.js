import { startMessage } from '../actions.js';

export async function startHandler(ctx) {
    const { text, keyboard } = startMessage();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}
