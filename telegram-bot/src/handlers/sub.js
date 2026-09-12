import { doSubscribe } from '../actions.js';
import { sendRichMessage } from '../reply.js';

export async function subHandler(ctx) {
    const { rich, keyboard } = doSubscribe(ctx.chat.id, ctx.from);
    await sendRichMessage(ctx.telegram, ctx.chat.id, rich, keyboard);
}
