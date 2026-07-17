# 🔥 AURA — Extreme Self-Discipline PWA

Single-user OLED-first PWA for iPhone. Ranok routine, hydration, Pomodoro-style sprints, Gemini-validated wake-up reflection, month calendar, iOS Shortcuts hooks.

## ⚡ Features

- 🌅 **Wake-Up Protocol** — daily stoic quote, must retype + write a ≥2-sentence reflection. Gemini AI validates it isn't gibberish.
- 💧 **Hydration tracker** — quick-add 250 / 500 / 1000 ml, custom amount, in-app reminders every 90 min, target configurable per profile.
- ⏱️ **Sprint tracker** — 30/45/60 min focus sessions with pause/resume, elapsed + remaining, focus-loss detection (>15s hidden = fail), today's completed count.
- 📅 **Month calendar** — 7×6 grid with completion tint per day, event dots (gym / other / vacuum), prev/next nav, streak + monthly summary.
- 🏆 **Streak milestones** — banners at 7 / 14 / 30 / 50 / 100 / 365 days.
- 📈 **Weight sparkline** — auto-logged history, mini SVG chart on profile.
- 🥗 **AI Nutrition** — Gemini builds recipes from ingredients + goal (bulk/cut/maintain) with macro breakdown.
- 📱 **iOS Shortcut integration** — Siri-friendly plain-text audit endpoint, one-tap water/weight/note/habit endpoints.
- 🔊 **Haptics + audio** — Vibration API on key actions, Web Audio chimes on sprint complete/fail.

## 🚀 Local development

```bash
npm install
cp .env.example .env   # then paste your GEMINI_API_KEY
npm run dev
```

Open `http://localhost:3434`.

For iPhone testing on the same Wi-Fi, use the local IP printed on startup (e.g. `http://192.168.x.x:3434`).

## ☁️ Deploy to Vercel

1. Push repo to GitHub. `.gitignore` already excludes `.env` and `db_*.json`.
2. Import to Vercel and set env vars in the dashboard:
   - `GEMINI_API_KEY` — required, from Google AI Studio.
   - `UPSTASH_REDIS_REST_URL` — optional, for wake-up status caching.
   - `UPSTASH_REDIS_REST_TOKEN` — optional.
3. Deploy. Routing is handled by `vercel.json` (SPA + `/api/*` → server.js).

**Note on state persistence on Vercel.** Vercel's `/tmp` is ephemeral between cold starts, so server-side user JSON is not durable. The frontend caches the whole state in `localStorage` and rehydrates on every load, so single-device use is unaffected. For cross-device sync add Upstash Redis and adapt `db.js` `readUser`/`writeUser` to use `redisGet`/`redisSet`.

## 🚨 iOS Shortcut

The in-app **"Встановити iOS Сирену"** modal walks you through building the shortcut yourself in 5 minutes — no external imports needed. Endpoints available:

| Endpoint | Method | Body | Purpose |
|---|---|---|---|
| `/api/shortcuts/audit` | GET | — | Plain-text Siri response with what's undone today (add `?format=json` for structured) |
| `/api/shortcuts/water` | POST | `{"ml":250}` | Log water, returns updated total |
| `/api/shortcuts/weight` | POST | `{"weight":76.2}` | Update current weight (auto-logs history) |
| `/api/shortcuts/note` | POST | `{"text":"…","time":"HH:MM"}` | Add a calendar event |
| `/api/shortcuts/meal` | POST | `{"name":"…","protein":30,"calories":120}` | Log a meal |
| `/api/shortcuts/toggle` | POST | `{"habitId":"duolingo","done":true}` | Mark a habit |

Recommended morning automation:
1. Shortcuts app → **Дисципліна** — `Get Contents of URL` on `/api/shortcuts/audit` → `Speak Text` (uk-UA).
2. `If` result contains `Порушено` → `Set Volume 100%` → `Play Sound` → `Open URL` back to the PWA.
3. Automations → Time of day **09:00** daily → run **Дисципліна**, "Ask before running" **off**.

## 🗂️ File map

```
server.js          Express server + routes
auth.js            Single-user auth middleware (bypass)
db.js              File + Upstash Redis persistence helpers
wakeup.js          Wake-up quote / verify / status logic
nutrition.js       Gemini recipe generator
gemini.js          Gemini API wrapper
levenshtein.js     Distance function for quote validation
stoic_quotes.js    189 Ukrainian stoic quotes
sw.js              PWA service worker (bump CACHE_NAME on deploy)
index.html         Whole PWA UI + JS
```

## 🔒 Security

- `.env` is git-ignored.
- `.env.example` ships with a placeholder — never commit real keys.
- Bumping `sw.js` `CACHE_NAME` triggers clients to refresh assets on next visit.
