# SG Flood Watch 🌊

Real-time Singapore flood alerts, sourced live from LTA DataMall — available wherever you are.

## Platforms

| Platform | Description | Link |
|---|---|---|
| 🌐 Web app | Live map, danger overlay, push notifications, offline support | [main-site/](main-site) — [sgflood.uwuapps.org](https://sgflood.uwuapps.org) |
| 🤖 Telegram bot | Subscribe to alerts, check flood status near you, no app install needed | [telegram-bot/](telegram-bot) — [t.me/sgfloods_bot](https://t.me/sgfloods_bot) |

## Repository structure

```
sgflood-watch/
├── main-site/       # Web app (static site + serverless API)
└── telegram-bot/    # Telegram bot (Node.js + Telegraf)
```

Each platform has its own README with setup instructions.

## License

[MIT](LICENSE)
