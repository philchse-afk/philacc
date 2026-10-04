// lib/storage.js
// -----------------------------------------------------------------------
// Couche de stockage clé/valeur, avec DEUX backends interchangeables :
//
//  - Fichiers JSON locaux (par défaut) : comportement strictement identique
//    à avant, utilisé pour votre déploiement local/LAN (C:\inetpub\wwwroot).
//    Rien ne change pour vous dans ce cas.
//
//  - Upstash Redis (REST API) : utilisé automatiquement dès que les variables
//    d'environnement UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN sont
//    définies — c'est le cas sur Render, pour que les comptes et répertoires
//    personnels survivent aux redémarrages du service gratuit (le disque
//    local de Render, lui, n'est pas persistant).
//
// Le reste du code (users-store.js, repertoire.js) ne manipule plus de
// chemins de fichiers : juste des clés, via get/set/del. Aucun des deux
// modules n'a besoin de savoir lequel des deux backends est actif.
//
// Upstash expose une simple API REST (une requête HTTP par commande Redis),
// utilisable avec le fetch() natif de Node (18+) — aucune dépendance npm à
// installer, cohérent avec le reste du projet.
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', 'data');
const SONGS_ROOT = path.join(__dirname, '..', 'songs');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = !!(UPSTASH_URL && UPSTASH_TOKEN);

// ---- Backend Upstash Redis (REST) --------------------------------------

async function redisCommand(command) {
    let res;
    try {
        res = await fetch(UPSTASH_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(command),
        });
    } catch (err) {
        throw new Error('Connexion à Upstash impossible : ' + err.message);
    }
    let data;
    try { data = await res.json(); }
    catch (err) { throw new Error('Réponse Upstash illisible (HTTP ' + res.status + ').'); }
    if (data.error) throw new Error('Upstash : ' + data.error);
    return data.result;
}

// ---- Correspondance clé → chemin de fichier (backend local) ------------
// Garde exactement la même disposition de fichiers qu'avant, pour une
// compatibilité totale avec un déploiement local existant.
function _keyToFilePath(key) {
    if (key === 'users') return path.join(DATA_ROOT, 'users.json');
    if (key === 'master:index') return path.join(DATA_ROOT, 'songs-index.json');
    let m;
    if ((m = key.match(/^master:song:(.+)$/))) return path.join(SONGS_ROOT, m[1]);
    if ((m = key.match(/^user:([^:]+):index$/))) return path.join(DATA_ROOT, 'users', m[1], 'songs-index.json');
    if ((m = key.match(/^user:([^:]+):song:(.+)$/))) return path.join(DATA_ROOT, 'users', m[1], 'songs', m[2]);
    throw new Error('Clé de stockage inconnue : ' + key);
}

/** Lit une valeur JSON. Renvoie `fallback` si la clé n'existe pas. */
async function get(key, fallback = null) {
    if (USE_REDIS) {
        const result = await redisCommand(['GET', key]);
        if (result === null || result === undefined) return fallback;
        try { return JSON.parse(result); }
        catch (err) { throw new Error(`Donnée illisible pour la clé "${key}" : ${err.message}`); }
    }

    const file = _keyToFilePath(key);
    try {
        let raw = fs.readFileSync(file, 'utf8');
        // BOM UTF-8 (Notepad, entre autres) : invisible, mais JSON.parse le refuse.
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        console.error(`[storage] Échec de lecture de ${file} :`, err.message);
        throw new Error(`Fichier illisible (${path.basename(file)}) : ${err.message}`);
    }
}

/** Écrit une valeur JSON (remplace si la clé existe déjà). */
async function set(key, value) {
    if (USE_REDIS) {
        await redisCommand(['SET', key, JSON.stringify(value)]);
        return;
    }

    const file = _keyToFilePath(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Écriture atomique (fichier temporaire + renommage) pour éviter de
    // corrompre le fichier si le process est interrompu en pleine écriture.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
}

/** Supprime une clé (silencieux si elle n'existe pas). */
async function del(key) {
    if (USE_REDIS) {
        await redisCommand(['DEL', key]);
        return;
    }
    const file = _keyToFilePath(key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = { get, set, del, USE_REDIS };
