# SG Flood Watch — Telegram Bot 🌊

A Telegram bot companion to [SG Flood Watch](https://sgflood.uwuapps.org) — get real-time
Singapore flood alerts (sourced live from LTA DataMall) straight in a chat, with no need to
open the web app.

It's built on Node.js + [Telegraf](https://telegraf.js.org/) and uses a local SQLite database
for subscriptions, polling schedule, and button state — no external database or hosting
service required. Designed to run continuously inside a `tmux` session on a small VPS.

## What it does

- Polls LTA DataMall's public flood alert feed every few minutes.
- Lets anyone subscribe to get a message the moment a new flood alert is issued or an
  existing one is cancelled, anywhere in Singapore.
- Lets anyone check the flood status near a location — either by sharing their live GPS
  location, or by just typing a place name.
- All bot state (subscribers, poll schedule, button state) lives in one SQLite file, so it
  survives restarts without needing an external database.

## Commands

| Command | What it does |
|---|---|
| `/start` | About this bot, the full command list, and links to the web app / donation page |
| `/sub` | Subscribe to **all** flood alert updates (new + cancelled alerts) |
| `/unsub` | Unsubscribe from all flood alert updates |
| `/mysub` | Check whether you're currently subscribed |
| `/nearme` | Share your location to get the flood status near you |
| `/status` | See every active flood alert right now, island-wide |
| `/cancel` | Cancel whatever the bot is currently asking you for (e.g. a location request) |

You can also just **type a place name** (e.g. `Bukit Timah`, `Orchard Road`, `Toa Payoh`) as a
plain message — no command needed — and the bot will look up the closest matching location
in Singapore (via OpenStreetMap Nominatim) and reply with the flood status there.

## How it works

- **Alert data**: [LTA DataMall PubFloodAlerts API](https://datamall.lta.gov.sg/) — the same
  source main-site's web app uses. Requires a free `LTA_ACCOUNT_KEY`.
- **Location search**: [OpenStreetMap Nominatim](https://nominatim.org/) — free, no API key
  needed, restricted to Singapore results.
- **Database**: SQLite (via `better-sqlite3`), stored at `data/bot.db` by default. Used for:
  - the subscriber list (`/sub` / `/unsub`)
  - the polling schedule (so a restart doesn't lose track of when the last poll ran, or
    immediately re-poll and re-notify)
  - a de-dup table of previously-seen alerts, so subscribers only get pinged for genuinely
    new or newly-cancelled alerts, not ones already reported before a restart
  - a registry of every inline button the bot has ever sent, keyed by a short id. Buttons
    carry that id (not encoded state) as their `callback_data`, so pressing an old button —
    even one sent before the last restart — still resolves correctly instead of relying on
    in-memory session data that a restart would wipe.
- **Scheduling**: no external cron. The bot runs its own polling loop in-process, driven by a
  `next_run_at` timestamp persisted in SQLite (see `POLL_INTERVAL_SECONDS` in `.env.example`).

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in `BOT_TOKEN` and `LTA_ACCOUNT_KEY` (see
   [SETUP.md](SETUP.md) for how to get a bot token from BotFather).
3. Start the bot:
   ```bash
   npm start
   ```

## Running on a VPS with tmux

```bash
tmux new -s sgfloodwatch-bot
cd /path/to/sgflood-watch/telegram-bot
npm install
npm start
```

Detach with `Ctrl-b d` — the bot keeps running. Reattach any time with:

```bash
tmux attach -t sgfloodwatch-bot
```

To update after pulling new code, reattach, stop the bot with `Ctrl-C`, then `npm install`
(if dependencies changed) and `npm start` again.

The SQLite database file at `data/bot.db` is persistent — subscribers and the poll schedule
survive both bot restarts and VPS reboots. It's excluded from git via `.gitignore`, so back
it up separately if you care about not losing the subscriber list.

## Project structure

```
telegram-bot/
├── src/
│   ├── bot.js           # entrypoint — wires up commands, message/callback handlers, scheduler
│   ├── db.js             # SQLite schema + all queries
│   ├── lta.js             # LTA DataMall fetch + alert helpers (haversine, severity, etc.)
│   ├── geocode.js        # Nominatim place-name search
│   ├── format.js          # Telegram message formatting
│   ├── actions.js         # shared logic behind /sub, /unsub, /status, /mysub, /start
│   ├── interactions.js   # persistent inline-button registry (backed by SQLite)
│   ├── scheduler.js       # in-process polling loop + subscriber broadcast
│   └── handlers/          # thin per-command Telegraf handlers
├── data/                  # SQLite database file lives here (gitignored)
├── .env.example
├── SETUP.md               # BotFather setup instructions
└── README.md
```

See [SETUP.md](SETUP.md) for how to register the bot with BotFather (name, description,
command list, etc).
