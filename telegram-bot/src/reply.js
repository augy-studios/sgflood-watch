// Sending / editing Telegram Rich Messages (Bot API 10.1+) through Telegraf.
//
// Telegraf's typed methods (ctx.reply, telegram.sendMessage, ...) don't know
// about `sendRichMessage` or the `rich_message` field on `editMessageText`,
// so these helpers go through the raw `telegram.callApi()` instead. Every
// helper takes a `rich` object from format.js:
//
//     { markdown: <Rich Markdown string> | null, fallback: <plain text> }
//
// and never uses parse_mode. If Telegram rejects the rich payload the helper
// logs why and re-sends `fallback` as plain text, so a rich failure never
// surfaces as an unhandled error. A `rich` with no `markdown` (a one-line
// notice) is sent as plain text straight away.

function richMarkdown(rich) {
    return { markdown: rich.markdown };
}

// A non-empty inline keyboard as Bot API reply_markup, or null.
function inlineMarkup(keyboard) {
    return keyboard?.length ? { inline_keyboard: keyboard } : null;
}

// Editing without reply_markup keeps the old keyboard; an empty inline
// keyboard is what actually removes it.
const NO_BUTTONS = { inline_keyboard: [] };

function isNotModified(err) {
    return /message is not modified/i.test(err?.description || err?.message || '');
}

/**
 * Send `rich` to a chat. `keyboard` is an inline keyboard (array of button
 * rows); `extra` is merged into the request for anything else, e.g.
 * `Markup.removeKeyboard()`. Resolves to the sent Message.
 */
export async function sendRichMessage(telegram, chatId, rich, keyboard = null, extra = {}) {
    const replyMarkup = inlineMarkup(keyboard) || extra.reply_markup;
    const opts = { ...extra, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) };

    if (rich.markdown) {
        try {
            return await telegram.callApi('sendRichMessage', {
                chat_id: chatId,
                rich_message: richMarkdown(rich),
                ...opts
            });
        } catch (err) {
            console.error(`[sendRichMessage] rich send failed, falling back: ${err.description || err.message}`);
        }
    }
    return telegram.sendMessage(chatId, rich.fallback, opts);
}

/** Message id of the result of sendRichMessage(). */
export function sentMessageId(message) {
    return message?.message_id ?? null;
}

/**
 * Edit a message by chat + message id (schedulers, "go back" flows, anything
 * whose id was stored via sentMessageId()). No buttons => keyboard removed.
 */
export async function editRichMessageAt(telegram, chatId, messageId, rich, keyboard = null) {
    const replyMarkup = inlineMarkup(keyboard) || NO_BUTTONS;
    await editRich(telegram, { chat_id: chatId, message_id: messageId }, rich, replyMarkup);
}

/**
 * Edit the message a callback query came from — a regular chat message or an
 * inline-mode message (identified by inline_message_id). No buttons =>
 * keyboard removed.
 */
export async function editRichMessage(ctx, rich, keyboard = null) {
    const cb = ctx.callbackQuery;
    const target = cb.inline_message_id
        ? { inline_message_id: cb.inline_message_id }
        : { chat_id: cb.message.chat.id, message_id: cb.message.message_id };
    const replyMarkup = inlineMarkup(keyboard) || NO_BUTTONS;
    await editRich(ctx.telegram, target, rich, replyMarkup);
}

async function editRich(telegram, target, rich, replyMarkup) {
    if (rich.markdown) {
        try {
            await telegram.callApi('editMessageText', {
                ...target,
                rich_message: richMarkdown(rich),
                reply_markup: replyMarkup
            });
            return;
        } catch (err) {
            if (isNotModified(err)) return;
            console.error(`[editRichMessage] rich edit failed, falling back: ${err.description || err.message}`);
        }
    }
    try {
        await telegram.callApi('editMessageText', {
            ...target,
            text: rich.fallback,
            reply_markup: replyMarkup
        });
    } catch (err) {
        if (!isNotModified(err)) throw err;
    }
}

/**
 * Inline-mode result carrying a rich message, for answerInlineQuery. Build
 * results with this and answer via `telegram.callApi('answerInlineQuery', ...)`
 * (Telegraf's typed answerInlineQuery is fine too — it passes the object
 * through untouched).
 */
export function richInlineArticle({ id, title, description, rich, keyboard = null }) {
    return {
        type: 'article',
        id,
        title,
        description,
        input_message_content: { rich_message: richMarkdown(rich) },
        ...(inlineMarkup(keyboard) ? { reply_markup: inlineMarkup(keyboard) } : {})
    };
}
