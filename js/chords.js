/**
 * chords.js — Diagrammes guitare au survol des accords
 * Base : tombatossals/chords-db (doigtés vérifiés)
 * Format interne : [baseFret, [e,B,G,D,A,E]]  -1=muette  0=à vide  1-5=case relative
 */
const ChordDB = (() => {

    const BUILT_IN = {"C":[1,[0,1,0,2,3,0]],"C#":[4,[1,1,3,3,3,1]],"Db":[4,[1,1,3,3,3,1]],"D":[1,[2,3,2,0,-1,-1]],"D#":[6,[1,1,3,3,3,1]],"Eb":[6,[1,1,3,3,3,1]],"E":[1,[0,0,1,2,2,0]],"F":[1,[1,1,2,3,3,1]],"F#":[1,[2,2,3,4,4,2]],"Gb":[1,[2,2,3,4,4,2]],"G":[1,[3,0,0,0,2,3]],"G#":[4,[1,1,2,3,3,1]],"Ab":[4,[1,1,2,3,3,1]],"A":[1,[0,2,2,2,0,0]],"A#":[1,[1,3,3,3,1,1]],"Bb":[1,[1,3,3,3,1,1]],"B":[1,[2,4,4,4,2,2]],"Cm":[1,[3,4,5,5,3,3]],"C#m":[4,[1,2,3,3,1,1]],"Dbm":[4,[1,2,3,3,1,1]],"Dm":[1,[1,3,2,0,-1,-1]],"D#m":[6,[1,2,3,3,1,1]],"Ebm":[6,[1,2,3,3,1,1]],"Em":[1,[0,0,0,2,2,0]],"Fm":[1,[1,1,1,3,3,1]],"F#m":[1,[2,2,2,4,4,2]],"Gbm":[1,[2,2,2,4,4,2]],"Gm":[1,[3,3,3,5,5,3]],"G#m":[4,[1,1,1,3,3,1]],"Abm":[4,[1,1,1,3,3,1]],"Am":[1,[0,1,2,2,0,0]],"A#m":[1,[1,2,3,3,1,1]],"Bbm":[1,[1,2,3,3,1,1]],"Bm":[1,[2,3,4,4,2,2]],"C7":[1,[0,1,3,2,3,0]],"C#7":[4,[1,2,1,3,1,1]],"Db7":[4,[1,2,1,3,1,1]],"D7":[1,[2,1,2,0,-1,-1]],"D#7":[6,[1,2,1,3,1,1]],"Eb7":[6,[1,2,1,3,1,1]],"E7":[1,[0,0,1,0,2,0]],"F7":[1,[1,1,2,1,3,1]],"F#7":[1,[2,2,3,2,4,2]],"Gb7":[1,[2,2,3,2,4,2]],"G7":[1,[1,0,0,0,2,3]],"G#7":[4,[1,1,2,1,3,1]],"Ab7":[4,[1,1,2,1,3,1]],"A7":[1,[0,2,0,2,0,0]],"A#7":[1,[1,3,1,3,1,1]],"Bb7":[1,[1,3,1,3,1,1]],"B7":[1,[-1,0,2,1,2,2]],"Cm7":[1,[3,4,3,5,3,3]],"C#m7":[4,[1,2,1,3,1,1]],"Dbm7":[4,[1,2,1,3,1,1]],"Dm7":[1,[1,1,2,0,-1,-1]],"D#m7":[6,[1,2,1,3,1,1]],"Ebm7":[6,[1,2,1,3,1,1]],"Em7":[1,[0,3,0,2,2,0]],"Fm7":[1,[1,1,1,1,3,1]],"F#m7":[1,[2,2,2,2,4,2]],"Gbm7":[1,[2,2,2,2,4,2]],"Gm7":[1,[3,3,3,3,5,3]],"G#m7":[4,[1,1,1,1,3,1]],"Abm7":[4,[1,1,1,1,3,1]],"Am7":[1,[0,1,0,2,0,0]],"A#m7":[1,[1,2,1,3,1,1]],"Bbm7":[1,[1,2,1,3,1,1]],"Bm7":[1,[2,3,2,4,2,2]],"Cmaj7":[1,[0,0,0,2,3,0]],"C#maj7":[4,[1,3,3,3,1,1]],"Dbmaj7":[4,[1,3,3,3,1,1]],"Dmaj7":[1,[2,2,2,0,-1,-1]],"D#maj7":[6,[1,3,3,3,1,1]],"Ebmaj7":[6,[1,3,3,3,1,1]],"Emaj7":[1,[0,0,1,1,2,0]],"Fmaj7":[1,[0,1,2,3,-1,1]],"F#maj7":[1,[2,2,3,3,4,2]],"Gbmaj7":[1,[2,2,3,3,4,2]],"Gmaj7":[1,[2,0,0,0,2,3]],"G#maj7":[4,[1,1,2,2,3,1]],"Abmaj7":[4,[1,1,2,2,3,1]],"Amaj7":[1,[0,2,1,2,0,0]],"A#maj7":[1,[1,3,2,3,1,1]],"Bbmaj7":[1,[1,3,2,3,1,1]],"Bmaj7":[1,[2,4,3,4,2,2]],"Csus2":[1,[0,1,0,0,3,0]],"Dsus2":[1,[0,3,2,0,-1,-1]],"Esus2":[1,[0,0,1,2,2,0]],"Gsus2":[1,[1,0,0,0,2,3]],"Asus2":[1,[0,0,2,2,0,0]],"Bsus2":[1,[2,2,4,4,2,2]],"Csus4":[1,[0,1,0,3,3,0]],"D(sus4)":[1,[3,3,2,0,-1,-1]],"Esus4":[1,[0,0,2,2,2,0]],"Gsus4":[1,[3,1,0,0,2,3]],"Asus4":[1,[0,3,2,2,0,0]],"Bsus4":[1,[2,5,4,4,2,2]],"Cadd9":[1,[0,3,0,2,3,0]],"Dadd9":[1,[0,3,2,0,-1,-1]],"Eadd9":[1,[2,0,1,2,2,0]],"Gadd9":[1,[3,0,2,0,2,3]],"Aadd9":[1,[0,2,4,2,0,0]],"Cdim":[1,[-1,-1,2,4,3,-1]],"C#dim":[1,[-1,-1,3,5,4,-1]],"Ddim":[1,[1,0,1,0,-1,-1]],"D#dim":[1,[2,1,2,1,-1,-1]],"Ebdim":[1,[2,1,2,1,-1,-1]],"Edim":[1,[-1,-1,3,2,1,0]],"Fdim":[1,[-1,-1,4,3,2,1]],"F#dim":[1,[-1,-1,1,0,0,2]],"Gdim":[1,[-1,-1,3,5,4,-1]],"G#dim":[1,[2,1,2,1,0,-1]],"Adim":[1,[-1,-1,0,2,1,0]],"Bbdim":[1,[-1,-1,1,3,2,1]],"Bdim":[1,[-1,-1,2,4,3,2]],"Caug":[1,[0,1,1,2,3,0]],"Daug":[1,[2,3,3,0,-1,-1]],"Eaug":[1,[0,1,1,2,3,0]],"Faug":[1,[1,2,2,3,0,1]],"F#aug":[1,[2,3,3,0,1,2]],"Gaug":[1,[3,0,0,1,2,3]],"Aaug":[1,[1,2,2,3,0,0]],"Baug":[1,[3,0,0,1,2,2]],"G/B":[1,[3,0,0,0,2,2]],"D/F#":[1,[2,3,2,0,0,2]],"C/G":[1,[0,1,0,2,3,3]],"C/E":[1,[0,1,0,2,3,0]],"Am/E":[1,[0,1,2,2,0,0]],"F/C":[1,[1,1,2,3,3,3]],"E/G#":[1,[0,0,1,2,2,4]]};

    let DB = { ...BUILT_IN };

    // Convertit un accord du format chords.json [baseFret, [E,A,D,G,B,e]]
    // vers le format interne [baseFret, [e,B,G,D,A,E]] (reverse)
    function convertExternal(data) {
        if (!Array.isArray(data) || data.length !== 2) return data;
        const [baseFret, frets] = data;
        if (!Array.isArray(frets) || frets.length !== 6) return data;
        return [baseFret, [...frets].reverse()];
    }

    // ── ANALYSE DU NOM D'ACCORD (pour le clavier piano) ─────────────────────
    // Contrairement aux diagrammes guitare (issus de doigtés tabulés), le piano
    // est calculé directement depuis le NOM de l'accord (fondamentale + qualité),
    // ce qui fonctionne pour n'importe quel accord, même absent de la base guitare.
    const NOTE_TO_PC = {
        C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6,
        G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11
    };

    // Intervalles en demi-tons depuis la fondamentale, par qualité d'accord
    // (clé = suffixe du nom une fois les parenthèses retirées, ex: "m7(add11)" → "m7add11")
    const SUFFIX_INTERVALS = {
        '':          [0,4,7],
        '5':         [0,7],
        '5open':     [0,7],
        'm':         [0,3,7],
        '7':         [0,4,7,10],
        'm7':        [0,3,7,10],
        'maj7':      [0,4,7,11],
        'mmaj7':     [0,3,7,11],
        'sus2':      [0,2,7],
        'sus4':      [0,5,7],
        '7sus4':     [0,5,7,10],
        'add9':      [0,4,7,2],
        'madd9':     [0,3,7,2],
        'add11':     [0,4,7,5],
        'm7add11':   [0,3,7,10,5],
        '6':         [0,4,7,9],
        'm6':        [0,3,7,9],
        'msus46':    [0,5,7,9],
        '9':         [0,4,7,10,2],
        'm9':        [0,3,7,10,2],
        'maj9':      [0,4,7,11,2],
        'dim':       [0,3,6],
        'dim7':      [0,3,6,9],
        'aug':       [0,4,8],
        '7b5':       [0,4,6,10],
        'm7b5':      [0,3,6,10],
        '11':        [0,4,7,10,2,5],
        '13':        [0,4,7,10,2,9]
    };

    // Retourne { pitchClasses, rootPc, bassPc } ou null si le nom est illisible.
    function getPiano(name) {
        if (!name) return null;
        const [main, bassName] = name.split('/');
        const rootMatch = main.match(/^[A-G][b#]?/);
        if (!rootMatch) return null;
        const root = rootMatch[0];
        const rootPc = NOTE_TO_PC[root];
        if (rootPc === undefined) return null;

        const suffix = main.slice(root.length).replace(/[()]/g, '');
        const intervals = SUFFIX_INTERVALS[suffix] || SUFFIX_INTERVALS[''];
        const pitchClasses = [...new Set(intervals.map(iv => (rootPc + iv) % 12))];

        let bassPc = null;
        if (bassName) {
            const bm = bassName.match(/^[A-G][b#]?/);
            if (bm && NOTE_TO_PC[bm[0]] !== undefined) bassPc = NOTE_TO_PC[bm[0]];
        }
        return { pitchClasses, rootPc, bassPc };
    }

    async function loadExternal() {
        try {
            const res = await fetch('data/chords.json?' + Date.now());
            if (!res.ok) return;
            const ext = await res.json();
            const converted = {};
            for (const [name, data] of Object.entries(ext)) {
                if (name.startsWith('_comment')) continue;
                converted[name] = convertExternal(data);
            }
            DB = { ...BUILT_IN, ...converted };
            console.log('[ChordDB]', Object.keys(converted).length, 'accords externes chargés');
        } catch(e) { /* fichier absent, on garde la base */ }
    }

    function get(name) {
        if (DB[name]) return DB[name];
        // Enharmoniques
        const enh = {'Ab':'G#','Bb':'A#','Cb':'B','Db':'C#','Eb':'D#','Gb':'F#',
                     'G#':'Ab','A#':'Bb','C#':'Db','D#':'Eb','F#':'Gb'};
        const root = name.match(/^[A-G][b#]?/)?.[0] || '';
        const suffix = name.slice(root.length);
        const alt = enh[root];
        if (alt && DB[alt + suffix]) return DB[alt + suffix];
        return null;
    }

    // ── GÉNÉRATEUR SVG ───────────────────────────────────────────────────────
    function buildSVG(name, data) {
        const [baseFret, strings] = data;
        // strings = [e, B, G, D, A, E]

        const W = 140, H = 170;
        const mL = 28, mT = 42, mR = 12;
        const nStrings = 6, nFrets = 5;
        const cW = (W - mL - mR) / (nStrings - 1);
        const cH = 22;
        const dotR = 7;

        let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
        s += `<rect width="${W}" height="${H}" fill="#fffef8" rx="8"/>`;

        // Nom
        s += `<text x="${W/2}" y="16" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="14" fill="#1b5e20">${name}</text>`;

        // Sillet ou numéro de frette
        if (baseFret === 1) {
            s += `<rect x="${mL}" y="${mT-5}" width="${cW*(nStrings-1)}" height="5" fill="#333" rx="1"/>`;
        } else {
            s += `<text x="${mL-4}" y="${mT+cH*0.6}" text-anchor="end" font-family="Arial" font-size="11" fill="#555">${baseFret}fr</text>`;
        }

        // Frettes
        for (let f = 0; f <= nFrets; f++) {
            const y = mT + f * cH;
            s += `<line x1="${mL}" y1="${y}" x2="${mL+cW*(nStrings-1)}" y2="${y}" stroke="#ccc" stroke-width="1"/>`;
        }
        // Cordes : strings=[e,B,G,D,A,E], on affiche E à gauche, e à droite
        // index 5 (E grave) → position x=mL, index 0 (e aigu) → position x=mL+cW*5
        const strX = (si) => mL + (nStrings - 1 - si) * cW;

        for (let i = 0; i < nStrings; i++) {
            const x = mL + i * cW;
            const thickness = 0.8 + (nStrings - 1 - i) * 0.2; // E gauche plus épaisse
            s += `<line x1="${x}" y1="${mT}" x2="${x}" y2="${mT+cH*nFrets}" stroke="#aaa" stroke-width="${thickness}"/>`;
        }

        // Détection barré
        const fretCounts = {};
        strings.forEach((f,i) => { if(f>0){ fretCounts[f] = fretCounts[f]||[]; fretCounts[f].push(i); } });
        const barres = {};
        for (const [fret, indices] of Object.entries(fretCounts)) {
            if (indices.length >= 4) {
                const sorted = [...indices].sort((a,b)=>a-b);
                const span = sorted[sorted.length-1] - sorted[0];
                if (span >= 3) barres[fret] = { from: sorted[0], to: sorted[sorted.length-1] };
            }
        }

        // Dessiner les barrés (X inversé : index haut = gauche)
        for (const [fret, bar] of Object.entries(barres)) {
            const y = mT + (parseInt(fret) - 0.5) * cH;
            const x1 = strX(bar.to);
            const x2 = strX(bar.from);
            s += `<rect x="${x1-dotR*0.6}" y="${y-dotR}" width="${x2-x1+dotR*1.2}" height="${dotR*2}" fill="#2e7d32" rx="${dotR}"/>`;
        }

        // Doigtés individuels
        strings.forEach((fret, si) => {
            const x = strX(si);
            if (fret === -1) {
                const cy = mT - 14;
                s += `<line x1="${x-5}" y1="${cy-5}" x2="${x+5}" y2="${cy+5}" stroke="#c00" stroke-width="2"/>`;
                s += `<line x1="${x+5}" y1="${cy-5}" x2="${x-5}" y2="${cy+5}" stroke="#c00" stroke-width="2"/>`;
            } else if (fret === 0) {
                s += `<circle cx="${x}" cy="${mT-14}" r="5" fill="none" stroke="#2e7d32" stroke-width="1.8"/>`;
            } else {
                // Ne pas redessiner si c'est un barré
                const bar = barres[fret];
                if (bar && si >= bar.from && si <= bar.to) return;
                const cy = mT + (fret - 0.5) * cH;
                s += `<circle cx="${x}" cy="${cy}" r="${dotR}" fill="#2e7d32"/>`;
            }
        });

        s += '</svg>';
        return s;
    }

    // ── GÉNÉRATEUR SVG — CLAVIER PIANO ──────────────────────────────────────
    // pianoData = { pitchClasses, rootPc, bassPc } (voir getPiano)
    // Une octave, fondamentale en vert soutenu, autres notes de l'accord en vert
    // clair, note de basse (accord avec /) en bleu si distincte de la fondamentale.
    function buildPianoSVG(name, pianoData) {
        const { pitchClasses, rootPc, bassPc } = pianoData;

        const W = 140, H = 130;
        const mT = 34;
        const whiteW = 20, whiteH = 90, blackW = 12, blackH = 55;
        // pitch class → index parmi les 7 touches blanches (C D E F G A B)
        const WHITE_ORDER = [0, 2, 4, 5, 7, 9, 11];
        // pitch class → position x des touches noires (entre les touches blanches concernées)
        const BLACK_KEYS = [[1, 14], [3, 34], [6, 74], [8, 94], [10, 114]];

        const colorFor = (pc) => {
            if (pc === rootPc) return '#2e7d32';                       // fondamentale
            if (bassPc !== null && pc === bassPc) return '#4fa8d8';     // note de basse (slash)
            if (pitchClasses.includes(pc)) return '#a5d6a7';            // autre note de l'accord
            return null; // touche inactive
        };

        let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
        s += `<rect width="${W}" height="${H}" fill="#fffef8" rx="8"/>`;
        s += `<text x="${W/2}" y="16" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="14" fill="#1b5e20">${name}</text>`;

        // Touches blanches
        WHITE_ORDER.forEach((pc, i) => {
            const x = i * whiteW;
            const active = colorFor(pc);
            s += `<rect x="${x}" y="${mT}" width="${whiteW}" height="${whiteH}" fill="${active || '#fff'}" stroke="#555" stroke-width="1"/>`;
        });
        // Touches noires (par-dessus, plus courtes)
        BLACK_KEYS.forEach(([pc, x]) => {
            const active = colorFor(pc);
            s += `<rect x="${x}" y="${mT}" width="${blackW}" height="${blackH}" fill="${active || '#222'}" stroke="#000" stroke-width="1"/>`;
        });

        s += '</svg>';
        return s;
    }

    // ── PRÉFÉRENCE D'INSTRUMENT (guitare / piano) ───────────────────────────
    // Contrôle quel diagramme est utilisé par showTooltip() (survol dans le texte)
    // et peut être consulté par app.js pour le mode Diagrammes du karaoké.
    // Mémorisée pour ne pas avoir à recocher à chaque chanson.
    let currentInstrument = 'guitar';
    try {
        const saved = localStorage.getItem('chordInstrument');
        if (saved === 'piano' || saved === 'guitar') currentInstrument = saved;
    } catch (e) { /* localStorage indisponible : on garde le défaut */ }

    function setInstrument(mode) {
        currentInstrument = (mode === 'piano') ? 'piano' : 'guitar';
        try { localStorage.setItem('chordInstrument', currentInstrument); } catch (e) {}
    }
    function getInstrument() { return currentInstrument; }

    // Construit le SVG à afficher pour un accord, selon l'instrument choisi.
    // Retourne '' si l'accord est illisible / absent.
    function buildDiagramSVG(name) {
        if (currentInstrument === 'piano') {
            const pdata = getPiano(name);
            return pdata ? buildPianoSVG(name, pdata) : '';
        }
        const data = get(name);
        return data ? buildSVG(name, data) : '';
    }

    // ── TOOLTIP ──────────────────────────────────────────────────────────────
    let tooltip = null;

    function ensureTooltip() {
        if (tooltip) return;
        tooltip = document.createElement('div');
        tooltip.id = 'chord-tooltip';
        Object.assign(tooltip.style, {
            position:'fixed', zIndex:'9999', background:'#fffef8',
            border:'1px solid #a5d6a7', borderRadius:'10px',
            boxShadow:'0 6px 24px rgba(0,0,0,0.18)', padding:'4px',
            pointerEvents:'none', display:'none'
        });
        document.body.appendChild(tooltip);
    }

    function showTooltip(name, evt) {
        ensureTooltip();
        const svg = buildDiagramSVG(name);
        if (!svg) { tooltip.style.display='none'; return; }
        tooltip.innerHTML = svg;
        tooltip.style.display = 'block';
        positionTooltip(evt);
    }

    function positionTooltip(evt) {
        if (!tooltip || tooltip.style.display==='none') return;
        const tw=148, th=178;
        let x = evt.clientX + 16, y = evt.clientY - 24;
        if (x+tw > window.innerWidth-8)  x = evt.clientX - tw - 16;
        if (y+th > window.innerHeight-8) y = window.innerHeight - th - 8;
        if (y < 4) y = 4;
        tooltip.style.left = x+'px';
        tooltip.style.top  = y+'px';
    }

    function hideTooltip() { if (tooltip) tooltip.style.display='none'; }

    function bindAll(container) {
        if (!container) return;
        container.querySelectorAll('.lyric-chord-badge:not(.lyric-chord-empty)').forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('mouseenter', e => showTooltip(el.textContent.trim(), e));
            el.addEventListener('mousemove',  e => positionTooltip(e));
            el.addEventListener('mouseleave', hideTooltip);
        });
    }

    return { loadExternal, get, buildSVG, getPiano, buildPianoSVG, buildDiagramSVG,
              setInstrument, getInstrument, showTooltip, hideTooltip, bindAll };
})();
