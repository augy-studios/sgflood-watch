import { doStatus } from '../actions.js';
import { sendRichMessage } from '../reply.js';

export async function statusHandler(ctx) {
    await ctx.sendChatAction('typing');
    const { rich, keyboard } = await doStatus(ctx.chat.id);
    await sendRichMessage(ctx.telegram, ctx.chat.id, rich, keyboard);
}
