// js/lyrics-fit.js — ajustement à la page du texte en plein écran (paroles)
// -----------------------------------------------------------------------------
// Chargé sur TOUS les appareils (maître et écrans déportés), avant sync.js.
//
// En plein écran, le texte (#song-content-display) est présenté de la façon la plus
// confortable qui TIENNE SANS DÉFILEMENT, à taille de texte inchangée :
//     1 colonne  si tout tient  ->  sinon 2 colonnes (au maximum)  si tout tient ainsi
//     ->  sinon 1 colonne avec défilement vertical, comme avant (chanson trop longue).
//
// La décision dépend des dimensions de l'écran qui affiche : le maître la prend avec la
// sienne (app.js : _fitLyricsFullscreen), chaque écran déporté la reprend avec la sienne
// (sync.js, qui n'exécute pas app.js). Les deux utilisent ce même module : une seule
// définition de la mise en page et une seule règle de décision.
//
//   LyricsFit.css(sel)               règles CSS de la disposition en 2 colonnes pour le sélecteur sel
//   LyricsFit.signature(el)          empreinte (contenu + dimensions) : inutile de recalculer si inchangée
//   LyricsFit.fit(el, setTwoCols)    décide et applique via setTwoCols(true|false) ; renvoie 1, 2 ou 0
//                                    (0 = ne tient pas : défilement ; -1 = rien à mesurer)
// -----------------------------------------------------------------------------
(function () {
    'use strict';

    // column-fill: balance : les deux colonnes sont équilibrées (même hauteur). break-inside: avoid :
    // une ligne (accords + paroles) n'est jamais coupée entre deux colonnes. Préfixes -webkit- pour
    // Safari (iPad). Les boutons flottants du plein écran sont en position: fixed : hors des colonnes.
    const TWO_COLS = 'column-count:2 !important;-webkit-column-count:2 !important;' +
        'column-gap:5vw !important;-webkit-column-gap:5vw !important;column-fill:balance !important;';
    const KEEP_LINES = 'break-inside:avoid !important;-webkit-column-break-inside:avoid !important;' +
        'page-break-inside:avoid !important;';

    function css(sel) {
        return sel + '{' + TWO_COLS + '}' + sel + '>*{' + KEEP_LINES + '}';
    }

    // Change quand le texte change (chanson, transposition, accords affichés/masqués) ou que la zone
    // change de taille (rotation, redimensionnement). Le surlignage (classes) ne la modifie pas.
    function signature(el) {
        return el.textContent.length + ':' + el.childElementCount + ':' + el.clientWidth + 'x' + el.clientHeight;
    }

    function fit(el, setTwoCols) {
        if (!el || !el.clientHeight || !el.clientWidth) return -1;       // pas affiché : rien à mesurer
        setTwoCols(false);
        if (el.scrollHeight <= el.clientHeight + 1) return 1;            // 1 colonne : tout tient
        setTwoCols(true);
        // Deux colonnes de hauteur imposée : si le texte ne tient pas, le navigateur ajoute des colonnes
        // débordantes vers la DROITE (scrollWidth augmente) au lieu d'allonger la page vers le bas.
        if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return 2;
        setTwoCols(false);                                               // ne tient pas : comportement d'avant
        return 0;
    }

    window.LyricsFit = { css, signature, fit, CLASS_2COL: 'lyrics-fit-2col' };

    // Poste maître : la disposition est pilotée par une classe sur l'élément (voir app.js). Les règles sont
    // injectées ici, avant sync.js, pour ne pas être envoyées aux écrans déportés comme style « dynamique ».
    const style = document.createElement('style');
    style.id = 'lyrics-fit-css';
    style.textContent = css('#song-content-display.' + window.LyricsFit.CLASS_2COL);
    (document.head || document.documentElement).appendChild(style);
})();
