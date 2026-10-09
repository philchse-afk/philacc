// lib/media.js
// -----------------------------------------------------------------------
// Présence des fichiers multimédia (mp3 / gp / mp4 / pdf) d'une chanson,
// pour alimenter les jauges de la liste — et service de ces fichiers.
//
// DEUX modes, choisis automatiquement :
//
//  - LOCAL (par défaut) : on regarde directement le dossier songs/multimedia
//    sur le disque, exactement comme le faisait /check-files de server.js
//    (port 3001). Rien ne change pour votre installation Windows.
//
//  - WEB (dès que la variable d'environnement MEDIA_REPO est définie) : les
//    fichiers sont dans un dépôt GitHub dédié. On lit une fois la liste des
//    fichiers de ce dépôt via l'API GitHub (mise en cache 10 minutes) et on
//    répond aux jauges à partir de cette liste — sans rien télécharger.
//    Les fichiers eux-mêmes (/songs/multimedia/...) sont servis par
//    redirection vers raw.githubusercontent.com (dépôt public), ou relayés
//    avec un jeton (dépôt privé, si GITHUB_TOKEN est défini).
//
// Variables d'environnement (mode WEB) :
//   MEDIA_REPO    "proprietaire/nom-du-depot"            (obligatoire)
//   MEDIA_BRANCH  branche à lire                         (défaut : main)
//   MEDIA_PATH    dossier du dépôt qui correspond à      (défaut : songs/multimedia)
//                 songs/multimedia en local ; mettre "/" si mp3/, gp/, pdf/...
//                 sont directement à la racine du dépôt
//   GITHUB_TOKEN  jeton GitHub en lecture seule (facultatif mais RECOMMANDÉ,
//                 même pour un dépôt public : sans lui, l'API GitHub est
//                 limitée à 60 requêtes/heure par adresse IP, et les IP de
//                 Render sont partagées — la liste des fichiers pourrait
//                 alors ne pas se charger)
//   MEDIA_PRIVATE mettre "1" si le dépôt est PRIVÉ : les fichiers sont alors
//                 relayés par le serveur avec le jeton, au lieu d'être
//                 redirigés vers GitHub (qui refuserait l'accès au navigateur)
//
// La comparaison des noms ignore la casse : Windows ne distingue pas
// "Bch" de "bch", GitHub (Linux) si — on ne veut pas que ça casse une jauge.
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const MEDIA_REPO = (process.env.MEDIA_REPO || '').trim();
const MEDIA_BRANCH = (process.env.MEDIA_BRANCH || 'main').trim();
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const MEDIA_PRIVATE = process.env.MEDIA_PRIVATE === '1';
const GITHUB_API = process.env.GITHUB_API_URL || 'https://api.github.com';
const GITHUB_RAW = process.env.GITHUB_RAW_URL || 'https://raw.githubusercontent.com';

let MEDIA_PATH = process.env.MEDIA_PATH === undefined ? 'songs/multimedia' : process.env.MEDIA_PATH.trim();
MEDIA_PATH = MEDIA_PATH.replace(/^[\\/]+|[\\/]+$/g, '');
if (MEDIA_PATH === '.') MEDIA_PATH = '';

const IS_REMOTE = !!MEDIA_REPO;
const LOCAL_ROOT = path.join(__dirname, '..', 'songs', 'multimedia');
const MEDIA_URL_PREFIX = '/songs/multimedia/';
const TREE_TTL_MS = 10 * 60 * 1000;
const TREE_RETRY_MS = 30 * 1000;

// ---- Liste des fichiers du dépôt (mode WEB) -----------------------------

let treeCache = { at: 0, ttl: TREE_TTL_MS, map: null };
let treeInflight = null;

function ghHeaders(extra) {
    const h = { 'User-Agent': 'accords-app', Accept: 'application/vnd.github+json', ...extra };
    if (GITHUB_TOKEN) h.Authorization = `Bearer ${GITHUB_TOKEN}`;
    return h;
}

async function loadTree() {
    const url = `${GITHUB_API}/repos/${MEDIA_REPO}/git/trees/${encodeURIComponent(MEDIA_BRANCH)}?recursive=1`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) {
        let hint = '';
        if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') hint = ' (limite de requêtes anonymes atteinte : définissez GITHUB_TOKEN)';
        else if (res.status === 404) hint = ' (dépôt/branche introuvable, ou dépôt privé sans GITHUB_TOKEN)';
        throw new Error(`API GitHub HTTP ${res.status} pour ${MEDIA_REPO}@${MEDIA_BRANCH}${hint}`);
    }
    const data = await res.json();
    if (data.truncated) console.warn('[media] Liste GitHub tronquée (dépôt très volumineux) : certaines jauges peuvent manquer.');

    const prefixLower = MEDIA_PATH.toLowerCase();
    const map = new Map(); // chemin relatif en minuscules -> chemin réel dans le dépôt
    for (const item of data.tree || []) {
        if (item.type !== 'blob') continue;
        let rel = item.path;
        if (prefixLower) {
            if (!rel.toLowerCase().startsWith(prefixLower + '/')) continue;
            rel = rel.slice(MEDIA_PATH.length + 1);
        }
        map.set(rel.toLowerCase(), item.path);
    }
    return map;
}

async function getTree() {
    if (treeCache.map && Date.now() - treeCache.at < treeCache.ttl) return treeCache.map;
    if (treeInflight) return treeInflight;
    treeInflight = (async () => {
        try {
            const map = await loadTree();
            treeCache = { at: Date.now(), ttl: TREE_TTL_MS, map };
            console.log(`[media] ${map.size} fichier(s) multimédia listé(s) depuis ${MEDIA_REPO}@${MEDIA_BRANCH}`);
            return map;
        } catch (err) {
            console.error('[media] Lecture de la liste GitHub impossible :', err.message);
            // On garde l'ancienne liste si on en a une ; réessai dans 30 s.
            const map = treeCache.map || new Map();
            treeCache = { at: Date.now(), ttl: TREE_RETRY_MS, map };
            return map;
        } finally {
            treeInflight = null;
        }
    })();
    return treeInflight;
}

// ---- Jauges : présence des fichiers d'une chanson ------------------------

/** Chemins relatifs (dans songs/multimedia) testés pour une chanson. */
function candidatePaths(songFile) {
    const base = path.basename(String(songFile || '')).replace('.json', '');
    return {
        mp3:    `mp3/${base}.mp3`,
        mp3bch: `mp3/bch/Bch${base}.mp3`,
        mp3bcg: `mp3/bcg/Bcg${base}.mp3`,
        mp3bgu: `mp3/bgu/Bgu${base}.mp3`,
        gp:     `gp/${base}.gp`,
        mp4:    `mp4/${base}.mp4`,
        pdf:    `pdf/${base}.pdf`,
        pdfacc: `pdf/acc/${base}.pdf`,
        // MP4 "au sens large" : mp4K ou mp4, extension .mp4 ou .m4v (ce que le
        // navigateur testait jusqu'ici fichier par fichier avec des HEAD).
        _mp4Any: [
            `mp4K/${base}.mp4`, `mp4K/${base}.m4v`,
            `mp4/${base}.mp4`, `mp4/${base}.m4v`,
        ],
    };
}

async function checkFiles(songFile) {
    const c = candidatePaths(songFile);
    let exists;
    if (IS_REMOTE) {
        const tree = await getTree();
        exists = rel => tree.has(rel.toLowerCase());
    } else {
        exists = rel => fs.existsSync(path.join(LOCAL_ROOT, ...rel.split('/')));
    }
    const out = {};
    for (const k of ['mp3', 'mp3bch', 'mp3bcg', 'mp3bgu', 'gp', 'mp4', 'pdf', 'pdfacc']) out[k] = exists(c[k]);
    out.mp4Any = out.mp4 || c._mp4Any.some(exists);
    return out;
}

// ---- Service des fichiers /songs/multimedia/... (mode WEB uniquement) ----

function rawUrl(realPath) {
    const enc = realPath.split('/').map(encodeURIComponent).join('/');
    return `${GITHUB_RAW}/${MEDIA_REPO}/${encodeURIComponent(MEDIA_BRANCH)}/${enc}`;
}

/**
 * Sert un fichier multimédia depuis le dépôt GitHub. Renvoie true si la
 * requête a été prise en charge (mode WEB et chemin sous /songs/multimedia/),
 * false sinon (le serveur retombe alors sur le disque, comme avant).
 */
async function serveMedia(req, res, urlPath) {
    if (!IS_REMOTE || !urlPath.startsWith(MEDIA_URL_PREFIX)) return false;

    const rel = urlPath.slice(MEDIA_URL_PREFIX.length);
    const tree = await getTree();
    const real = tree.get(rel.toLowerCase());
    if (!real) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Fichier non trouvé : ' + urlPath);
        return true;
    }

    const target = rawUrl(real);
    if (!(MEDIA_PRIVATE && GITHUB_TOKEN)) {
        // Dépôt public : GitHub sert le fichier directement au navigateur.
        res.writeHead(302, { Location: target, 'Cache-Control': 'public, max-age=300' });
        res.end();
        return true;
    }

    // Dépôt privé (MEDIA_PRIVATE=1 + GITHUB_TOKEN) : on relaie avec le jeton (sans jamais l'exposer au navigateur).
    const headers = { 'User-Agent': 'accords-app', Authorization: `Bearer ${GITHUB_TOKEN}` };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(target, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers });
    const pass = {};
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']) {
        const v = upstream.headers.get(h);
        if (v) pass[h] = v;
    }
    res.writeHead(upstream.status, pass);
    if (req.method === 'HEAD' || !upstream.body) { res.end(); return true; }
    Readable.fromWeb(upstream.body).pipe(res);
    return true;
}

module.exports = { checkFiles, serveMedia, IS_REMOTE, MEDIA_REPO, MEDIA_BRANCH, MEDIA_PATH };
