// lib/repertoire.js
// -----------------------------------------------------------------------
// Accès aux données "répertoire" :
//  - le répertoire MAÎTRE : celui géré par l'admin (clé "master:index" +
//    une clé "master:song:<fichier>" par chanson).
//  - les répertoires PERSONNELS : un "master:index" + des chansons par
//    utilisateur (clés "user:<username>:index" et "user:<username>:song:<fichier>").
//    Chaque utilisateur peut partir de zéro, ou "cloner" des chansons du
//    répertoire maître pour les adapter.
//
// Toute la lecture/écriture passe par lib/storage.js (fichiers locaux ou
// Upstash Redis selon l'environnement) — ce module ne connaît plus aucun
// chemin de fichier, uniquement des clés logiques.
// -----------------------------------------------------------------------

const path = require('path');
const storage = require('./storage');

function _safeFilename(name) {
    // Empêche toute tentative de traversée de répertoire (../../etc)
    const base = path.basename(String(name || ''));
    if (!base || base !== name) throw new Error('Nom de fichier invalide.');
    return base;
}

/** Pas d'action nécessaire avec la couche de stockage générique (elle crée
 *  les dossiers/clés à la volée) — conservé pour compatibilité d'appel. */
async function ensureUserRepertoire(username) {
    const idx = await storage.get(`user:${username}:index`, null);
    if (idx === null) await storage.set(`user:${username}:index`, []);
}

// ---- Répertoire maître -------------------------------------------------
// Lecture pour tout le monde (via cette API) ; écriture réservée à l'admin
// (voir requireAdmin dans servAcc.js) — mais c'est le même mécanisme
// d'enregistrement automatique que pour un répertoire personnel.

async function getMasterIndex() {
    return storage.get('master:index', []);
}

async function getMasterSong(filename) {
    const safe = _safeFilename(filename);
    return storage.get(`master:song:${safe}`, null);
}

async function saveMasterIndex(indexArray) {
    if (!Array.isArray(indexArray)) throw new Error('Format d\'index invalide (tableau attendu).');
    await storage.set('master:index', indexArray);
}

async function saveMasterSong(filename, songData) {
    const safe = _safeFilename(filename);
    await storage.set(`master:song:${safe}`, songData);
}

async function deleteMasterSong(filename) {
    const safe = _safeFilename(filename);
    await storage.del(`master:song:${safe}`);
    const idx = (await getMasterIndex()).filter(s => s.file !== safe);
    await saveMasterIndex(idx);
}

/** Enregistre une chanson + met à jour son entrée d'index, dans le répertoire
 *  maître OU personnel selon isAdmin — même logique pour les deux. */
async function saveSongAndIndexEntry({ isAdmin, username, filename, songData, indexEntry }) {
    if (isAdmin) {
        await saveMasterSong(filename, songData);
        const idx = await getMasterIndex();
        const i = idx.findIndex(s => s.file === filename);
        if (i !== -1) idx[i] = indexEntry; else idx.push(indexEntry);
        await saveMasterIndex(idx);
    } else {
        await saveUserSong(username, filename, songData);
        const idx = await getUserIndex(username);
        const i = idx.findIndex(s => s.file === filename);
        if (i !== -1) idx[i] = indexEntry; else idx.push(indexEntry);
        await saveUserIndex(username, idx);
    }
}

/** Supprime une chanson (+ son entrée d'index), dans le répertoire maître
 *  OU personnel selon isAdmin — pendant de saveSongAndIndexEntry. */
async function deleteSongEntry({ isAdmin, username, filename }) {
    if (isAdmin) await deleteMasterSong(filename);
    else await deleteUserSong(username, filename);
}

// ---- Répertoire personnel ------------------------------------------------

async function getUserIndex(username) {
    await ensureUserRepertoire(username);
    return storage.get(`user:${username}:index`, []);
}

async function saveUserIndex(username, indexArray) {
    if (!Array.isArray(indexArray)) throw new Error('Format d\'index invalide (tableau attendu).');
    await storage.set(`user:${username}:index`, indexArray);
}

async function getUserSong(username, filename) {
    const safe = _safeFilename(filename);
    return storage.get(`user:${username}:song:${safe}`, null);
}

async function saveUserSong(username, filename, songData) {
    const safe = _safeFilename(filename);
    await storage.set(`user:${username}:song:${safe}`, songData);
}

async function deleteUserSong(username, filename) {
    const safe = _safeFilename(filename);
    await storage.del(`user:${username}:song:${safe}`);
    const idx = (await getUserIndex(username)).filter(s => s.file !== safe);
    await saveUserIndex(username, idx);
}

/** Clone une chanson du répertoire maître vers le répertoire personnel. */
async function cloneFromMaster(username, filename) {
    const safe = _safeFilename(filename);
    const song = await getMasterSong(safe);
    if (!song) throw new Error('Chanson introuvable dans le répertoire maître.');
    const masterIndex = await getMasterIndex();
    const entry = masterIndex.find(s => s.file === safe);
    if (!entry) throw new Error('Entrée d\'index introuvable dans le répertoire maître.');

    await saveUserSong(username, safe, song);
    const userIndex = await getUserIndex(username);
    const already = userIndex.findIndex(s => s.file === safe);
    if (already !== -1) userIndex[already] = entry;
    else userIndex.push(entry);
    await saveUserIndex(username, userIndex);
    return entry;
}

/** Clone tout le répertoire maître vers le répertoire personnel ("partir du répertoire existant"). */
async function cloneAllFromMaster(username) {
    const masterIndex = await getMasterIndex();
    for (const entry of masterIndex) {
        try { await cloneFromMaster(username, entry.file); }
        catch (err) { console.error(`[clone-all] ${entry.file} :`, err.message); }
    }
    return getUserIndex(username);
}

module.exports = {
    ensureUserRepertoire,
    getMasterIndex,
    getMasterSong,
    saveMasterIndex,
    saveMasterSong,
    deleteMasterSong,
    saveSongAndIndexEntry,
    deleteSongEntry,
    getUserIndex,
    saveUserIndex,
    getUserSong,
    saveUserSong,
    deleteUserSong,
    cloneFromMaster,
    cloneAllFromMaster,
};
