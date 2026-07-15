import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

import './db.js'; // creates/opens the SQLite database and its schema
import { startScheduler } from './scheduler.js';

import { startHandler } from './handlers/start.js';
import { subHandler } from './handlers/sub.js';
import { unsubHandler } from './handlers/unsub.js';
import { mysubHandler } from './handlers/mysub.js';
import { statusHandler } from './handlers/status.js';
import { cancelHandler } from './handlers/cancel.js';
import { nearmeHandler, locationMessageHandler } from './handlers/nearme.js';
import { textSearchHandler } from './handlers/textSearch.js';
import { callbackQueryHandler } from './handlers/callbacks.js';

if (!process.env.BOT_TOKEN) {
    console.error('BOT_TOKEN is not set. Copy .env.example to .env and fill it in — see SETUP.md.');
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command('start', startHandler);
bot.command('sub', subHandler);
bot.command('unsub', unsubHandler);
bot.command('mysub', mysubHandler);
bot.command('status', statusHandler);
bot.command('cancel', cancelHandler);
bot.command('nearme', nearmeHandler);

bot.on(message('location'), locationMessageHandler);
bot.on(message('text'), textSearchHandler); // catch-all: plain text = location search
bot.on('callback_query', callbackQueryHandler);

bot.catch((err, ctx) => {
    console.error(`Unhandled error for update ${ctx.update.update_id}:`, err);
});

bot.launch().then(() => {
    console.log('SG Flood Watch bot is running (polling mode).');
    startScheduler(bot);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
