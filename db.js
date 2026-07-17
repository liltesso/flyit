const fs = require('fs');
const path = require('path');

// Initialize database directory (save in root as db_*.json for flat structure)
const DATA_DIR = process.env.VERCEL ? '/tmp' : __dirname;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

function redisAvailable() {
    return !!(REDIS_URL && REDIS_TOKEN);
}

/**
 * Get value from Upstash Redis REST API
 */
async function redisGet(key) {
    if (!redisAvailable()) return null;
    try {
        const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
        });
        const data = await res.json();
        return data.result || null;
    } catch(e) {
        console.error('Redis GET error:', e.message);
        return null;
    }
}

/**
 * Set value in Upstash Redis REST API
 */
async function redisSet(key, value, exSeconds) {
    if (!redisAvailable()) return false;
    try {
        const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        let url = `${REDIS_URL}/set/${encodeURIComponent(key)}`;
        if (exSeconds) url += `?EX=${exSeconds}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${REDIS_TOKEN}`,
                'Content-Type': 'text/plain'
            },
            body: val
        });
        const data = await res.json();
        return data.result === 'OK';
    } catch(e) {
        console.error('Redis SET error:', e.message);
        return false;
    }
}

/**
 * Fallback File DB Helper: Clean username
 */
function safeN(n) {
    return String(n || '').toLowerCase().replace(/[^a-z0-9а-яіїєґ_-]/gi, '_').substring(0, 40) || 'anon';
}

/**
 * Fallback File DB Helper: Get file path
 */
function userFile(n) {
    return path.join(DATA_DIR, 'db_user_' + safeN(n) + '.json');
}

/**
 * Read user object from flat local JSON file
 */
function readUser(name) {
    const f = userFile(name);
    if (!fs.existsSync(f)) return null;
    try {
        return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch(e) {
        console.error(`Error reading user file ${f}:`, e.message);
        return null;
    }
}

/**
 * Write user object to flat local JSON file
 */
function writeUser(name, data) {
    const f = userFile(name);
    try {
        fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch(e) {
        console.error(`Error writing user file ${f}:`, e.message);
        return false;
    }
}

module.exports = {
    redisAvailable,
    redisGet,
    redisSet,
    safeN,
    readUser,
    writeUser,
    DATA_DIR
};
