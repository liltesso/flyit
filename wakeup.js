const fs = require('fs');
const path = require('path');
const db = require('./db');
const gemini = require('./gemini');
const levenshtein = require('./levenshtein');

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

/**
 * GET /api/wakeup/status?user=USERNAME
 */
async function getStatus(req, res) {
    const username = req.query.user;
    if (!username) return res.json({ isAwake: false, timestamp: null });
    
    const today = todayStr();
    const redisKey = `aura:wakeup:${db.safeN(username)}:${today}`;
    
    if (db.redisAvailable()) {
        try {
            const val = await db.redisGet(redisKey);
            if (val) {
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                return res.json({ isAwake: !!parsed.isAwake, timestamp: parsed.verifiedAt || null });
            }
        } catch(e) {}
    }
    
    // File system fallback
    const user = db.readUser(username);
    if (user && user.wakeup && user.wakeup[today]) {
        return res.json({ isAwake: !!user.wakeup[today].isAwake, timestamp: user.wakeup[today].verifiedAt || null });
    }
    
    res.json({ isAwake: false, timestamp: null });
}

/**
 * GET /api/wakeup/quote?user=USERNAME
 */
async function getQuote(req, res) {
    const today = todayStr();
    
    if (db.redisAvailable()) {
        try {
            const cached = await db.redisGet(`aura:quote:${today}`);
            if (cached) {
                const q = typeof cached === 'string' ? JSON.parse(cached) : cached;
                return res.json({ ok: true, quote: q.quote, author: q.author });
            }
        } catch(e) {}
    }
    
    const quotesFile = path.join(db.DATA_DIR, 'db_quotes.json');
    if (fs.existsSync(quotesFile)) {
        try {
            const quotes = JSON.parse(fs.readFileSync(quotesFile, 'utf8'));
            if (quotes[today]) {
                return res.json({ ok: true, quote: quotes[today].quote, author: quotes[today].author });
            }
        } catch(e) {}
    }
    
    // Auto-generate today's quote on-the-fly
    try {
        const result = await gemini.callGemini(
            `Згенеруй коротку, глибоку цитату про дисципліну, силу волі або самовдосконалення від одного з цих авторів: Марк Аврелій, Сенека, Епіктет, Девід Гоггінс. Цитата має бути українською мовою, 1-3 речення. Відповідай ТІЛЬКИ JSON без markdown: { "quote": "текст цитати", "author": "ім'я автора" }`
        );
        
        if (db.redisAvailable()) {
            await db.redisSet(`aura:quote:${today}`, result, 86400);
        }
        
        try {
            const quotes = fs.existsSync(quotesFile) ? JSON.parse(fs.readFileSync(quotesFile, 'utf8')) : {};
            quotes[today] = result;
            fs.writeFileSync(quotesFile, JSON.stringify(quotes, null, 2), 'utf8');
        } catch(e) {}
        
        res.json({ ok: true, quote: result.quote, author: result.author });
    } catch(err) {
        res.json({
            ok: true,
            quote: 'Перешкода на шляху стає шляхом. Кожна труднощі — це можливість для зростання.',
            author: 'Марк Аврелій'
        });
    }
}

/**
 * POST /api/wakeup/verify
 */
async function verifyWakeup(req, res) {
    const { username, typedQuote, reflection, originalQuote } = req.body;
    if (!typedQuote || !reflection || !originalQuote) {
        return res.status(400).json({ ok: false, error: 'Усі поля введення обов\'язкові для валідації' });
    }
    
    const user = db.readUser(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Користувача не знайдено' });
    
    // Levenshtein validation
    const cleanTyped = typedQuote.trim().toLowerCase();
    const cleanOriginal = originalQuote.trim().toLowerCase();
    const dist = levenshtein(cleanTyped, cleanOriginal);
    const threshold = Math.floor(cleanOriginal.length * 0.15);
    
    if (dist > threshold) {
        return res.json({
            ok: false,
            error: `Цитату передруковано неточно. Допущено помилок: ${dist} (ліміт: ${threshold}). Спробуй ще раз.`
        });
    }
    
    // Reflection structure validation
    const sentences = (reflection.match(/[.!?…]+/g) || []).length;
    if (sentences < 2 || reflection.trim().length < 40) {
        return res.json({ ok: false, error: 'Напишіть щонайменше 2 розгорнутих речення (мінімум 40 символів).' });
    }
    
    // Reflection semantic AI validation
    try {
        const validation = await gemini.callGemini(
            `Ти — суворий валідатор тексту. Проаналізуй наступний текст-рефлексію і визнач, чи це осмислений текст (людина дійсно розмірковує над цитатою), чи це безглуздий набір символів/слів. Відповідай ТІЛЬКИ JSON: { "valid": true/false, "reason": "пояснення" }. Текст рефлексії: "${reflection.replace(/"/g, '\\"')}". Цитата, на яку вона написана: "${originalQuote.replace(/"/g, '\\"')}".`
        );
        
        if (validation.valid) {
            const today = todayStr();
            const wakeupData = { isAwake: true, verifiedAt: new Date().toISOString(), quote: originalQuote };
            
            if (db.redisAvailable()) {
                await db.redisSet(`aura:wakeup:${db.safeN(username)}:${today}`, wakeupData, 86400);
            }
            
            if (!user.wakeup) user.wakeup = {};
            user.wakeup[today] = wakeupData;
            db.writeUser(username, user);
            
            return res.json({ ok: true, isAwake: true, aiValidation: validation });
        } else {
            return res.json({ ok: false, isAwake: false, aiValidation: validation });
        }
    } catch(err) {
        // Safe fallback in case of Gemini outages
        if (reflection.trim().length >= 60 && sentences >= 2) {
            const today = todayStr();
            const wakeupData = { isAwake: true, verifiedAt: new Date().toISOString(), quote: originalQuote };
            
            if (db.redisAvailable()) {
                await db.redisSet(`aura:wakeup:${db.safeN(username)}:${today}`, wakeupData, 86400);
            }
            
            if (!user.wakeup) user.wakeup = {};
            user.wakeup[today] = wakeupData;
            db.writeUser(username, user);
            
            return res.json({ ok: true, isAwake: true, aiValidation: { valid: true, reason: 'Локальна валідація пройдена (Gemini API недоступний)' } });
        }
        return res.status(500).json({ ok: false, error: 'Помилка валідації AI: ' + err.message });
    }
}

/**
 * POST /api/wakeup/generate (Cron Task)
 */
async function generateQuote(req, res) {
    try {
        const result = await gemini.callGemini(
            `Згенеруй коротку, глибоку цитату про дисципліну, силу волі або самовдосконалення від одного з цих авторів: Марк Аврелій, Сенека, Епіктет, Девід Гоггінс. Цитата має бути українською мовою, 1-3 речення. Відповідай ТІЛЬКИ JSON без markdown: { "quote": "текст цитати", "author": "ім'я автора" }`
        );
        
        const today = todayStr();
        if (db.redisAvailable()) {
            await db.redisSet(`aura:quote:${today}`, result, 86400);
        }
        
        const quotesFile = path.join(db.DATA_DIR, 'db_quotes.json');
        try {
            const quotes = fs.existsSync(quotesFile) ? JSON.parse(fs.readFileSync(quotesFile, 'utf8')) : {};
            quotes[today] = result;
            fs.writeFileSync(quotesFile, JSON.stringify(quotes, null, 2), 'utf8');
        } catch(e) {}
        
        res.json({ ok: true, quote: result.quote, author: result.author });
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
