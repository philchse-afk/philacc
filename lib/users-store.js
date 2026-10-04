// lib/users-store.js
// -----------------------------------------------------------------------
// Stockage des comptes utilisateurs dans un simple fichier JSON
// (data/users.json). Suffisant pour une poignée d'utilisateurs (groupe /
// artiste) — pas besoin d'une vraie base de données, et ça reste facile à
// relire/sauvegarder à la main si besoin.
//
// Sécurité des mots de passe : hachage avec scrypt (module natif "crypto"
// de Node, aucune dépendance externe à installer). Chaque mot de passe a
// son propre sel aléatoire, et la comparaison se fait en temps constant.
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// Statuts possibles d'un compte :
//   'pending'  → inscription en attente d'approbation par un admin
//   'approved' → compte actif, peut se connecter
//   'rejected' → refusé par l'admin (ne peut pas se connecter)
const VALID_STATUSES = ['pending', 'approved', 'rejected'];
const VALID_ROLES = ['admin', 'user'];

function _ensureFile() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
        fs.writeFileSync(USERS_FILE, '[]', 'utf8');
    }
}

function _load() {
    _ensureFile();
    try {
        let raw = fs.readFileSync(USERS_FILE, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        return JSON.parse(raw || '[]');
    } catch (err) {
        console.error('[users-store] Erreur de lecture de users.json :', err.message);
        return [];
    }
}

function _save(users) {
    // Écriture atomique (fichier temporaire puis renommage) pour éviter de
    // corrompre users.json si le process est interrompu en pleine écriture.
    const tmp = USERS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
    fs.renameSync(tmp, USERS_FILE);
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
}

function findByUsername(username) {
    const norm = normalizeUsername(username);
    return _load().find(u => u.username === norm) || null;
}

function findById(id) {
    return _load().find(u => u.id === id) || null;
}

function listUsers() {
    // Ne jamais renvoyer passwordHash en dehors de ce module.
    return _load().map(_publicView);
}

function _publicView(u) {
    return {
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        mustChangePassword: !!u.mustChangePassword,
    };
}

/**
 * Crée un nouveau compte. Le tout premier compte créé sur l'installation
 * devient automatiquement admin + approuvé (bootstrap) ; tous les suivants
 * sont créés en 'pending' et doivent être validés par un admin.
 */
function createUser(username, password) {
    const norm = normalizeUsername(username);
    if (!norm || norm.length < 3) {
        throw new Error('Le nom d\'utilisateur doit contenir au moins 3 caractères.');
    }
    if (!/^[a-z0-9._-]+$/.test(norm)) {
        throw new Error('Le nom d\'utilisateur ne peut contenir que lettres, chiffres, points, tirets et underscores.');
    }
    if (!password || password.length < 8) {
        throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
    }

    const users = _load();
    if (users.find(u => u.username === norm)) {
        throw new Error('Ce nom d\'utilisateur est déjà pris.');
    }

    const isFirstUser = users.length === 0;

    const user = {
        id: crypto.randomUUID(),
        username: norm,
        passwordHash: hashPassword(password),
        role: isFirstUser ? 'admin' : 'user',
        status: isFirstUser ? 'approved' : 'pending',
        createdAt: new Date().toISOString(),
    };

    users.push(user);
    _save(users);
    return _publicView(user);
}

function verifyLogin(username, password) {
    const user = findByUsername(username);
    if (!user) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return user; // vue complète (appelant interne, décide quoi exposer)
}

function setStatus(id, status) {
    if (!VALID_STATUSES.includes(status)) throw new Error('Statut invalide.');
    const users = _load();
    const user = users.find(u => u.id === id);
    if (!user) throw new Error('Utilisateur introuvable.');
    user.status = status;
    _save(users);
    return _publicView(user);
}

function setRole(id, role) {
    if (!VALID_ROLES.includes(role)) throw new Error('Rôle invalide.');
    const users = _load();
    const user = users.find(u => u.id === id);
    if (!user) throw new Error('Utilisateur introuvable.');
    user.role = role;
    _save(users);
    return _publicView(user);
}

/** Génère un mot de passe temporaire lisible (évite les caractères ambigus 0/O, 1/l/I). */
function _generateTempPassword() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    const bytes = crypto.randomBytes(10);
    for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
}

/** Réinitialisation par l'admin : génère un mot de passe temporaire et le renvoie
 *  en clair (une seule fois, il n'est jamais stocké ni loggé). L'utilisateur devra
 *  le changer à sa prochaine connexion (mustChangePassword). */
function resetPassword(id) {
    const users = _load();
    const user = users.find(u => u.id === id);
    if (!user) throw new Error('Utilisateur introuvable.');
    const tempPassword = _generateTempPassword();
    user.passwordHash = hashPassword(tempPassword);
    user.mustChangePassword = true;
    _save(users);
    return tempPassword;
}

/** Changement de mot de passe par l'utilisateur lui-même (nécessite l'ancien). */
function changeOwnPassword(id, oldPassword, newPassword) {
    const users = _load();
    const user = users.find(u => u.id === id);
    if (!user) throw new Error('Utilisateur introuvable.');
    if (!verifyPassword(oldPassword, user.passwordHash)) {
        throw new Error('Mot de passe actuel incorrect.');
    }
    if (!newPassword || newPassword.length < 8) {
        throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    }
    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    _save(users);
    return _publicView(user);
}

function deleteUser(id) {
    const users = _load();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('Utilisateur introuvable.');
    users.splice(idx, 1);
    _save(users);
}

module.exports = {
    createUser,
    verifyLogin,
    findByUsername,
    findById,
    listUsers,
    setStatus,
    setRole,
    resetPassword,
    changeOwnPassword,
    deleteUser,
    normalizeUsername,
    _publicView,
};
