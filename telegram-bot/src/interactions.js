import { randomBytes } from 'node:crypto';
import { registerInteraction, getInteraction } from './db.js';

// Builds an inline keyboard button whose callback_data is a short id pointing
// at a row in the `interactions` SQLite table, rather than encoding state
// in-memory. That's what makes the button keep working across bot restarts:
// on press, resolveButton() looks the id back up in SQLite regardless of how
// long ago it was sent or whether the process has restarted since.
export function button(text, chatId, action, payload = null) {
    const id = randomBytes(6).toString('hex');
    registerInteraction(id, chatId, action, payload);
    return { text, callback_data: `i:${id}` };
}

export function resolveButton(callbackData) {
    if (!callbackData || !callbackData.startsWith('i:')) return null;
    return getInteraction(callbackData.slice(2));
}
