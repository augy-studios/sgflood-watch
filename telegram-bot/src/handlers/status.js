import { doStatus } from '../actions.js';

export async function statusHandler(ctx) {
    await ctx.sendChatAction('typing');
    const { text, keyboard } = await doStatus(ctx.chat.id);
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } });
}
