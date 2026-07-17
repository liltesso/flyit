# 🔥 AURA — Extreme Self-Discipline PWA (v2.0)

A high-performance PWA routine tracker designed for **iPhone 12 OLED** screens. It enforces extreme discipline and incorporates native iOS shortcut hooks with Google Gemini 1.5 Flash AI-powered verification.

---

## ⚡ Key Features

1. **🌅 Aura Wake-Up Protocol (Alarm Siren)**:
   - Aggressively wakes you up using a native iOS Shortcut triggered daily at **09:00 AM**.
   - If not confirmed awake, iPhone volume is forced to 100%, an alarm siren loops, and the PWA is opened.
   - **Double Proof of Work**: User must type the Stoic quote (checks Levenshtein distance) and write a reflection (min. 2 sentences).
   - **AI-Validation**: Gemini AI validates reflection to ensure it isn't gibberish.

2. **📱 iPhone 12 OLED Optimized UI/UX**:
   - True black (`#000000`) theme to save battery and look premium.
   - Notch/Safe-areas compatibility (`viewport-fit=cover` and safe-area margins).
   - **GitHub-style calendar grid**: Shows daily completion history over 15 weeks (Level 0 to 4) + Streaks.

3. **🥗 AI Nutrition Constructor**:
   - Enter ingredients → Gemini builds an personalized recipe targeting weight goals (Bulk/Cut/Maintain).
   - Detailed macro (P/F/C/Kcal) computations.
   - Strict warnings if protein levels fall too low.

4. **⏱️ Strict Sprint Tracker (Pomodoro)**:
   - 45-minute sprint timers (Vacuum, Mewing, English, History).
   - Focus enforcement via **Visibilitychange API** — exiting or backgrounding the PWA for >15s fails the sprint and resets progress!

---

## 🚀 Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3434` in your browser.

---

## ☁️ Deployment

### Step 1: Deploy to GitHub
1. Create a repository on GitHub.
2. Initialize git and push:
   ```bash
   git init
   ```
   *Make sure `.env` is in your `.gitignore` to keep keys private.*
   ```bash
   git add .
   git commit -m "feat: AURA v2.0 complete build"
   git branch -M main
   git remote add origin YOUR_REPOSITORY_URL
   git push -u origin main
   ```

### Step 2: Deploy to Vercel
1. Sign in to [Vercel](https://vercel.com) and link your GitHub repository.
2. Configure **Environment Variables** in the Vercel Dashboard:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `UPSTASH_REDIS_REST_URL`: (Optional) Upstash Redis Rest Endpoint.
   - `UPSTASH_REDIS_REST_TOKEN`: (Optional) Upstash Redis Token.
3. Click **Deploy**. Vercel will build it as a serverless SPA.

---

## 🚨 Config iOS Siren Shortcut

1. Open the PWA, click the **"Встановити iOS Сирену"** button.
2. Copy the dynamically generated Webhook URL (looks like `https://YOUR-APP.vercel.app/api/wakeup/status?user=your_username`).
3. Set up a daily Automation in the iOS Shortcuts app:
   - Time of day: **09:00 AM**.
   - Action: **Run Shortcut** (using the AURA Siren team template) and paste your webhook URL.
