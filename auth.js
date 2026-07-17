const crypto = require('crypto');
const db = require('./db');

// Helper methods for token and password hashing
function salt() {
    return crypto.randomBytes(16).toString('hex');
}

function hash(pw, s) {
    return crypto.pbkdf2Sync(pw, s, 10000, 64, 'sha512').toString('hex');
}

function token() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Express Middleware to validate auth token
 */
function auth(req, res, next) {
    const t = req.headers['x-token'];
    if (!t) return res.status(401).json({ ok: false, error: 'Token missing from headers' });
    
    const uname = req.params.user || req.query.user || (req.body && req.body.username);
    if (!uname) return res.status(400).json({ ok: false, error: 'Username missing' });
    
    const user = db.readUser(uname);
    if (!user) return res.status(401).json({ ok: false, error: 'User profile not found' });
    
    if (!user.tokens || !user.tokens.includes(t)) {
        return res.status(401).json({ ok: false, error: 'Invalid or expired token session' });
    }
    
    req.userData = user;
    req.userName = uname;
    next();
}

module.exports = {
    salt,
    hash,
    token,
    auth
};
