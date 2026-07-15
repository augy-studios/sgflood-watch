import { resolveButton } from '../interactions.js';
import { doSubscribe, doUnsubscribe, doStatus, doMySub } from '../actions.js';

const ACTIONS = {
    sub: (chatId) => doSubscribe(chatId),
    unsub: (chatId) => doUnsubscribe(chatId),
    mysub: (chatId) => doMySub(chatId),
    status: (chatId) => doStatus(chatId)
};

export async function callbackQueryHandler(ctx) {
    const row = resolveButton(ctx.callbackQuery.data);
    if (!row) {
        await ctx.answerCbQuery('This button has expired.');
        return;
    }

    const run = ACTIONS[row.action];
    if (!run) {
        await ctx.answerCbQuery();
        return;
    }

    const { text, keyboard } = await run(ctx.chat.id);
    await ctx.answerCbQuery();
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } });
}
