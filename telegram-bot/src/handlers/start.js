import { startMessage } from '../actions.js';

export async function startHandler(ctx) {
    const { text, keyboard } = startMessage();
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } });
}
