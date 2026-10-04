# Déployer en ligne pour tester (Render.com, gratuit)

Ces fichiers (`package.json`, `.gitignore`, `lib/storage.js`, ce fichier) sont à ajouter à la racine de votre dépôt GitHub, à côté de `servAcc.js`, `index.html`, `css/`, `js/`, `lib/`, `data/`.

## Étape 1 — Créer une base Upstash Redis gratuite (persistance)

Sur le tier gratuit de Render, le disque n'est **pas garanti persistant** (il peut être réinitialisé à chaque redéploiement ou réveil après inactivité) : sans rien de plus, les comptes et répertoires personnels pourraient disparaître de temps en temps. Pour éviter ça, l'appli peut stocker ses données chez **Upstash** (gratuit, sans carte bancaire, sans limite de durée — contrairement à l'offre Postgres gratuite de Render qui expire au bout de 30 jours).

1. Allez sur [upstash.com](https://upstash.com), créez un compte gratuit.
2. Créez une base **Redis** (bouton *Create Database*), région au choix (prenez la plus proche de l'Europe si vous êtes en France).
3. Sur la page de la base, trouvez la section **REST API** : copiez les deux valeurs `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.

C'est tout — vous n'avez aucun code à écrire, juste ces deux valeurs à coller dans Render à l'étape 3.

## Étape 2 — Pousser le code sur GitHub

Poussez le dossier complet, **sauf** :
- `data/users.json` et `data/users/` (comptes et répertoires personnels) — le `.gitignore` fourni les exclut automatiquement, pour ne jamais publier de mots de passe hachés ou de données privées sur un repo. De toute façon, une fois Upstash branché, ces fichiers locaux ne servent plus en ligne.
- `server.js` (port 3001, Guitar Pro) si vous voulez garder le repo propre : il n'a aucune utilité en ligne (voir plus bas).

## Étape 3 — Créer le service sur Render

1. Sur [render.com](https://render.com), créez un compte puis *New → Web Service*, connectez votre dépôt GitHub.
2. Render détecte `package.json` et propose automatiquement :
   - **Build command** : laissez vide (rien à compiler, aucune dépendance)
   - **Start command** : `node servAcc.js` (déjà défini comme script `start` dans `package.json`)
3. Choisissez le plan **Free**.
4. Dans la section **Environment** du service, ajoutez trois variables :
   - `COOKIE_SECURE` = `1` (Render fournit du HTTPS automatiquement, le cookie de session doit être marqué comme tel)
   - `UPSTASH_REDIS_REST_URL` = (collée depuis Upstash à l'étape 1)
   - `UPSTASH_REDIS_REST_TOKEN` = (collée depuis Upstash à l'étape 1)
5. Déployez. Render vous donne une adresse publique du type `https://votre-service.onrender.com`.

D�s que ces deux variables Upstash sont présentes, le serveur bascule automatiquement dessus pour toutes ses données (comptes, répertoires) — vous le voyez confirmé au démarrage dans les logs Render : `Stockage : Upstash Redis (persistant en ligne)`. Sans ces variables (par exemple en local sur votre PC), il continue d'utiliser les fichiers locaux exactement comme avant — **rien ne change pour votre installation `C:\inetpub\wwwroot` actuelle**, les deux cohabitent sans conflit.

Vous n'avez rien à gérer manuellement comme avec vos scripts `stopstart*.js` : c'est Render qui démarre, surveille et relance le processus tout seul à chaque déploiement ou redémarrage.

## Une limite qui reste, quoi qu'on fasse

**Le serveur du port 3001 (`server.js`, ouverture Guitar Pro) ne fonctionnera jamais à distance** : il lance une application de bureau sur la machine qui exécute le serveur. En ligne, cette machine est celle de Render, pas celle de la personne qui consulte le site — ça n'a de sens que pour un usage local/réseau local, comme aujourd'hui.

## Limites du tier gratuit Upstash (largement suffisantes ici)

256 Mo de données et 500 000 commandes par mois, gratuit sans limite de durée. Pour une poignée d'utilisateurs et leurs répertoires de chansons, c'est très confortable — chaque sauvegarde/chargement de chanson compte pour quelques commandes seulement.
