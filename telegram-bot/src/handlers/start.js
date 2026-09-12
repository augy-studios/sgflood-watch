import { startMessage } from '../actions.js';
import { sendRichMessage } from '../reply.js';

export async function startHandler(ctx) {
    const { rich, keyboard } = startMessage();
    await sendRichMessage(ctx.telegram, ctx.chat.id, rich, keyboard);
}
