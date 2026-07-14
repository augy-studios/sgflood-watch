# SG Flood Watch 🌊

Real-time Singapore flood alerts at your fingertips!  

## Features

- 📍 **Location-aware** — requires GPS for nearby alert detection
- 🗺️ **Live map** — OpenStreetMap with coloured alert circles by severity
- 🚨 **Danger overlay** — full-screen warning if you're inside an alert zone
- ⏱️ **Live countdown** — per-alert expiry timers, auto-refresh every 3 min
- 🔍 **Area search** — search any Singapore location via Nominatim geocoding
- 🎨 **7 themes** — Classic green + 6 alternatives, persisted in localStorage
- 📴 **Offline** — Service Worker caches last known alerts
- 🔔 **Push notifications** — framework ready (requires VAPID key setup)

## Severity Colour Coding

| Severity | Colour | Meaning |
|----------|--------|---------|
| Extreme  | 🔴 Red | Extraordinary threat to life or property |
| Severe   | 🟠 Orange | Significant threat |
| Moderate | 🟡 Yellow | Possible threat |
| Minor    | 🟢 Green | Minimal to no known threat |

---

## Notes

- The `circle` field from the API is the **broadcast radius**, not the flood extent — this is clearly noted in the map legend.
- Expired alerts (>24h) are shown in a muted "Recently Resolved" section.
- Cancelled alerts trigger a toast notification rather than silently disappearing.
