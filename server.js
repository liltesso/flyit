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
app.get('/api/wakeup/quote', auth.auth, wakeup.getQuote);
app.post('/api/wakeup/verify', auth.auth, wakeup.verifyWakeup);
app.post('/api/wakeup/generate', wakeup.generateQuote);

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
    console.log(`\n  🔥 AURA v2.1 SINGLE-USER SERVER — http://localhost:${PORT}`);
    console.log(`  Redis: ${db.redisAvailable() ? '✅ Connected' : '⚠️  File-based fallback'}`);
    console.log(`  Gemini: ${gemini.GEMINI_KEY ? '✅ Configured' : '⚠️  Not configured'}`);
    console.log(`  Data folder: ${db.DATA_DIR}\n`);
});

module.exports = app;
