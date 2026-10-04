// lib/repertoire.js
// -----------------------------------------------------------------------
// Accès aux données "répertoire" :
//  - le répertoire MAÎTRE : celui que vous gérez déjà (data/songs-index.json
//    + songs/*.json à la racine du projet) — inchangé, en lecture seule
//    pour les utilisateurs normaux.
//  - les répertoires PERSONNELS : un dossier par utilisateur sous
//    data/users/<username>/ contenant son propre songs-index.json et son
//    propre dossier songs/. Chaque utilisateur peut partir de zéro, ou
//    "cloner" des chansons du répertoire maître pour les adapter.
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MASTER_INDEX = path.join(ROOT, 'data', 'songs-index.json');
const MASTER_SONGS_DIR = path.join(ROOT, 'songs');
const USERS_DATA_DIR = path.join(ROOT, 'data', 'users');

function _safeFilename(name) {
    // Empêche toute tentative de traversée de répertoire (../../etc)
    const base = path.basename(String(name || ''));
    if (!base || base !== name) throw new Error('Nom de fichier invalide.');
    return base;
}

function _userDir(username) {
    return path.join(USERS_DATA_DIR, username);
}

function _userIndexFile(username) {
    return path.join(_userDir(username), 'songs-index.json');
}

function _userSongsDir(username) {
    return path.join(_userDir(username), 'songs');
}

function ensureUserRepertoire(username) {
    const dir = _userDir(username);
    const songsDir = _userSongsDir(username);
    fs.mkdirSync(songsDir, { recursive: true });
    const indexFile = _userIndexFile(username);
    if (!fs.existsSync(indexFile)) {
        fs.writeFileSync(indexFile, '[]', 'utf8');
    }
}

function readJson(file, fallback) {
    try {
        let raw = fs.readFileSync(file, 'utf8');
        // Windows ajoute parfois un BOM UTF-8 en tête de fichier (Notepad, entre
        // autres) : invisible, mais JSON.parse le refuse ("Unexpected token").
        // On le retire systématiquement avant de parser.
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        console.error(`[repertoire] Échec de lecture/parsing de ${file} :`, err.message);
        throw new Error(`Fichier illisible (${path.basename(file)}) : ${err.message}`);
    }
}

function writeJsonAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
}

// ---- Répertoire maître -------------------------------------------------
// Lecture pour tout le monde (via cette API) ; écriture réservée à l'admin
// (voir requireAdmin dans servAcc.js) — mais c'est le même mécanisme
// d'enregistrement automatique que pour un répertoire personnel.

function getMasterIndex() {
    return readJson(MASTER_INDEX, []);
}

function getMasterSong(filename) {
    const safe = _safeFilename(filename);
    return readJson(path.join(MASTER_SONGS_DIR, safe), null);
}

function saveMasterIndex(indexArray) {
    if (!Array.isArray(indexArray)) throw new Error('Format d\'index invalide (tableau attendu).');
    writeJsonAtomic(MASTER_INDEX, indexArray);
}

function saveMasterSong(filename, songData) {
    const safe = _safeFilename(filename);
    writeJsonAtomic(path.join(MASTER_SONGS_DIR, safe), songData);
}

function deleteMasterSong(filename) {
    const safe = _safeFilename(filename);
    const file = path.join(MASTER_SONGS_DIR, safe);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const idx = getMasterIndex().filter(s => s.file !== safe);
    saveMasterIndex(idx);
}

/** Enregistre une chanson + met à jour son entrée d'index, dans le répertoire
 *  maître OU personnel selon isAdmin — même logique pour les deux. */
function saveSongAndIndexEntry({ isAdmin, username, filename, songData, indexEntry }) {
    if (isAdmin) {
        saveMasterSong(filename, songData);
        const idx = getMasterIndex();
        const i = idx.findIndex(s => s.file === filename);
        if (i !== -1) idx[i] = indexEntry; else idx.push(indexEntry);
        saveMasterIndex(idx);
    } else {
        saveUserSong(username, filename, songData);
        const idx = getUserIndex(username);
        const i = idx.findIndex(s => s.file === filename);
        if (i !== -1) idx[i] = indexEntry; else idx.push(indexEntry);
        saveUserIndex(username, idx);
    }
}

/** Supprime une chanson (+ son entrée d'index), dans le répertoire maître
 *  OU personnel selon isAdmin — pendant de saveSongAndIndexEntry. */
function deleteSongEntry({ isAdmin, username, filename }) {
    if (isAdmin) deleteMasterSong(filename);
    else deleteUserSong(username, filename);
}

// ---- Répertoire personnel ------------------------------------------------

function getUserIndex(username) {
    ensureUserRepertoire(username);
    return readJson(_userIndexFile(username), []);
}

function saveUserIndex(username, indexArray) {
    ensureUserRepertoire(username);
    if (!Array.isArray(indexArray)) throw new Error('Format d\'index invalide (tableau attendu).');
    writeJsonAtomic(_userIndexFile(username), indexArray);
}

function getUserSong(username, filename) {
    const safe = _safeFilename(filename);
    ensureUserRepertoire(username);
    return readJson(path.join(_userSongsDir(username), safe), null);
}

function saveUserSong(username, filename, songData) {
    const safe = _safeFilename(filename);
    ensureUserRepertoire(username);
    writeJsonAtomic(path.join(_userSongsDir(username), safe), songData);
}

function deleteUserSong(username, filename) {
    const safe = _safeFilename(filename);
    ensureUserRepertoire(username);
    const file = path.join(_userSongsDir(username), safe);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const idx = getUserIndex(username).filter(s => s.file !== safe);
    saveUserIndex(username, idx);
}

/** Clone une chanson du répertoire maître vers le répertoire personnel. */
function cloneFromMaster(username, filename) {
    const safe = _safeFilename(filename);
    const song = getMasterSong(safe);
    if (!song) throw new Error('Chanson introuvable dans le répertoire maître.');
    const masterIndex = getMasterIndex();
    const entry = masterIndex.find(s => s.file === safe);
    if (!entry) throw new Error('Entrée d\'index introuvable dans le répertoire maître.');

    saveUserSong(username, safe, song);
    const userIndex = getUserIndex(username);
    const already = userIndex.findIndex(s => s.file === safe);
    if (already !== -1) userIndex[already] = entry;
    else userIndex.push(entry);
    saveUserIndex(username, userIndex);
    return entry;
}

/** Clone tout le répertoire maître vers le répertoire personnel ("partir du répertoire existant"). */
function cloneAllFromMaster(username) {
    const masterIndex = getMasterIndex();
    masterIndex.forEach(entry => {
        try { cloneFromMaster(username, entry.file); }
        catch (err) { console.error(`[clone-all] ${entry.file} :`, err.message); }
    });
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
