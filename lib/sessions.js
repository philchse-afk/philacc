// lib/sessions.js
// -----------------------------------------------------------------------
// Sessions en mémoire, identifiées par un cookie httpOnly opaque et
// aléatoire (aucun contenu utilisateur dans le cookie lui-même — juste un
// identifiant, comme pour une session PHP/Express classique).
//
// Les sessions sont perdues si le serveur redémarre : pour une poignée
// d'utilisateurs c'est un compromis largement acceptable (il suffit de se
// reconnecter), et ça évite d'avoir à gérer un fichier de sessions à
// nettoyer. Facile à changer plus tard si besoin.
// -----------------------------------------------------------------------

const crypto = require('crypto');

const SESSION_COOKIE = 'accords_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

const sessions = new Map(); // token -> { userId, expires }

function createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
    return token;
}

function getSession(token) {
    if (!token) return null;
    const s = sessions.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) {
        sessions.delete(token);
        return null;
    }
    return s;
}

function destroySession(token) {
    sessions.delete(token);
}

function parseCookies(req) {
    const header = req.headers.cookie;
    const out = {};
    if (!header) return out;
    header.split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        out[key] = decodeURIComponent(val);
    });
    return out;
}

function setSessionCookie(res, token, { secure }) {
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res, { secure }) {
    const parts = [
        `${SESSION_COOKIE}=`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=0',
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function getTokenFromRequest(req) {
    return parseCookies(req)[SESSION_COOKIE];
}

module.exports = {
    createSession,
    getSession,
    destroySession,
    getTokenFromRequest,
    setSessionCookie,
    clearSessionCookie,
};
