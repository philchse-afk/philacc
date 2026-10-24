// servAcc.js — Serveur de fichiers statiques AVEC authentification
// -----------------------------------------------------------------------
// Remplace l'ancien servAcc.js (port 5500) : sert les fichiers statiques
// exactement comme avant, ET expose une API (/api/...) pour les comptes
// utilisateurs, l'approbation admin, et les répertoires personnels.
//
// Stockage : fichiers locaux par défaut, ou Upstash Redis automatiquement
// si UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN sont définies (voir
// lib/storage.js) — utile pour un déploiement en ligne (Render, etc.) où le
// disque local n'est pas garanti persistant.
//
// Ne touche pas à server.js (port 3001, /check-files pour les jauges +
// ouverture Guitar Pro) : les deux serveurs restent séparés, sur des
// ports différents, comme dans votre projet actuel.
//
// SYNCHRONISATION MULTI-APPAREILS (WebSocket /sync) : l'écran du PC qui héberge
// le serveur (le « maître ») est diffusé en direct sur les autres appareils du
// réseau (voir js/sync.js). Nécessite : npm install ws
// Variable optionnelle SYNC_MASTER_IPS="192.168.1.50,..." pour désigner un autre
// appareil comme maître (par défaut : le navigateur ouvert sur le PC serveur).
//
// Lancement : node servAcc.js
// Variables d'env optionnelles : PORT (défaut 5500), COOKIE_SECURE=1 quand
// servi en HTTPS (recommandé dès que l'appli est exposée sur Internet),
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (persistance en ligne).
// -----------------------------------------------------------------------

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const users = require('./lib/users-store');
const sessions = require('./lib/sessions');
const repertoire = require('./lib/repertoire');
const storage = require('./lib/storage');
const media = require('./lib/media');
const os = require('os');

// La synchro d'écrans n'a de sens qu'en local (réseau local, PC « maître »).
// Elle est donc DÉSACTIVÉE en mode web (Render : variable RENDER définie) :
// derrière le proxy de l'hébergeur, aucun navigateur ne serait reconnu comme
// maître, et tous les visiteurs recevraient une page sans l'appli. On peut aussi
// la couper en local avec la variable d'environnement SYNC=off.
const SYNC_OFF_REASON = process.env.RENDER ? 'mode web (Render)'
    : /^(0|false|off|no)$/i.test((process.env.SYNC || '').trim()) ? 'variable SYNC=off'
    : '';

// Module "ws" facultatif : s'il manque, tout fonctionne comme avant, sans synchro.
let WebSocketServer = null, WebSocket = null;
if (!SYNC_OFF_REASON) {
    try { ({ WebSocketServer, WebSocket } = require('ws')); }
    catch (_) { console.warn('⚠ Module "ws" absent : synchronisation désactivée (lancez : npm install ws)'); }
}
const SYNC_ENABLED = !!WebSocketServer;

const PORT = process.env.PORT || 5500;
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const PROJECT_ROOT = path.join(__dirname); // adapter si index.html/app.js sont ailleurs

// -------------------------------------------------------------------
// Repère visuel de la source de l'application (couleur de fond)
//  - lancée depuis un dossier "philacc" en local  -> vert pâle
//  - hébergée sur Render (variable RENDER définie)   -> orange pâle
//  - autre (ex. un ancien dossier wwwroot)           -> couleur d'origine
// Forçage possible : variable d'environnement APP_BG_COLOR (toute couleur
// CSS, ex. "#e3f0ff"), ou APP_BG_COLOR=none pour désactiver.
// -------------------------------------------------------------------
function detectEnvColor() {
    const forced = (process.env.APP_BG_COLOR || '').trim();
    if (forced) return /^none$/i.test(forced) ? '' : forced.replace(/[^#a-zA-Z0-9(),.%\s-]/g, '');
    if (process.env.RENDER) return '#ffe8cc';                                   // orange pâle : site en ligne
    if (path.basename(PROJECT_ROOT).toLowerCase() === 'philacc') return '#dff3df'; // vert pâle : local philacc
    return '';
}
const ENV_COLOR = detectEnvColor();

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

// -------------------------------------------------------------------
// Anti brute-force simple sur /api/auth/login (par IP+username)
// -------------------------------------------------------------------
const loginAttempts = new Map(); // key -> { count, blockedUntil }
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 5 * 60 * 1000;

function loginKey(req, username) {
    return `${req.socket.remoteAddress}:${users.normalizeUsername(username)}`;
}
function isBlocked(key) {
    const rec = loginAttempts.get(key);
    return rec && rec.blockedUntil && rec.blockedUntil > Date.now();
}
function registerFailedAttempt(key) {
    const rec = loginAttempts.get(key) || { count: 0 };
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
        rec.blockedUntil = Date.now() + BLOCK_MS;
        rec.count = 0;
    }
    loginAttempts.set(key, rec);
}
function clearAttempts(key) {
    loginAttempts.delete(key);
}

// -------------------------------------------------------------------
// Helpers HTTP
// -------------------------------------------------------------------
function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        let size = 0;
        const MAX = 5 * 1024 * 1024; // 5 Mo — largement suffisant pour une chanson en JSON
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX) { reject(new Error('Corps de requête trop volumineux.')); req.destroy(); return; }
            data += chunk;
        });
        req.on('end', () => {
            if (!data) return resolve({});
            try { resolve(JSON.parse(data)); }
            catch (err) { reject(new Error('JSON invalide.')); }
        });
        req.on('error', reject);
    });
}

/** Récupère l'utilisateur courant à partir du cookie de session, ou null. */
async function getCurrentUser(req) {
    const token = sessions.getTokenFromRequest(req);
    const session = sessions.getSession(token);
    if (!session) return null;
    const user = await users.findById(session.userId);
    if (!user) return null;
    return user;
}

async function requireApproved(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJson(res, 401, { error: 'Non connecté.' }); return null; }
    if (user.status !== 'approved') { sendJson(res, 403, { error: 'Compte en attente d\'approbation.' }); return null; }
    return user;
}

async function requireAdmin(req, res) {
    const user = await requireApproved(req, res);
    if (!user) return null;
    if (user.role !== 'admin') { sendJson(res, 403, { error: 'Réservé à l\'administrateur.' }); return null; }
    return user;
}

// -------------------------------------------------------------------
// Routes API
// -------------------------------------------------------------------
async function handleApi(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    // ---- Auth -----------------------------------------------------
    if (pathname === '/api/auth/register' && method === 'POST') {
        try {
            const { username, password } = await readBody(req);
            const user = await users.createUser(username, password);
            return sendJson(res, 201, {
                user,
                message: user.status === 'approved'
                    ? 'Compte administrateur créé.'
                    : 'Compte créé, en attente d\'approbation par l\'administrateur.',
            });
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
        try {
            const { username, password } = await readBody(req);
            const key = loginKey(req, username);
            if (isBlocked(key)) {
                return sendJson(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
            }
            const user = await users.verifyLogin(username, password);
            if (!user) {
                registerFailedAttempt(key);
                return sendJson(res, 401, { error: 'Identifiants incorrects.' });
            }
            if (user.status === 'pending') {
                return sendJson(res, 403, { error: 'Votre compte est en attente d\'approbation par l\'administrateur.' });
            }
            if (user.status === 'rejected') {
                return sendJson(res, 403, { error: 'Votre demande de compte a été refusée.' });
            }
            clearAttempts(key);
            const token = sessions.createSession(user.id);
            sessions.setSessionCookie(res, token, { secure: COOKIE_SECURE });
            return sendJson(res, 200, { user: users._publicView(user) });
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
        const token = sessions.getTokenFromRequest(req);
        if (token) sessions.destroySession(token);
        sessions.clearSessionCookie(res, { secure: COOKIE_SECURE });
        return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/change-password' && method === 'POST') {
        const user = await getCurrentUser(req);
        if (!user) return sendJson(res, 401, { error: 'Non connecté.' });
        try {
            const { oldPassword, newPassword } = await readBody(req);
            const updated = await users.changeOwnPassword(user.id, oldPassword, newPassword);
            return sendJson(res, 200, { user: updated });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
        const user = await getCurrentUser(req);
        if (!user) return sendJson(res, 200, { user: null });
        return sendJson(res, 200, { user: users._publicView(user) });
    }

    // ---- Admin ------------------------------------------------------
    if (pathname === '/api/admin/users' && method === 'GET') {
        const admin = await requireAdmin(req, res); if (!admin) return;
        return sendJson(res, 200, { users: await users.listUsers() });
    }

    let m;
    if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/approve$/)) && method === 'POST') {
        const admin = await requireAdmin(req, res); if (!admin) return;
        try {
            const updated = await users.setStatus(m[1], 'approved');
            await repertoire.ensureUserRepertoire(updated.username);
            return sendJson(res, 200, { user: updated });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reject$/)) && method === 'POST') {
        const admin = await requireAdmin(req, res); if (!admin) return;
        try { return sendJson(res, 200, { user: await users.setStatus(m[1], 'rejected') }); }
        catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/)) && method === 'POST') {
        const admin = await requireAdmin(req, res); if (!admin) return;
        try {
            const { role } = await readBody(req);
            return sendJson(res, 200, { user: await users.setRole(m[1], role) });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/)) && method === 'POST') {
        const admin = await requireAdmin(req, res); if (!admin) return;
        try {
            const tempPassword = await users.resetPassword(m[1]);
            return sendJson(res, 200, { tempPassword });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)$/)) && method === 'DELETE') {
        const admin = await requireAdmin(req, res); if (!admin) return;
        if (m[1] === admin.id) return sendJson(res, 400, { error: 'Impossible de supprimer votre propre compte admin.' });
        try { await users.deleteUser(m[1]); return sendJson(res, 200, { ok: true }); }
        catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    // ---- Répertoire maître (lecture seule) ---------------------------
    if (pathname === '/api/repertoire/master/index' && method === 'GET') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            return sendJson(res, 200, await repertoire.getMasterIndex());
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if (pathname === '/api/repertoire/master/song' && method === 'GET') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            const song = await repertoire.getMasterSong(url.searchParams.get('file'));
            if (!song) return sendJson(res, 404, { error: 'Chanson introuvable.' });
            return sendJson(res, 200, song);
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if (pathname === '/api/repertoire/master/song' && method === 'DELETE') {
        const admin = await requireAdmin(req, res); if (!admin) return;
        try {
            await repertoire.deleteMasterSong(url.searchParams.get('file'));
            return sendJson(res, 200, { ok: true });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    // ---- Enregistrement d'une chanson : répertoire maître pour l'admin,
    // répertoire personnel pour tout le monde d'autre — même mécanisme des
    // deux côtés (voir repertoire.saveSongAndIndexEntry).
    if (pathname === '/api/repertoire/song' && method === 'PUT') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            const file = url.searchParams.get('file');
            const { songData, indexEntry } = await readBody(req);
            await repertoire.saveSongAndIndexEntry({
                isAdmin: user.role === 'admin',
                username: user.username,
                filename: file,
                songData,
                indexEntry,
            });
            return sendJson(res, 200, { ok: true });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    // ---- Suppression d'une chanson : répertoire maître pour l'admin,
    // répertoire personnel pour tout le monde d'autre — pendant de
    // /api/repertoire/song (PUT).
    if (pathname === '/api/repertoire/song' && method === 'DELETE') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            await repertoire.deleteSongEntry({
                isAdmin: user.role === 'admin',
                username: user.username,
                filename: url.searchParams.get('file'),
            });
            return sendJson(res, 200, { ok: true });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    // ---- Répertoire personnel -----------------------------------------
    if (pathname === '/api/repertoire/mine/index' && method === 'GET') {
        const user = await requireApproved(req, res); if (!user) return;
        return sendJson(res, 200, await repertoire.getUserIndex(user.username));
    }

    if (pathname === '/api/repertoire/mine/index' && method === 'PUT') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            const body = await readBody(req);
            await repertoire.saveUserIndex(user.username, body);
            return sendJson(res, 200, { ok: true });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if (pathname === '/api/repertoire/mine/song' && method === 'GET') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            const song = await repertoire.getUserSong(user.username, url.searchParams.get('file'));
            if (!song) return sendJson(res, 404, { error: 'Chanson introuvable.' });
            return sendJson(res, 200, song);
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if (pathname === '/api/repertoire/mine/song' && method === 'DELETE') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            await repertoire.deleteUserSong(user.username, url.searchParams.get('file'));
            return sendJson(res, 200, { ok: true });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if (pathname === '/api/repertoire/mine/clone' && method === 'POST') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            const { file } = await readBody(req);
            const entry = await repertoire.cloneFromMaster(user.username, file);
            return sendJson(res, 200, { entry });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    if (pathname === '/api/repertoire/mine/clone-all' && method === 'POST') {
        const user = await requireApproved(req, res); if (!user) return;
        try {
            const index = await repertoire.cloneAllFromMaster(user.username);
            return sendJson(res, 200, { index });
        } catch (err) { return sendJson(res, 400, { error: err.message }); }
    }

    return sendJson(res, 404, { error: 'Route API inconnue.' });
}

// -------------------------------------------------------------------
// Fichiers statiques (comportement identique à servAcc.js), AVEC un
// détournement pour deux chemins précis : data/songs-index.json et
// songs/<fichier>.json. C'est tout l'intérêt de cette approche : le
// front-end (app.js) continue à faire exactement les mêmes fetch()
// qu'avant ("data/songs-index.json", "songs/xxx.json"), AUCUNE
// modification n'est nécessaire dans app.js pour la lecture.
//
//  - Si l'utilisateur connecté est l'ADMIN : répertoire maître.
//  - Si c'est un utilisateur normal (approuvé) : son répertoire personnel,
//    transparence totale pour app.js.
//  - Si personne n'est connecté / pas encore approuvé : 401/403, comme
//    pour le reste de l'API (empêche l'accès direct aux données sans
//    passer par la connexion).
// -------------------------------------------------------------------
const SONG_FILE_RE = /^\/songs\/([^/]+\.json)$/;

// -------------------------------------------------------------------
// Synchronisation : qui est le « maître » ?
//  - le navigateur ouvert sur le PC serveur (localhost OU l'IP LAN du PC),
//  - ou les IP listées dans SYNC_MASTER_IPS.
// Derrière un proxy (déploiement en ligne), personne n'est maître.
// -------------------------------------------------------------------
const normIp = ip => String(ip || '').replace(/^::ffff:/, '');
const EXTRA_MASTER_IPS = new Set((process.env.SYNC_MASTER_IPS || '').split(',').map(s => normIp(s.trim())).filter(Boolean));

function localAddresses() {
    const set = new Set(['127.0.0.1', '::1']);
    for (const list of Object.values(os.networkInterfaces())) {
        for (const i of list || []) set.add(normIp(i.address));
    }
    return set;
}
function isMasterRequest(req) {
    if (req.headers['x-forwarded-for']) return false;
    const ip = normIp(req.socket.remoteAddress);
    return EXTRA_MASTER_IPS.has(ip) || localAddresses().has(ip);
}

// Les balises <script ... data-master-only> d'index.html ne sont envoyées qu'au
// maître : les autres appareils n'exécutent pas l'appli (pas de connexion requise),
// ils reçoivent seulement l'affichage du maître.
const MASTER_ONLY_RE = /<script\b[^>]*\bdata-master-only\b[^>]*>[\s\S]*?<\/script>/gi;

function serveIndex(req, res) {
    fs.readFile(path.join(PROJECT_ROOT, 'index.html'), 'utf8', (err, html) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Fichier non trouvé : index.html');
        }
        if (SYNC_ENABLED) {
            const master = isMasterRequest(req);
            if (!master) html = html.replace(MASTER_ONLY_RE, '');
            const inject = `<script>window.SYNC_ROLE=${JSON.stringify(master ? 'master' : 'viewer')};</script>`;
            html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + inject) : inject + html;
        }
        // no-store : le contenu diffère selon l'appareil (maître / affichage)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
    });
}

async function handleStatic(req, res, url) {
    const urlPath = decodeURIComponent(url.pathname);

    // ---- Feuille de style dynamique : couleur de fond selon la source ----
    if (urlPath === '/env.css') {
        const css = ENV_COLOR
            ? `body { background-color: ${ENV_COLOR} !important; }\n#auth-overlay { background: ${ENV_COLOR} !important; }\n`
            : '/* aucune couleur d\'environnement */\n';
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(css);
    }

    // ---- Détournement : index des chansons ----
    if (urlPath === '/data/songs-index.json') {
        const user = await requireApproved(req, res); if (!user) return;
        if (user.role === 'admin') {
            try {
                const index = await repertoire.getMasterIndex();
                if (!index.length) {
                    console.warn('[songs-index] Répertoire maître vide ou introuvable.');
                }
                return sendJson(res, 200, index);
            } catch (err) {
                console.error('[songs-index] Échec de chargement du répertoire maître :', err.message);
                return sendJson(res, 500, { error: err.message });
            }
        }
        return sendJson(res, 200, await repertoire.getUserIndex(user.username));
    }

    // ---- Détournement : fichier chanson individuel ----
    const songMatch = urlPath.match(SONG_FILE_RE);
    if (songMatch) {
        const user = await requireApproved(req, res); if (!user) return;
        if (user.role === 'admin') {
            const song = await repertoire.getMasterSong(songMatch[1]);
            if (!song) {
                console.warn(`[song] Introuvable pour l'admin : ${songMatch[1]}`);
                return sendJson(res, 404, { error: 'Chanson introuvable.' });
            }
            return sendJson(res, 200, song);
        }
        const song = await repertoire.getUserSong(user.username, songMatch[1]);
        if (!song) { return sendJson(res, 404, { error: 'Chanson introuvable.' }); }
        return sendJson(res, 200, song);
    }

    // ---- Jauges : présence des fichiers multimédia d'une chanson ----
    // Même réponse que /check-files de server.js (port 3001), mais sur la même
    // origine que la page : fonctionne aussi en ligne (voir lib/media.js).
    // Pas d'authentification : on ne révèle que "ce fichier existe ou non".
    if (urlPath === '/check-files') {
        const song = url.searchParams.get('song');
        if (!song) return sendJson(res, 400, { error: 'Paramètre "song" manquant.' });
        return sendJson(res, 200, await media.checkFiles(song));
    }

    // ---- Fichiers multimédia hébergés dans un dépôt GitHub (mode web) ----
    if (await media.serveMedia(req, res, urlPath)) return;

    // ---- Page d'accueil : version « maître » ou « affichage » selon l'appareil ----
    if (urlPath === '/' || urlPath === '/index.html') return serveIndex(req, res);

    // ---- Tout le reste : fichiers statiques classiques, inchangé ----
    const filePath = path.join(PROJECT_ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(PROJECT_ROOT)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Accès interdit.');
    }
    serveFromDisk(res, filePath, urlPath);
}

function serveFromDisk(res, filePath, urlPath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Fichier non trouvé : ' + (urlPath || filePath));
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

// -------------------------------------------------------------------
const server = http.createServer((req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);

        if (url.pathname.startsWith('/api/')) {
            handleApi(req, res, url).catch(err => {
                console.error('[api] Erreur non gérée :', err);
                sendJson(res, 500, { error: 'Erreur serveur.' });
            });
            return;
        }

        handleStatic(req, res, url).catch(err => {
            console.error('[static] Erreur non gérée :', err);
            try { sendJson(res, 500, { error: 'Erreur serveur : ' + err.message }); }
            catch (_) { /* réponse déjà envoyée */ }
        });
    } catch (err) {
        // Filet de sécurité : une exception ici ne doit JAMAIS faire planter
        // tout le processus (ce qui laisserait un ancien process bloqué sur
        // le port et masquerait le vrai problème derrière un comportement
        // fantôme). On logue l'erreur complète en console pour diagnostic.
        console.error('[servAcc] Erreur non gérée sur', req.url, ':', err);
        try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Erreur serveur : ' + err.message })); }
        catch (_) { /* réponse déjà envoyée */ }
    }
});

// -------------------------------------------------------------------
// WebSocket /sync : le maître envoie des instantanés, relayés aux affichages
// -------------------------------------------------------------------
if (SYNC_ENABLED) {
    const wss = new WebSocketServer({
        server, path: '/sync',
        maxPayload: 32 * 1024 * 1024,
        perMessageDeflate: { threshold: 1024 },   // le HTML se compresse très bien
    });
    // Le serveur garde le dernier instantané COMPLET (lastSnapshot) et le dernier message de
    // défilement seul (lastView) pour les appareils qui arrivent en cours de route.
    // Les messages sont relayés tels quels (Buffer, sans conversion en texte ni nouvel encodage).
    let lastSnapshot = null, lastView = null;
    // Tant qu'aucun affichage n'est connecté, le maître ne calcule rien (voir sync.js) :
    // lastSnapshot devient alors périmé et n'est PAS rejoué au prochain arrivant — on attend
    // l'instantané frais que le maître envoie dès qu'il voit arriver un appareil.
    let snapshotValid = false;
    const WAIT_FRESH_MS = 1500;   // si le maître ne répond pas (absent, onglet en veille) : dernier état connu

    const isOpen = c => c.readyState === WebSocket.OPEN;
    const count = role => [...wss.clients].filter(c => isOpen(c) && c.syncRole === role).length;
    function broadcastStatus() {
        const msg = JSON.stringify({ t: 'status', masters: count('master'), viewers: count('viewer') });
        wss.clients.forEach(c => { if (isOpen(c)) c.send(msg); });
    }
    function sendLast(c) {
        c.gotSnap = true;
        c.send(lastSnapshot, { binary: false });
        if (lastView) c.send(lastView, { binary: false });
    }

    wss.on('connection', (ws, req) => {
        ws.syncRole = isMasterRequest(req) ? 'master' : 'viewer';
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('error', () => {});
        ws.on('close', () => {
            clearTimeout(ws.waitTimer);
            broadcastStatus();
            if (ws.syncRole === 'viewer' && count('viewer') === 0) snapshotValid = false;
        });

        if (ws.syncRole === 'viewer' && lastSnapshot) {
            if (snapshotValid) sendLast(ws);                       // instantané à jour : affichage immédiat
            else ws.waitTimer = setTimeout(() => {                 // sinon on laisse au maître le temps de répondre
                if (!ws.gotSnap && isOpen(ws) && lastSnapshot) sendLast(ws);
            }, WAIT_FRESH_MS);
        }

        ws.on('message', data => {
            if (ws.syncRole !== 'master') return;     // seuls les ordres du maître comptent
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            const isView = buf.toString('utf8', 0, 12) === '{"t":"view",';   // reconnu à son préfixe, quelle que soit sa taille
            if (isView) lastView = buf;
            else { lastSnapshot = buf; lastView = null; snapshotValid = true; }
            wss.clients.forEach(c => {
                if (c === ws || c.syncRole !== 'viewer' || !isOpen(c)) return;
                if (c.bufferedAmount > 4 * 1024 * 1024) { if (!isView) c.stale = true; return; } // appareil lent : on réessaiera
                if (!isView) c.gotSnap = true;
                c.send(buf, { binary: false });
            });
        });
        broadcastStatus();
    });

    setInterval(() => {   // rattrape les appareils lents + coupe les connexions mortes
        wss.clients.forEach(c => {
            if (c.stale && lastSnapshot && isOpen(c) && c.bufferedAmount < 256 * 1024) { c.stale = false; sendLast(c); }
        });
    }, 1000);
    setInterval(() => {
        wss.clients.forEach(c => {
            if (!c.isAlive) return c.terminate();
            c.isAlive = false; c.ping();
        });
    }, 30000);
}

server.on('error', err => {
    // EADDRINUSE notamment : le port est déjà occupé par un autre process
    // (ancien servAcc.js resté ouvert). On le dit clairement au lieu de
    // planter en silence dans la fenêtre "Accords".
    console.error(`❌ Impossible de démarrer sur le port ${PORT} :`, err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`   Un autre process écoute déjà sur ce port. Utilisez stopstart5500.js pour le libérer avant de relancer.`);
    }
    process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur Accords (avec auth) lancé sur http://localhost:${PORT}`);
    console.log(`   COOKIE_SECURE=${COOKIE_SECURE ? 'oui (HTTPS requis)' : 'non (OK en local/LAN)'}`);
    if (SYNC_OFF_REASON) console.log(`   Synchro écrans : désactivée (${SYNC_OFF_REASON})`);
    if (SYNC_ENABLED) {
        const lan = [].concat(...Object.values(os.networkInterfaces())).filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
        console.log(`   Synchro écrans : maître = navigateur ouvert sur ce PC (http://localhost:${PORT})`);
        lan.forEach(ip => console.log(`   Autres appareils -> http://${ip}:${PORT}`));
    }
    console.log(`   Stockage : ${storage.USE_REDIS ? 'Upstash Redis (persistant en ligne)' : 'fichiers locaux'}`);
    console.log(`   Couleur de fond : ${ENV_COLOR || 'par défaut'}`);
    console.log(`   Multimédia : ${media.IS_REMOTE ? `dépôt GitHub ${media.MEDIA_REPO}@${media.MEDIA_BRANCH} (dossier "${media.MEDIA_PATH || '/'}")` : 'dossier local songs/multimedia'}`);
});
