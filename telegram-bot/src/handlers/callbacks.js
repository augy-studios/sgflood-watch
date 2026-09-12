import { resolveButton } from '../interactions.js';
import { doSubscribe, doUnsubscribe, doStatus, doMySub } from '../actions.js';
import { sendRichMessage, editRichMessage } from '../reply.js';

// `redraw: true` actions replace the message the button was on (the view is
// being refreshed); the rest post a fresh notice below it.
const ACTIONS = {
    sub: { run: (chatId) => doSubscribe(chatId) },
    unsub: { run: (chatId) => doUnsubscribe(chatId) },
    mysub: { run: (chatId) => doMySub(chatId) },
    status: { run: (chatId) => doStatus(chatId), redraw: true }
};

export async function callbackQueryHandler(ctx) {
    const row = resolveButton(ctx.callbackQuery.data);
    if (!row) {
        await ctx.answerCbQuery('This button has expired.');
        return;
    }

    const action = ACTIONS[row.action];
    if (!action) {
        await ctx.answerCbQuery();
        return;
    }

    const { rich, keyboard } = await action.run(ctx.chat.id);
    await ctx.answerCbQuery();
    if (action.redraw) {
        await editRichMessage(ctx, rich, keyboard);
    } else {
        await sendRichMessage(ctx.telegram, ctx.chat.id, rich, keyboard);
    }
}
