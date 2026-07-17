const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3434;

// ═══════ SIMPLE ENV PARSER ═══════
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
    try {
        const content = fs.readFileSync(envFile, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [key, ...valParts] = trimmed.split('=');
                let val = valParts.join('=').trim();
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
                process.env[key.trim()] = val;
            }
        });
    } catch(e) { console.error('Error parsing .env:', e); }
}

// Import modular architecture components
const db = require('./db');
const auth = require('./auth');
const wakeup = require('./wakeup');
const nutrition = require('./nutrition');
const gemini = require('./gemini');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ═══════ AUTH ROUTES ═══════

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ ok: false, error: "Потрібне ім'я та пароль" });
    if (username.length < 2) return res.status(400).json({ ok: false, error: "Ім'я мін. 2 символи" });
    if (password.length < 4) return res.status(400).json({ ok: false, error: 'Пароль мін. 4 символи' });
    
    if (db.readUser(username)) {
        return res.status(409).json({ ok: false, error: "Це ім'я вже зайняте" });
    }

    const s = auth.salt();
    const tk = auth.token();
    const user = {
        username,
        salt: s,
        hash: auth.hash(password, s),
        tokens: [tk],
        state: null,
        history: [],
        completedToday: {},
        wakeup: {}
    };
    db.writeUser(username, user);
    res.json({ ok: true, token: tk, username });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ ok: false, error: "Потрібне ім'я та пароль" });
    
    const user = db.readUser(username);
    if (!user) return res.status(401).json({ ok: false, error: "Невірне ім'я або пароль" });
    if (auth.hash(password, user.salt) !== user.hash) {
        return res.status(401).json({ ok: false, error: "Невірне ім'я або пароль" });
    }

    const tk = auth.token();
    if (!user.tokens) user.tokens = [];
    user.tokens.push(tk);
    if (user.tokens.length > 5) user.tokens = user.tokens.slice(-5);
    db.writeUser(username, user);
    res.json({ ok: true, token: tk, username });
});

app.get('/api/me/:user', auth.auth, (req, res) => {
    res.json({ ok: true, username: req.userData.username });
});

// ═══════ STATE ROUTES ═══════

app.get('/api/state/:user', auth.auth, (req, res) => {
    res.json({ ok: true, data: req.userData.state || null, completed: req.userData.completedToday || {} });
});

app.post('/api/state/:user', auth.auth, (req, res) => {
    const user = req.userData;
    user.state = req.body.state || null;
    
    if (req.body.completed) {
        if (!user.completedToday) user.completedToday = {};
        Object.assign(user.completedToday, req.body.completed);
        
        // Clean up old dates (keep last 120 days)
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 120);
        const cutStr = cutoff.toISOString().split('T')[0];
        for (const d in user.completedToday) {
            if (d < cutStr) delete user.completedToday[d];
        }
    }
    
    if (user.state) user.state._saved = new Date().toISOString();
    db.writeUser(req.params.user, user);
    res.json({ ok: true });
});

app.post('/api/complete/:user', auth.auth, (req, res) => {
    const { date, dayKey } = req.body;
    const user = req.userData;
    
    if (!user.completedToday) user.completedToday = {};
    if (!user.completedToday[date]) user.completedToday[date] = [];
    if (!user.completedToday[date].includes(dayKey)) {
        user.completedToday[date].push(dayKey);
    }
    
    if (!user.history) user.history = [];
    user.history.push({ ...req.body, _ts: new Date().toISOString() });
    if (user.history.length > 500) user.history = user.history.slice(-500);
    
    db.writeUser(req.params.user, user);
    res.json({ ok: true });
});

app.get('/api/history/:user', auth.auth, (req, res) => {
    res.json({ ok: true, data: req.userData.history || [] });
});

// ═══════ WAKE-UP ROUTES ═══════
app.get('/api/wakeup/status', wakeup.getStatus);
app.get('/api/wakeup/quote', wakeup.getQuote);
app.post('/api/wakeup/verify', wakeup.verifyWakeup);
app.post('/api/wakeup/generate', wakeup.generateQuote);

// ═══════ NUTRITION ROUTES ═══════
app.post('/api/nutrition/recipe', auth.auth, nutrition.generateRecipe);

// ═══════ GEMINI PROXY ═══════
app.post('/api/gemini', async (req, res) => {
    try {
        const { contents } = req.body;
        const response = await fetch(`${gemini.GEMINI_URL}?key=${gemini.GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });
        const data = await response.json();
        res.json(data);
    } catch(err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// serve SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🔥 AURA v2.0 SERVER (MODULAR) — http://localhost:${PORT}`);
    console.log(`  Redis: ${db.redisAvailable() ? '✅ Connected' : '⚠️  File-based fallback'}`);
    console.log(`  Gemini: ${gemini.GEMINI_KEY ? '✅ Configured' : '⚠️  Not configured'}`);
    console.log(`  Data folder: ${db.DATA_DIR}\n`);
});

module.exports = app;
