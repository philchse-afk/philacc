/**
 * server.js — Serveur local pour ouvrir les fichiers multimédia
 * avec les applications natives (Guitar Pro, etc.)
 *
 * Port : 3001
 * Lancement : node server.js
 */

const http = require('http');
const fs   = require('fs');
const { exec } = require('child_process');
const path = require('path');
const os   = require('os');
const url  = require('url');

const PORT = 3001;

const GP_FOLDER = path.join(__dirname, 'songs', 'multimedia', 'gp');

const server = http.createServer((req, res) => {

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsed = url.parse(req.url, true);

    // Route : GET /open-gp?file=nom_du_fichier.gp
    if (parsed.pathname === '/open-gp') {
        const filename = parsed.query.file;

        if (!filename) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Paramètre "file" manquant.' }));
            return;
        }

        // Sécurité : ne garder que le nom de fichier (sans traversée de répertoire)
        const safeName = path.basename(filename);
        const baseNoExt = safeName.replace(/\.[^.]+$/, '');

        // Chercher le fichier GP quelle que soit l'extension supportée
        const GP_EXTENSIONS = ['.gp', '.gp5', '.gpx', '.gp4', '.gp7', '.gp8'];
        let filePath = null;
        for (const ext of GP_EXTENSIONS) {
            const candidate = path.join(GP_FOLDER, baseNoExt + ext);
            if (fs.existsSync(candidate)) { filePath = candidate; break; }
        }

        if (!filePath) {
            console.warn(`[open-gp] Fichier introuvable pour "${baseNoExt}" dans ${GP_FOLDER}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Fichier Guitar Pro introuvable pour "${baseNoExt}" (extensions testées : ${GP_EXTENSIONS.join(', ')}).` }));
            return;
        }

        console.log(`[open-gp] Ouverture : ${filePath}`);
        const platform = os.platform();

        // Échapper les caractères dangereux pour le shell
        const escapedPath = filePath.replace(/"/g, '\\"');

        // Sur macOS/Linux : `open` utilise l'association de fichier système
        // → fonctionne quelle que soit la version de Guitar Pro installée
        // Sur Windows : PowerShell Start-Process délègue aussi à l'association .gp
        const command = platform === 'win32'
            ? `powershell -Command "Start-Process \\"${filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}\\""`
            : `open "${escapedPath}"`;

        exec(command, (error) => {
            if (error) {
                console.error(`[open-gp] Erreur exec : ${error.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Impossible d'ouvrir le fichier Guitar Pro.", detail: error.message }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, file: path.basename(filePath) }));
        });

    // Route : GET /check-files?song=nom.json
    } else if (parsed.pathname === '/check-files') {
        const songFile = parsed.query.song;

        if (!songFile) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Paramètre "song" manquant.' }));
            return;
        }

        const base      = path.basename(songFile).replace('.json', '');
        const mediaRoot = path.join(__dirname, 'songs', 'multimedia');

        const GP_EXTENSIONS = ['.gp', '.gp5', '.gpx', '.gp4', '.gp7', '.gp8'];
        const hasGP = GP_EXTENSIONS.some(ext => fs.existsSync(path.join(mediaRoot, 'gp', base + ext)));

        const checks = {
            mp3:    fs.existsSync(path.join(mediaRoot, 'mp3',        base + '.mp3')),
            mp3bch: fs.existsSync(path.join(mediaRoot, 'mp3', 'bch', 'Bch' + base + '.mp3')),
            mp3bcg: fs.existsSync(path.join(mediaRoot, 'mp3', 'bcg', 'Bcg' + base + '.mp3')),
            mp3bgu: fs.existsSync(path.join(mediaRoot, 'mp3', 'bgu', 'Bgu' + base + '.mp3')),
            gp:     hasGP,
            mp4:    fs.existsSync(path.join(mediaRoot, 'mp4',        base + '.mp4')),
            pdf:    fs.existsSync(path.join(mediaRoot, 'pdf',        base + '.pdf')),
            pdfacc: fs.existsSync(path.join(mediaRoot, 'pdf', 'acc', base + '.pdf')),
        };

        console.log(`[check-files] ${base} :`, checks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checks));

    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Route inconnue.' }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur multimédia lancé sur http://localhost:${PORT}`);
    console.log(`   Route disponible : GET /open-gp?file=nom.gp`);
    console.log(`   Dossier GP       : ${GP_FOLDER}`);
    console.log(`   OS détecté       : ${os.platform()}`);
});
