# Setup Guide

Two parts: registering the bot with BotFather (Telegram side), and deploying it on your
Debian 13 VPS (server side).

## 1. Create the bot with BotFather

Open a chat with [@BotFather](https://t.me/BotFather) on Telegram.

### 1.1 Create the bot and get a token

```
/newbot
```

- Choose a display name (this is what shows in chats, e.g. "SG Flood Watch").
- Choose a username ending in `bot` (e.g. `sgfloodwatch_bot`). This is Telegram's requirement
  for bot usernames — it does not need to appear anywhere in the bot's commands or replies,
  and it doesn't.
- BotFather replies with an API token. Put it in your `.env` file as `BOT_TOKEN`. Treat this
  token like a password — anyone with it can control your bot.

### 1.2 Set the command list

```
/setcommands
```

Select your bot, then paste (BotFather requires lowercase, no leading slash, and no bot name):

```
start - About this bot, commands, and links
sub - Subscribe to all flood alert updates
unsub - Unsubscribe from all flood alert updates
mysub - Check your subscription status
nearme - Check flood status near your location
status - See all active flood alerts right now
cancel - Cancel the current request
```

This is what powers the `/` autocomplete menu in Telegram clients.

### 1.3 Set the description (shown on the bot's profile, above the Start button)

```
/setdescription
```

Suggested text:

```
Real-time Singapore flood alerts, sourced live from LTA DataMall. Subscribe for instant
updates, or check the flood status near you — by GPS or just typing a place name.
```

### 1.4 Set the "about" text (shown in shared contact cards / bot info)

```
/setabouttext
```

Suggested text:

```
Live Singapore flood alerts from LTA DataMall. /start to see what I can do.
```

### 1.5 Set a profile photo (optional)

```
/setuserpic
```

Upload a square image — e.g. one of the app icons at `main-site/SGFW-192.png` or
`main-site/SGFW-512.png`.

### 1.6 Privacy mode

By default BotFather enables **group privacy mode**, meaning the bot only sees messages in
groups that are commands (`/sub`, `/nearme`, etc.), not every message — which matters here
since plain text messages are treated as location searches. Leave privacy mode **on** (the
default) unless you specifically want the bot reading every message in a group it's added to.
You can check/change it with:

```
/setprivacy
```

### 1.7 Disable inline mode / other extras

Not needed for this bot — skip `/setinline`, `/setinlinegeo`, payments, etc.

## 2. Get an LTA DataMall AccountKey

The bot needs its own LTA DataMall API key (separate from main-site's):

1. Register at https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html
2. You'll receive an `AccountKey` by email.
3. Put it in `.env` as `LTA_ACCOUNT_KEY`.

## 3. Deploy on your Debian 13 VPS

### 3.1 Install Node.js (if not already installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
```

`build-essential` and `python3` are needed because `better-sqlite3` compiles a small native
module on install.

### 3.2 Install tmux (if not already installed)

```bash
sudo apt-get install -y tmux
```

### 3.3 Get the code onto the VPS

```bash
git clone <your-repo-url>
cd sgflood-watch/telegram-bot
```

(Or `git pull` inside an existing clone.)

### 3.4 Configure environment

```bash
cp .env.example .env
nano .env   # fill in BOT_TOKEN and LTA_ACCOUNT_KEY
```

### 3.5 Install dependencies

```bash
npm install
```

### 3.6 Run it in tmux

```bash
tmux new -s sgfloodwatch-bot
npm start
```

Detach with `Ctrl-b` then `d`. The bot keeps running after you disconnect from SSH.

To check on it later:

```bash
tmux attach -t sgfloodwatch-bot
```

To stop it, reattach and press `Ctrl-C`.

### 3.7 (Optional) Start automatically on boot

tmux sessions don't survive a VPS reboot on their own. If you want the bot to come back up
after a reboot without manually re-attaching, add a `cron` entry:

```bash
crontab -e
```

```cron
@reboot tmux new -d -s sgfloodwatch-bot 'cd /path/to/sgflood-watch/telegram-bot && npm start'
```

This creates the tmux session detached (`-d`) at boot, so you can still `tmux attach` to it
later exactly as before.

## 4. Verify it's working

Message your bot on Telegram with `/start` — you should get the welcome message with the web
app and donation buttons. Try `/status` to confirm it can reach the LTA API, and `/sub` /
`/unsub` to confirm the SQLite subscriber list is working.
