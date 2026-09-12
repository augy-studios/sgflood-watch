import { doMySub } from '../actions.js';
import { sendRichMessage } from '../reply.js';

export async function mysubHandler(ctx) {
    const { rich, keyboard } = doMySub(ctx.chat.id);
    await sendRichMessage(ctx.telegram, ctx.chat.id, rich, keyboard);
}
