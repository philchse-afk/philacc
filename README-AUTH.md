# Système de comptes — Mes Accords

## Ce qui a été ajouté

- **`server.js`** remplace `servAcc.js`. Il sert toujours les fichiers statiques exactement pareil, mais ajoute :
  - une API d'authentification (`/api/auth/...`)
  - une API d'administration des comptes (`/api/admin/...`)
  - une API de répertoire personnel (`/api/repertoire/...`)
  - un **détournement transparent** de `data/songs-index.json` et `songs/*.json` : un utilisateur normal y voit automatiquement *son* répertoire personnel, l'admin voit toujours le répertoire maître comme avant. **`js/app.js` n'a presque pas eu besoin d'être modifié** pour la lecture.
- **`js/auth-gate.js`** (nouveau, chargé avant `app.js`) : écran de connexion / inscription / attente d'approbation, barre de compte, panneau d'import depuis le répertoire admin, panneau d'administration.
- **`js/app.js`** : 2 petites modifications seulement :
  1. La fonction `saveSong()` sauvegarde directement via l'API pour un utilisateur normal (plus besoin de télécharger le fichier et de le replacer à la main) ; pour vous (admin), rien ne change.
  2. Le démarrage attend que `auth-gate.js` ait confirmé la connexion avant d'appeler `App.init()`.
- **`lib/users-store.js`**, **`lib/sessions.js`**, **`lib/repertoire.js`** : la logique serveur (comptes, sessions, fichiers).

`server.js` (port 3001, ouverture Guitar Pro / vérification médias) n'a pas besoin de changer : les fichiers médias (mp3/pdf/gp) restent une bibliothèque commune, partagée entre tous les comptes — seul le classement des chansons (qui a quoi dans sa liste, et les paroles/accords édités) est personnel.

## Installation

1. Copiez tous les fichiers de ce dossier **par-dessus** votre projet actuel (mêmes emplacements : `index.html`, `css/`, `js/`, `data/`, `songs/`).
2. Vérifiez que vos vrais fichiers `songs/*.json` et `data/songs-index.json` sont bien en place (ne les écrasez pas avec les miens si vous en avez une version plus à jour).
3. Aucune dépendance npm à installer — tout utilise uniquement les modules natifs de Node (`http`, `crypto`, `fs`). `node --version` ≥ 14 suffit (testé avec Node 22).
4. Démarrez avec :
   ```
   node server.js
   ```
   (au lieu de `node servAcc.js`, que vous pouvez garder de côté ou supprimer)
5. Ouvrez `http://localhost:5500` (ou l'IP de votre machine sur le réseau local) : vous verrez l'écran de connexion.
6. **Créez votre compte en premier** ("Créer un compte") : le tout premier compte créé sur l'installation devient automatiquement administrateur et est approuvé sans attente. Tous les comptes suivants sont créés « en attente » et doivent être approuvés par vous depuis le bouton *⚙️ Administration* (en haut à droite une fois connecté).

## Comment ça fonctionne pour un musicien du groupe

1. Il crée un compte (nom d'utilisateur + mot de passe).
2. Il attend votre approbation (bouton *Administration* → *Approuver*).
3. Une fois approuvé, il se connecte et arrive sur une appli **vide** au départ (son propre répertoire, distinct du vôtre).
4. Il clique sur *📥 Importer depuis le répertoire admin* : il voit la liste de vos chansons et choisit celles qu'il veut copier dans sa propre liste (une par une, ou "Tout importer"). Une fois importée, une chanson lui appartient : il peut la modifier (transposition, notes, marquage karaoké...) sans toucher à votre version.
5. Il peut aussi créer ses propres chansons de zéro (bouton habituel "Nouvelle chanson") — elles sont sauvegardées directement dans son répertoire, sans manipulation de fichier.
6. Vous, en tant qu'admin, continuez à gérer le répertoire maître exactement comme avant (téléchargement + collage dans `data/songs-index.json`) — les comptes des autres utilisateurs n'y touchent jamais.

## Pour la mise en ligne sur Internet ("les deux à terme")

Ce serveur ne fait pas de HTTPS lui-même. Pour l'exposer sur Internet en sécurité :

1. Mettez-le derrière un reverse proxy qui gère le HTTPS (ex. **Caddy** — un seul fichier de config, certificats automatiques via Let's Encrypt — ou nginx + certbot).
2. Démarrez le serveur avec la variable d'environnement `COOKIE_SECURE=1` :
   ```
   COOKIE_SECURE=1 node server.js
   ```
   Cela marque le cookie de session comme `Secure` (envoyé uniquement en HTTPS) — indispensable dès que l'appli quitte votre réseau local.
3. Pensez à changer les mots de passe de test et à ne pas exposer les ports 3001 (ouverture Guitar Pro) publiquement, celui-ci n'a de sens qu'en local.

## Limites connues / pistes d'amélioration si besoin

- Les sessions sont en mémoire : elles sont perdues si le serveur redémarre (il suffit de se reconnecter). Facile à changer plus tard si ça devient gênant.
- Pas de récupération de mot de passe oublié ; en cas de blocage, vous (admin) pouvez supprimer le compte concerné et laisser la personne se réinscrire.
- Pas de protection CSRF dédiée au-delà du cookie `SameSite=Lax` — largement suffisant pour un usage à quelques utilisateurs, mais si l'appli devient publique/à fort trafic, on pourra ajouter un jeton CSRF dédié.
- Anti brute-force basique (5 essais puis blocage 5 minutes par IP+utilisateur) — pas un vrai rate-limiting distribué, mais suffisant à cette échelle.
