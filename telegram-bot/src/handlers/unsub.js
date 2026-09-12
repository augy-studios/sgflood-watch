import { doUnsubscribe } from '../actions.js';
import { sendRichMessage } from '../reply.js';

export async function unsubHandler(ctx) {
    const { rich, keyboard } = doUnsubscribe(ctx.chat.id);
    await sendRichMessage(ctx.telegram, ctx.chat.id, rich, keyboard);
}
