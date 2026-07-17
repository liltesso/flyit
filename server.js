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

// ═══════ AUTH BYPASS ROUTES ═══════
app.post('/api/register', (req, res) => {
    res.json({ ok: true, token: 'single_user_token', username: 'aura_user' });
});

app.post('/api/login', (req, res) => {
    res.json({ ok: true, token: 'single_user_token', username: 'aura_user' });
});

app.get('/api/me/:user', auth.auth, (req, res) => {
    res.json({ ok: true, username: 'aura_user' });
});

// ═══════ STATE ROUTES (SINGLE USER BYPASS) ═══════

app.get('/api/state/:user', auth.auth, (req, res) => {
    res.json({ ok: true, data: req.userData.state || null, completed: req.userData.completedToday || {} });
});

app.post('/api/state/:user', auth.auth, (req, res) => {
    const user = req.userData;
    user.state = req.body.state || null;
    
    if (req.body.completed) {
        if (!user.completedToday) user.completedToday = {};
        Object.assign(user.completedToday, req.body.completed);
        
        // Keep last 120 days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 120);
        const cutStr = cutoff.toISOString().split('T')[0];
        for (const d in user.completedToday) {
            if (d < cutStr) delete user.completedToday[d];
        }
    }
    
    if (user.state) user.state._saved = new Date().toISOString();
    db.writeUser('aura_user', user);
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
    
    db.writeUser('aura_user', user);
    res.json({ ok: true });
});

app.get('/api/history/:user', auth.auth, (req, res) => {
    res.json({ ok: true, data: req.userData.history || [] });
});

// ═══════ WAKE-UP ROUTES ═══════
app.get('/api/wakeup/status', wakeup.getStatus);
app.get('/api/wakeup/challenge', wakeup.getQuote); // Public endpoint for Siri Shortcuts challenge
app.get('/api/wakeup/quote', auth.auth, wakeup.getQuote);
app.post('/api/wakeup/verify', auth.auth, wakeup.verifyWakeup);
app.post('/api/wakeup/generate', wakeup.generateQuote);

// ═══════ DOWNLOADABLE iOS SHORTCUT (.shortcut plist with baked-in host URL) ═══════
const { buildAuraShortcut } = require('./shortcut_builder');
app.get('/api/shortcuts/download', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${proto}://${host}`;
    const plist = buildAuraShortcut(`${origin}/api/shortcuts/audit`, `${origin}/`);
    res.setHeader('Content-Type', 'application/x-plist; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="AURA-Discipline.shortcut"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(plist);
});

// ═══════ iOS SHORTCUT AUDIT (Siri-friendly, plain-text response) ═══════
app.get('/api/shortcuts/audit', async (req, res) => {
    try {
        const fakeRes = {
            _payload: null,
            json(obj) { this._payload = obj; return this; },
            status() { return this; }
        };
        await wakeup.getStatus(req, fakeRes);
        const p = fakeRes._payload || {};
        const text = p.message || 'AURA: статус недоступний.';
        const fmt = req.query.format || 'text';
        if (fmt === 'json') return res.json({ ok: true, speak: text, isAwake: !!p.isAwake, missing: p.missingTasks || [] });
        res.type('text/plain; charset=utf-8').send(text);
    } catch(e) {
        res.type('text/plain; charset=utf-8').send('AURA офлайн. Перевір з\'єднання.');
    }
});

// ═══════ iOS SHORTCUT QUICK NOTE ROUTE ═══════
app.post('/api/shortcuts/note', (req, res) => {
    const { date, text, time } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: 'Текст замітки порожній' });
    const today = date || new Date().toISOString().split('T')[0];
    const eventTime = time || new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    const user = db.readUser('aura_user') || { username: 'aura_user', wakeup: {}, completedToday: {}, state: {} };
    if (!user.state) user.state = {};
    if (!user.state.events) user.state.events = {};
    if (!user.state.events[today]) user.state.events[today] = [];
    
    user.state.events[today].push({
        id: Date.now().toString(),
        time: eventTime,
        text: text,
        type: 'other'
    });
    
    user.state._saved = new Date().toISOString();
    db.writeUser('aura_user', user);
    res.json({ ok: true, message: 'Замітку успішно записано у розклад!' });
});

// ═══════ iOS SHORTCUT WEIGHT UPDATE ROUTE ═══════
app.post('/api/shortcuts/weight', (req, res) => {
    const { weight } = req.body;
    const wt = parseFloat(weight);
    if (isNaN(wt) || wt <= 0) return res.status(400).json({ ok: false, error: 'Некоректна вага' });
    
    const user = db.readUser('aura_user') || { username: 'aura_user', wakeup: {}, completedToday: {}, state: {} };
    if (!user.state) user.state = {};
    if (!user.state.profile) user.state.profile = {};
    user.state.profile.weight = wt;

    if (!Array.isArray(user.state.weightHistory)) user.state.weightHistory = [];
    const today = new Date().toISOString().split('T')[0];
    const last = user.state.weightHistory[user.state.weightHistory.length - 1];
    if (last && last.date === today) last.weight = wt;
    else user.state.weightHistory.push({ date: today, weight: wt });
    if (user.state.weightHistory.length > 180) user.state.weightHistory = user.state.weightHistory.slice(-180);

    user.state._saved = new Date().toISOString();
    db.writeUser('aura_user', user);
    res.json({ ok: true, message: `Вагу оновлено: ${wt} кг!` });
});

// ═══════ iOS SHORTCUT QUICK MEAL ROUTE ═══════
app.post('/api/shortcuts/meal', (req, res) => {
    const { name, protein, calories, carbs, fat, type } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'Назва страви обов\'язкова' });
    
    const today = new Date().toISOString().split('T')[0];
    const user = db.readUser('aura_user') || { username: 'aura_user', wakeup: {}, completedToday: {}, state: {} };
    if (!user.state) user.state = {};
    if (!user.state.meals) user.state.meals = {};
    if (!user.state.meals[today]) user.state.meals[today] = [];
    
    user.state.meals[today].push({
        id: Date.now().toString(),
        type: type || 'snack',
        name,
        calories: parseInt(calories) || 0,
        protein: parseInt(protein) || 0,
        fat: parseInt(fat) || 0,
        carbs: parseInt(carbs) || 0
    });
    
    user.state._saved = new Date().toISOString();
    db.writeUser('aura_user', user);
    res.json({ ok: true, message: 'Страву додано до щоденника харчування!' });
});

// ═══════ iOS SHORTCUT WATER LOG ═══════
app.post('/api/shortcuts/water', (req, res) => {
    const ml = parseInt(req.body.ml);
    if (!ml || ml <= 0 || ml > 5000) return res.status(400).json({ ok: false, error: 'ml має бути 1..5000' });

    const today = new Date().toISOString().split('T')[0];
    const user = db.readUser('aura_user') || { username: 'aura_user', state: {}, completedToday: {} };
    if (!user.state) user.state = {};
    if (!user.state.water) user.state.water = {};
    if (!Array.isArray(user.state.water[today])) user.state.water[today] = [];

    const time = req.body.time || new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false });
    user.state.water[today].push({ id: Date.now().toString(), time, ml });

    const target = (user.state.profile && parseInt(user.state.profile.waterTarget)) || 2500;
    const total = user.state.water[today].reduce((s, e) => s + (parseInt(e.ml) || 0), 0);

    if (!user.completedToday) user.completedToday = {};
    if (!user.completedToday[today]) user.completedToday[today] = [];
    if (total >= target && !user.completedToday[today].includes('water')) {
        user.completedToday[today].push('water');
    }

    user.state._saved = new Date().toISOString();
    db.writeUser('aura_user', user);
    res.json({ ok: true, total, target, remaining: Math.max(0, target - total), message: `Записав ${ml} мл. Всього ${total} з ${target}.` });
});

// ═══════ iOS SHORTCUT QUICK HABIT TOGGLE ROUTE ═══════
app.post('/api/shortcuts/toggle', (req, res) => {
    const { habitId, done } = req.body;
    if (!habitId) return res.status(400).json({ ok: false, error: 'habitId обов\'язковий' });
    
    const today = new Date().toISOString().split('T')[0];
    const user = db.readUser('aura_user') || { username: 'aura_user', wakeup: {}, completedToday: {}, state: {} };
    if (!user.state) user.state = {};
    if (!user.state.habits) user.state.habits = {};
    if (!user.state.habits[today]) {
        user.state.habits[today] = { mewing_morning: false, mewing_evening: false, duolingo: false, wash_teeth: false, vacuum: [0, 0, 0, 0, 0] };
    }
    
    const targetStatus = done !== undefined ? !!done : !user.state.habits[today][habitId];
    user.state.habits[today][habitId] = targetStatus;
    
    if (!user.completedToday) user.completedToday = {};
    if (!user.completedToday[today]) user.completedToday[today] = [];
    
    if (targetStatus) {
        if (!user.completedToday[today].includes(habitId)) {
            user.completedToday[today].push(habitId);
        }
    } else {
        user.completedToday[today] = user.completedToday[today].filter(id => id !== habitId);
    }
    
    user.state._saved = new Date().toISOString();
    db.writeUser('aura_user', user);
    res.json({ ok: true, message: `Звичку ${habitId} позначено як ${targetStatus ? 'виконану' : 'невиконану'}!` });
});

// ═══════ NUTRITION ROUTES ═══════
app.post('/api/nutrition/recipe', auth.auth, nutrition.generateRecipe);

// serve SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    const localIp = addresses.length > 0 ? addresses[0] : 'YOUR_COMPUTER_IP';

    console.log(`\n  🔥 AURA v2.1 SINGLE-USER SERVER — http://localhost:${PORT}`);
    console.log(`  Local IP for iPhone Shortcuts: http://${localIp}:${PORT}`);
    console.log(`  Redis: ${db.redisAvailable() ? '✅ Connected' : '⚠️  File-based fallback'}`);
    console.log(`  Gemini: ${gemini.GEMINI_KEY ? '✅ Configured' : '⚠️  Not configured'}`);
    console.log(`  Data folder: ${db.DATA_DIR}\n`);
});

module.exports = app;
