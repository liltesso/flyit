const db = require('./db');

/**
 * Single-user Auth Middleware: always injects the default user profile
 */
function auth(req, res, next) {
    req.userName = 'aura_user';
    let user = db.readUser('aura_user');
    
    // Auto-initialize profile if it doesn't exist
    if (!user) {
        user = {
            username: 'aura_user',
            state: null,
            history: [],
            completedToday: {},
            wakeup: {},
            events: {} // date -> [{ id, time, text }]
        };
        db.writeUser('aura_user', user);
    }
    
    req.userData = user;
    next();
}

module.exports = {
    auth
};
