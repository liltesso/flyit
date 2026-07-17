const fs = require('fs');
const path = require('path');
const db = require('./db');
const gemini = require('./gemini');
const levenshtein = require('./levenshtein');

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

/**
 * GET /api/wakeup/status — Lightweight endpoint for iOS Shortcut (no auth required)
 */
async function getStatus(req, res) {
    const today = todayStr();
    const user = db.readUser('aura_user');
    
    let isAwake = false;
    let verifiedAt = null;
    
    // Check if awake status in Redis
    if (db.redisAvailable()) {
        try {
            const val = await db.redisGet(`aura:wakeup:aura_user:${today}`);
            if (val) {
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                isAwake = !!parsed.isAwake;
                verifiedAt = parsed.verifiedAt || null;
            }
        } catch(e) {}
    }
    
    // Check in file fallback if not found in Redis
    if (!isAwake && user && user.wakeup && user.wakeup[today]) {
        isAwake = !!user.wakeup[today].isAwake;
        verifiedAt = user.wakeup[today].verifiedAt || null;
    }
    
    // Audit daily tasks and check what is missing
    const missing = [];
    if (!isAwake) {
        missing.push("Пробудження та рефлексія");
    }
    
    if (user && user.state) {
        const habits = user.state.habits?.[today] || {};
        if (!habits.wash_teeth) missing.push("Вмитися та почистити зуби");
        if (!habits.mewing_morning) missing.push("М'юїнг (Ранок)");
        if (!habits.duolingo) missing.push("Duolingo");
        
        const vacuum = habits.vacuum || [0, 0, 0, 0, 0];
        if (vacuum.some(v => v === 0)) {
            missing.push("Вакуум живота (не всі 5 підходів)");
        }
        
        const sprints = user.state.sprints?.[today] || {};
        const sprintNames = {
            ukrainian_1: "Українська (Урок 1)",
            ukrainian_2: "Українська (Урок 2)",
            english_1: "Англійська (Урок 1)",
            english_2: "Англійська (Урок 2)",
            history_1: "Історія України (Урок 1)",
            history_2: "Історія України (Урок 2)",
            guitar_1: "Гітара (Сесія 1)",
            guitar_2: "Гітара (Сесія 2)"
        };
        
        for (const [id, name] of Object.entries(sprintNames)) {
            if (!sprints[id] || !sprints[id].completed) {
                missing.push(name);
            }
        }
    }
    
    let auditMessage = "";
    if (missing.length === 0) {
        auditMessage = "Ідеальна дисципліна! Всі завдання на сьогодні виконано. Ти — машина!";
    } else {
        auditMessage = `Порушено режим! Невиконані завдання: ${missing.join(", ")}. Зберися і заверши це!`;
    }
    
    res.json({
        isAwake,
        timestamp: verifiedAt,
        missingTasks: missing,
        message: auditMessage
    });
}

const stoicQuotes = require('./stoic_quotes');

/**
 * GET /api/wakeup/quote — Fetch quote of the day (200 days sequence)
 */
async function getQuote(req, res) {
    try {
        const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % 200;
        const selected = stoicQuotes[dayIndex];
        res.json({ ok: true, quote: selected.quote, author: selected.author });
    } catch(err) {
        res.json({
            ok: true,
            quote: 'Перешкода на шляху стає шляхом. Кожна труднощі — це можливість для зростання.',
            author: 'Марк Аврелій'
        });
    }
}

/**
 * POST /api/wakeup/verify — Validate typed quote + reflection (single user)
 */
async function verifyWakeup(req, res) {
    const { typedQuote, reflection, originalQuote } = req.body;
    if (!typedQuote || !reflection || !originalQuote) {
        return res.status(400).json({ ok: false, error: 'Всі поля обов\'язкові' });
    }
    
    let user = db.readUser('aura_user');
    if (!user) {
        user = { username: 'aura_user', wakeup: {}, completedToday: {} };
    }
    
    const cleanTyped = typedQuote.trim().toLowerCase();
    const cleanOriginal = originalQuote.trim().toLowerCase();
    const dist = levenshtein(cleanTyped, cleanOriginal);
    const threshold = Math.floor(cleanOriginal.length * 0.15);
    
    if (dist > threshold) {
        return res.json({
            ok: false,
            error: `Цитату передруковано неточно. Помилок: ${dist} (допустимо: ${threshold}). Спробуй ще раз.`
        });
    }
    
    const sentences = (reflection.match(/[.!?…]+/g) || []).length;
    if (sentences < 2 || reflection.trim().length < 40) {
        return res.json({ ok: false, error: 'Напишіть рефлексію з щонайменше 2 речень (від 40 символів).' });
    }
    
    try {
        const validation = await gemini.callGemini(
            `Ти — суворий валідатор тексту. Проаналізуй наступний текст-рефлексію і визнач, чи це осмислений текст (людина дійсно розмірковує над цитатою), чи це безглуздий набір символів/слів. Відповідай ТІЛЬКИ JSON: { "valid": true/false, "reason": "пояснення" }. Текст рефлексії: "${reflection.replace(/"/g, '\\"')}". Цитата, на яку вона написана: "${originalQuote.replace(/"/g, '\\"')}".`
        );
        
        if (validation.valid) {
            const today = todayStr();
            const wakeupData = { isAwake: true, verifiedAt: new Date().toISOString(), quote: originalQuote };
            
            if (db.redisAvailable()) {
                await db.redisSet(`aura:wakeup:aura_user:${today}`, wakeupData, 86400);
            }
            
            if (!user.wakeup) user.wakeup = {};
            user.wakeup[today] = wakeupData;
            
            if (!user.completedToday) user.completedToday = {};
            if (!user.completedToday[today]) user.completedToday[today] = [];
            if (!user.completedToday[today].includes('wakeup')) {
                user.completedToday[today].push('wakeup');
            }
            
            db.writeUser('aura_user', user);
            return res.json({ ok: true, isAwake: true, aiValidation: validation });
        } else {
            return res.json({ ok: false, isAwake: false, aiValidation: validation });
        }
    } catch(err) {
        const today = todayStr();
        const wakeupData = { isAwake: true, verifiedAt: new Date().toISOString(), quote: originalQuote };
        
        if (db.redisAvailable()) {
            await db.redisSet(`aura:wakeup:aura_user:${today}`, wakeupData, 86400);
        }
        
        if (!user.wakeup) user.wakeup = {};
        user.wakeup[today] = wakeupData;
        
        if (!user.completedToday) user.completedToday = {};
        if (!user.completedToday[today]) user.completedToday[today] = [];
        if (!user.completedToday[today].includes('wakeup')) {
            user.completedToday[today].push('wakeup');
        }
        
        db.writeUser('aura_user', user);
        return res.json({ ok: true, isAwake: true, aiValidation: { valid: true, reason: 'Локальна валідація пройдена (Gemini API офлайн)' } });
    }
}

async function generateQuote(req, res) {
    try {
        const randIndex = Math.floor(Math.random() * 200);
        const selected = stoicQuotes[randIndex];
        res.json({ ok: true, quote: selected.quote, author: selected.author });
    } catch(err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}

module.exports = {
    getStatus,
    getQuote,
    verifyWakeup,
    generateQuote
};
