/**
 * server.js — Serveur local pour ouvrir les fichiers multimédia
 * avec les applications natives (Guitar Pro, etc.)
 *
 * Port : 3001 (ton Live Server tourne déjà sur 5500)
 * Lancement : node server.js
 */

const http = require('http');
const fs   = require('fs');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const url = require('url');

const PORT = 3001;

// -------------------------------------------------------
// Chemins vers Guitar Pro selon l'OS
// Adapte ces chemins si Guitar Pro est installé ailleurs
// -------------------------------------------------------
const GUITAR_PRO_PATHS = {
    win32:  '"C:\\Program Files\\Arobas Music\\Guitar Pro 8\\GuitarPro.exe"',
    darwin: '"/Applications/Guitar Pro 8.app/Contents/MacOS/Guitar Pro"',
};

// Dossier racine de tes fichiers GP (chemin absolu)
// Adapte ce chemin à l'emplacement réel de ton projet
const GP_FOLDER = path.join(__dirname, 'songs', 'multimedia', 'gp');

// -------------------------------------------------------
// Serveur HTTP
// -------------------------------------------------------
const server = http.createServer((req, res) => {

    // Headers CORS pour autoriser les appels depuis localhost:5500
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsed = url.parse(req.url, true);

    // --------------------------------------------------
    // Route : GET /open-gp?file=nom_du_fichier.gp
    // --------------------------------------------------
    if (parsed.pathname === '/open-gp') {
        const filename = parsed.query.file;

        if (!filename) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Paramètre "file" manquant.' }));
            return;
        }

        // Sécurité : on interdit les chemins relatifs (ex: ../../etc/passwd)
        const safeName = path.basename(filename);
        const filePath = path.join(GP_FOLDER, safeName);

        const platform = os.platform();
        const gpExe = GUITAR_PRO_PATHS[platform];

        if (!gpExe) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `OS non supporté : ${platform}` }));
            return;
        }

        console.log(`[open-gp] Ouverture : ${filePath}`);

        let command;
        if (platform === 'win32') {
            // Windows : Start-Process ouvre le fichier avec l'application associée
            // comme un double-clic dans l'explorateur
            command = `powershell -Command "Start-Process '${filePath.replace(/'/g, "''")}'"`;
        } else {
            // Mac : open -a avec le nom de l'application
            command = `open -a "Guitar Pro 8" "${filePath}"`;
        }

        exec(command, (error) => {
            if (error) {
                console.error(`[open-gp] Erreur : ${error.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: "Impossible d'ouvrir Guitar Pro.",
                    detail: error.message
                }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, file: safeName }));
        });

    // --------------------------------------------------
    // Route : GET /check-files?song=nom.json
    // Vérifie l'existence des fichiers multimédia
    // --------------------------------------------------
    } else if (parsed.pathname === '/check-files') {
        const songFile = parsed.query.song;

        if (!songFile) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Paramètre "song" manquant.' }));
            return;
        }

        const base = path.basename(songFile).replace('.json', '');
        const mediaRoot = path.join(__dirname, 'songs', 'multimedia');

        const checks = {
            mp3:    fs.existsSync(path.join(mediaRoot, 'mp3',               base + '.mp3')),
            mp3bch: fs.existsSync(path.join(mediaRoot, 'mp3', 'bch', 'Bch' + base + '.mp3')),
            mp3bcg: fs.existsSync(path.join(mediaRoot, 'mp3', 'bcg', 'Bcg' + base + '.mp3')),
            mp3bgu: fs.existsSync(path.join(mediaRoot, 'mp3', 'bgu', 'Bgu' + base + '.mp3')),
            gp:     fs.existsSync(path.join(mediaRoot, 'gp',               base + '.gp')),
            mp4:    fs.existsSync(path.join(mediaRoot, 'mp4',              base + '.mp4')),
            pdf:    fs.existsSync(path.join(mediaRoot, 'pdf',              base + '.pdf')),
            pdfacc: fs.existsSync(path.join(mediaRoot, 'pdf', 'acc',         base + '.pdf')),
        };

        console.log(`[check-files] ${base} :`, checks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checks));

    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Route inconnue.' }));
    }
});

server.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
    console.log(`   Route disponible : GET /open-gp?file=nom.gp`);
    console.log(`   Dossier GP       : ${GP_FOLDER}`);
    console.log(`   OS détecté       : ${os.platform()}`);
});
