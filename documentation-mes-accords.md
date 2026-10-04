# Documentation — Mes Accords

Application web pour un groupe de musique : gestion d'un répertoire de chansons (paroles + accords), affichage en répétition/scène avec défilement automatique, et outils de karaoké synchronisé sur MP3 (accords et/ou paroles minutés à la seconde près).

C'est un **site statique** — pas de base de données. Chaque chanson est un fichier JSON dans `songs/`, et l'index du répertoire est `data/songs-index.json`. Seul un petit serveur Node local (`check-files`, port 3001) existe côté serveur, uniquement pour vérifier la présence de fichiers média (MP3/PDF/Guitar Pro) — il n'écrit rien.

---

## 1. Vue d'ensemble

L'application s'organise en 4 grands espaces :

| Espace | Rôle |
|---|---|
| **Accueil** | Recherche et liste de tout le répertoire, groupé par artiste |
| **Listes** | Le même répertoire, groupé par liste/setlist (ex. "Répétition du mardi") |
| **Fiche chanson** | Affichage plein écran d'une chanson : paroles + accords, défilement auto, karaoké |
| **Éditeur** | Création/modification d'une chanson : texte, métadonnées, minutage karaoké |

La navigation entre Accueil et Listes se fait par les deux onglets en haut de l'écran. La Fiche chanson et l'Éditeur s'ouvrent en cliquant sur une chanson dans la liste, ou sur les boutons "+" / "Éditer".

---

## 2. Liste des chansons (Accueil / Listes)

Chaque chanson apparaît sous forme d'une ligne cliquable, groupée par artiste (Accueil) ou par liste (Listes), avec deux indicateurs visuels à droite :

- **🔁 Compteur d'ouvertures** — nombre de fois où la chanson a été ouverte *sur ce navigateur*. Sa couleur évolue vers le chaud par paliers de 5 ouvertures (neutre → jaune → orange → rouge à partir de 35). Il ne commence à compter qu'une fois la chanson marquée **OK** dans l'éditeur (voir §4.1) — les ouvertures pendant la mise au point d'une chanson ne sont pas comptées. Décocher OK remet ce compteur à zéro. C'est un repère personnel, propre à chaque navigateur : il n'est pas partagé entre les membres du groupe.
- **Jauge de médias** (6 pastilles) — indique en un coup d'œil ce qui est disponible pour cette chanson :

| Pastille | Signifie |
|---|---|
| ♪ MP3 | Piste(s) audio présente(s). Bleu vif si les 4 pistes (originale + basse/chant/guitare isolées) existent, bleu clair si seulement 2, pastel sinon |
| ▶︎ MP4 | Vidéo tuto/démo présente |
| ⊞ PDF | Partition/grille PDF exportée disponible |
| 𝄢 Guitar Pro | Fichier Guitar Pro disponible |
| ⏵ Étude | Un lien tuto YouTube et/ou KFN est renseigné |
| 🎤 Karaoké | Vert plein si accords **et** paroles sont minutés (+ MP3 présent) ; vert clair si un seul des deux ; orange si des repères existent mais qu'aucun MP3 n'est disponible pour les jouer |

---

## 3. Fiche chanson (lecture)

Vue plein écran utilisée en répétition ou sur scène :

- **Paroles + accords** rendus en grand, accords affichés au-dessus du mot où ils tombent (badges cliquables ouvrant leur diagramme guitare/piano).
- **Défilement automatique** (♪ Scroll), calé sur le BPM ou synchronisé au MP3.
- **Métronome** intégré, réglable sur le rythme renseigné dans la fiche.
- **Lecture karaoké** (bouton dédié) — voir §6.
- Bascule **guitare / piano** pour les diagrammes d'accords.
- **Plein écran paroles** (⛶) pour masquer l'interface et n'afficher que le texte.

---

## 4. Module Éditeur

C'est ici que tout le contenu d'une chanson est saisi et minuté. L'éditeur se divise en trois zones empilées : les **métadonnées** (2 lignes de champs), les **outils** (4 encadrés de boutons), et la **zone de texte** elle-même.

### 4.1 Métadonnées — ligne 1

| Champ | Rôle |
|---|---|
| Titre | Sert aussi à générer le nom du fichier de sauvegarde |
| Artiste | Utilisé aussi par le bouton 📖 Wiki (§4.3) pour rechercher la présentation Wikipedia |
| Capo | Position du capodastre pour jouer tel qu'écrit |
| Capo rec. | Position de capo *recommandée* (si différente, pour une tonalité plus confortable) |
| Tonalité | Ex. `F#m` |
| BPM | Tempo — utilisé par le métronome, le défilement auto, et **⏱⚡ Marquer (auto BPM)** |
| Mesure | 4/4, 3/4, 6/8, etc. |
| **OK** | Coché quand tous les outils (MP3, tuto, minutage…) sont réunis pour cette chanson. Déclenche le compteur d'ouvertures (§2) ; le décocher le remet à zéro. |

### 4.2 Métadonnées — ligne 2

| Champ | Rôle |
|---|---|
| Listes | Liste(s)/setlist(s) auxquelles rattacher la chanson (séparées par virgule) — détermine le groupement dans l'onglet *Listes* |
| Rythmique | Motif rythmique de gratte (`b`=bas, `h`=haut, `gb`/`gh`=ghost note, `/` = mesure) — affiché sous forme de schéma dans la fiche chanson. Une pastille **i** au survol rappelle la légende des symboles. |
| URL Tuto | Lien YouTube d'un tuto ; case à cocher juste après pour indiquer si son intégration (embed) fonctionne |
| URL KFN | Lien YouTube "Karaoké Fond Noir" (ou équivalent) ; même case embed |

### 4.3 Encadré "Outils éditeur"

| Bouton | Action |
|---|---|
| ⛶ | Plein écran d'édition |
| `{{}}` | Insère une paire d'accolades vides à la position du curseur, pour taper un accord |
| `vvvv[]` `pppp[]` `rrrr[]` `ssss[]` | Insèrent un marqueur de section en début de ligne : Couplet, Pont, Refrain, Solo (voir §4.7 pour la syntaxe) |
| 📌 *(infobulle)* | Rappel des règles d'affichage PDF pour `vvvv`/`pppp` (répétition de section) |
| 🎬 Kvideo | Insère la balise de vidéo de fond karaoké, toujours en fin de texte |
| 📌 Post-it | Insère un post-it image à la ligne du curseur (visible en marge de la fiche chanson à cet endroit précis) |
| 📖 Wiki | Recherche la présentation Wikipedia de l'artiste (champ Artiste requis) et l'insère en fin de texte, dans un bloc grisé ignoré du marquage/karaoké/PDF |
| ↺ Marquage | Efface *tous* les repères de minutage (accords **et** paroles) de la chanson en cours, après confirmation — utile après une modification du texte qui aurait désynchronisé les repères existants |
| ♫ Fondu | Style de bouton harmonisé avec les autres (voir historique — sa fonction d'origine a été remplacée par 📖 Wiki) |

### 4.4 Encadré "Lecteur audio"

Permet d'écouter le MP3 directement dans l'éditeur pendant la saisie/le minutage :

- **▶ MP3** : lance/met en pause la lecture
- **⏹** : stop
- **🎸 Accord** : ouvre le générateur de diagramme d'accord (pour ajouter un accord non répertorié à la base)

### 4.5 Encadré "Marquage accords"

Minutage seconde par seconde des accords, à l'écoute du MP3 :

- **⏱ Marquer** : pose un repère de temps sur l'accord courant (avance ensuite automatiquement au suivant)
- **⏱⚡ Marquer (auto BPM)** : pose une seule ancre manuelle, puis calcule automatiquement le temps de tous les accords suivants à partir de leur durée `[num/den]` (§4.7) et du BPM renseigné — à réappuyer si le rythme change en cours de morceau
- **▶ Au curseur** : reprend le marquage à partir de l'accord situé à la position du curseur dans le texte, sans toucher aux repères déjà posés avant — pratique pour corriger/compléter une chanson déjà partiellement minutée

### 4.6 Encadré "Marquage paroles"

Minutage indépendant des paroles, mot par mot (alimente le mode karaoké "paroles" — voir §6) :

- **🎤 Marquer** : pose un repère sur le mot courant, avance au suivant
- **📥 Importer LRC** : pré-remplit le minutage à partir d'un fichier `.lrc` (ex. LRCLib.net) — répartit les mots arithmétiquement dans la fenêtre de temps de chaque ligne ; marquage repéré comme *estimé*
- **▶ Au curseur** : reprend le marquage au mot situé sous le curseur, sans écraser ce qui précède
- **📏 Marquage ligne** : marquage rapide alternatif — réutilise le temps du 1er accord déjà marqué (⏱) sur chaque ligne comme instant de départ de cette ligne entière, plutôt que de re-minuter mot par mot ; marquage lui aussi repéré comme *estimé*
- **[|] Syllabe** : insère un séparateur de syllabe dans le texte, pour marquer une chanson syllabe par syllabe plutôt que mot par mot (ex. `cha[|]leu[|]reux`)

> **Marquage "estimé" vs "précis"** : tant que *tous* les repères de paroles d'une chanson proviennent d'un import LRC ou d'un marquage ligne (jamais affinés au mot près via 🎤 Marquer), la lecture karaoké affiche chaque ligne **entière** en surlignage uniforme plutôt qu'un défilement mot par mot — pour ne pas donner une fausse impression de précision. Dès qu'un seul mot est réaffiné manuellement, la chanson redevient éligible au surlignage mot par mot dès que *plus aucun* repère n'est estimé.

### 4.7 Zone de texte — syntaxe

Le texte de la chanson mêle paroles et balisage, entièrement fait à la main :

| Syntaxe | Effet |
|---|---|
| `{{Am}}` | Accord affiché en badge au-dessus du mot/de la syllabe qui suit |
| `{{Am}}[1/2]` | Accord avec durée (numérateur/dénominateur de mesure) — utilisée par ⏱⚡ Marquer (auto BPM) |
| `vvvv[Couplet 1]` | Début d'une section "Couplet" |
| `pppp[Pont]` | Début d'une section "Pont" |
| `rrrr[Refrain]` | Début d'une section "Refrain" |
| `ssss[Solo]` | Début d'une section "Solo" |
| `>>>>texte` | Ligne de texte libre (tablature, bloc Wikipedia…) : affichée à part (fond gris), jamais traitée comme parole ou accord |
| `**texte**` | Surlignage "choeur" |
| `++texte++` | Surlignage "lead" |
| `--texte--` | Surlignage "mutter" (murmuré) |
| `&&texte&&` | Surlignage "libre" |
| `[|]` | Séparateur de syllabe (invisible à l'affichage, sert uniquement au marquage karaoké) |
| `[!]` | Marqueur pivot (invisible à l'affichage) |
| `<link rel="Kvideo" href="...">` | Vidéo de fond karaoké (toujours en fin de texte) |
| `<link rel="imageN" href="...">` | Post-it image, positionné à la ligne où il est inséré |

Un accord peut tomber **au milieu d'un mot** (ex. `n{{D2}}o`) : le mot reste traité comme une seule unité pour le marquage et l'affichage, seul son rendu visuel est coupé par le badge d'accord.

Un mot peut porter à la fois un type de surlignage (choeur/lead/mutter/libre) et un accord : les deux se combinent sans conflit, y compris en lecture karaoké où chaque type de voix a sa propre couleur de texte (§6).

### 4.8 Enregistrement

**Il n'y a pas d'enregistrement automatique côté serveur.** Le bouton *Enregistrer* :

1. Génère le fichier JSON de la chanson et déclenche son **téléchargement** dans le navigateur.
2. Copie dans le presse-papiers l'entrée correspondante à coller manuellement dans `data/songs-index.json`.

Il faut ensuite, manuellement : déposer le fichier téléchargé dans `songs/`, coller l'entrée dans l'index, et redéployer/republier le site pour que le changement soit visible par tout le groupe.

---

## 5. Karaoké — modes de lecture

Trois modes, choisis à l'ouverture du karaoké selon ce qui est minuté sur la chanson :

- **Accords** — les paroles défilent, l'accord en cours est mis en évidence au-dessus du mot correspondant (texte ou diagramme guitare, bascule possible).
- **Paroles** — surlignage mot par mot (ou syllabe par syllabe si `[|]` est utilisé) piloté uniquement par le minutage indépendant des paroles.
- **Les 2** — les deux minutages combinés : accord en cours affiché, mots déjà "chantés" grisés au fil du morceau.

Les mots surlignés (**choeur**/++lead++/--mutter--/&&libre&&) apparaissent en couleur distincte pendant la lecture karaoké (vert / orange / rouge / violet), pour repérer d'un coup d'œil qui doit chanter quoi.

---

## 6. Limitations connues

- **Site statique, pas de backend d'écriture** : toute sauvegarde de chanson est un aller-retour manuel (téléchargement + dépôt de fichier + mise à jour de l'index).
- **Compteur d'ouvertures personnel** : pas de statistique partagée entre les membres du groupe sans ajouter un petit service côté serveur (le serveur `check-files` existant pourrait être étendu pour ça).
- **Renommer une chanson** (changement de titre) génère un nouveau nom de fichier : le minutage et le compteur d'ouvertures de l'ancien fichier ne suivent pas automatiquement.
