// js/sync.js — Mise en miroir de l'écran du PC maître sur les autres appareils
// -----------------------------------------------------------------------------
// Rôle injecté par servAcc.js dans window.SYNC_ROLE :
//   'master' : l'appareil qui tourne sur le PC serveur. L'appli fonctionne
//              normalement ; ce script envoie un instantané de la page (DOM,
//              styles, défilement, champs de formulaire) à chaque changement.
//   'viewer' : tous les autres appareils. Ils ne chargent PAS app.js (pas de
//              connexion requise) : ils reçoivent l'instantané et mettent leur
//              page à jour avec un diff DOM (pas de clignotement, les animations
//              CSS et les vidéos ne redémarrent pas à chaque mise à jour).
// Si window.SYNC_ROLE est absent (ex. Live Server), ce script ne fait rien.
// -----------------------------------------------------------------------------
(function () {
    'use strict';

    const ROLE = window.SYNC_ROLE;
    if (ROLE !== 'master' && ROLE !== 'viewer') return;

    const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/sync';
    const MIN_INTERVAL_MS = 80;     // cadence max d'envoi (maître)
    const RESEND_CHECK_MS = 1000;   // filet de sécurité : détecte les changements non observables (canvas…)

    // ---------------------------------------------------------------
    // Pastille d'état (Shadow DOM : n'interfère ni avec la page ni avec le CSS)
    // ---------------------------------------------------------------
    const badge = (function () {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
        const root = host.attachShadow({ mode: 'closed' });
        root.innerHTML =
            '<style>' +
            '.b{position:fixed;right:8px;bottom:8px;font:12px/1.3 system-ui,sans-serif;background:rgba(0,0,0,.7);' +
            'color:#fff;padding:4px 10px;border-radius:12px;white-space:nowrap}' +
            '.b.center{right:auto;bottom:auto;left:50%;top:50%;transform:translate(-50%,-50%);font-size:20px;padding:14px 24px;border-radius:14px}' +
            '.b.hide{display:none}' +
            '</style><div class="b hide"></div>';
        const el = root.querySelector('.b');
        document.documentElement.appendChild(host);
        let hideTimer = null;
        return {
            set(text, mode, autoHideMs) {
                clearTimeout(hideTimer);
                el.textContent = text;
                el.className = 'b ' + (mode || 'corner');
                if (autoHideMs) hideTimer = setTimeout(() => { el.className = 'b hide'; }, autoHideMs);
            },
        };
    })();

    // ===============================================================
    //  MAÎTRE
    // ===============================================================
    function startMaster() {
        // <style>/<link> déjà présents au chargement : seuls ceux ajoutés ensuite par l'appli sont envoyés
        const initialHeadNodes = new Set(document.head.querySelectorAll('style, link[rel="stylesheet"]'));
        const touched = new Set();              // éléments défilés par l'utilisateur
        const inertDoc = document.implementation.createHTMLDocument(''); // clone sans chargement de ressources
        let ws = null, lastSent = '', timer = null, lastRun = 0, retry = 1000, viewers = 0;

        const attrMap = el => {
            const m = {};
            for (const a of el.attributes) m[a.name] = a.value;
            return m;
        };
        const ratio = (pos, max) => (max > 0 ? pos / max : 0);

        function buildSnapshot() {
            const body = document.body;
            const live = body.querySelectorAll('*');
            const clone = inertDoc.importNode(body, true);
            const copy = clone.querySelectorAll('*');

            const toRemove = [], toReplace = [], els = [];
            let idx = 0; // index hors <script> (identique côté viewer, où il n'y a aucun script)

            for (let i = 0; i < live.length; i++) {
                const a = live[i], b = copy[i];
                const tag = a.tagName;
                if (tag === 'SCRIPT') { toRemove.push(b); continue; }

                if (touched.has(a)) {
                    els.push([idx,
                        ratio(a.scrollLeft, a.scrollWidth - a.clientWidth),
                        ratio(a.scrollTop, a.scrollHeight - a.clientHeight)]);
                }
                idx++;

                if (tag === 'INPUT') {
                    const type = (a.type || '').toLowerCase();
                    if (type === 'password' || type === 'file') b.removeAttribute('value'); // jamais diffusés
                    else if (type === 'checkbox' || type === 'radio') {
                        if (a.checked) b.setAttribute('checked', ''); else b.removeAttribute('checked');
                    } else b.setAttribute('value', a.value);
                } else if (tag === 'TEXTAREA') {
                    b.textContent = a.value;
                } else if (tag === 'OPTION') {
                    if (a.selected) b.setAttribute('selected', ''); else b.removeAttribute('selected');
                } else if (tag === 'CANVAS') {
                    try {
                        const img = inertDoc.createElement('img');
                        for (const at of a.attributes) img.setAttribute(at.name, at.value);
                        img.setAttribute('src', a.toDataURL());
                        img.setAttribute('data-was-canvas', '');
                        toReplace.push([b, img]);
                    } catch (_) { /* canvas "tainted" : ignoré */ }
                }
            }
            toReplace.forEach(([b, img]) => b.replaceWith(img));
            toRemove.forEach(b => b.remove());
            touched.forEach(el => { if (!body.contains(el)) touched.delete(el); });

            const styles = [], links = [];
            document.head.querySelectorAll('style').forEach(s => { if (!initialHeadNodes.has(s)) styles.push(s.textContent); });
            document.head.querySelectorAll('link[rel="stylesheet"]').forEach(l => { if (!initialHeadNodes.has(l)) links.push(l.href); });

            const se = document.scrollingElement || document.documentElement;
            return {
                t: 'snap',
                title: document.title,
                html: attrMap(document.documentElement),
                bodyAttrs: attrMap(body),
                body: clone.innerHTML,
                styles, links,
                win: [ratio(se.scrollLeft, se.scrollWidth - se.clientWidth),
                      ratio(se.scrollTop, se.scrollHeight - se.clientHeight)],
                els,
            };
        }

        function send() {
            if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 2 * 1024 * 1024) return;
            let msg;
            try { msg = JSON.stringify(buildSnapshot()); }
            catch (err) { console.warn('[sync] instantané impossible :', err); return; }
            if (msg === lastSent) return;
            lastSent = msg;
            ws.send(msg);
        }

        function schedule() {
            if (timer) return;
            timer = setTimeout(() => { timer = null; lastRun = Date.now(); send(); },
                Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRun)));
        }

        function updateBadge() {
            if (ws && ws.readyState === 1) badge.set('● Maître — ' + viewers + ' appareil' + (viewers > 1 ? 's' : ''), 'corner');
            else badge.set('⚠ Synchro hors ligne', 'corner');
        }

        function connect() {
            ws = new WebSocket(WS_URL);
            ws.onopen = () => { retry = 1000; lastSent = ''; updateBadge(); send(); };
            ws.onmessage = e => {
                try {
                    const m = JSON.parse(e.data);
                    if (m.t === 'status') { viewers = m.viewers; updateBadge(); }
                } catch (_) {}
            };
            ws.onclose = () => { updateBadge(); setTimeout(connect, retry); retry = Math.min(retry * 2, 5000); };
            ws.onerror = () => { try { ws.close(); } catch (_) {} };
        }

        new MutationObserver(schedule).observe(document.documentElement,
            { subtree: true, childList: true, attributes: true, characterData: true });
        ['input', 'change', 'click', 'keyup', 'transitionend', 'animationend', 'load'].forEach(ev =>
            document.addEventListener(ev, schedule, true));
        window.addEventListener('scroll', e => {
            const t = e.target;
            if (t && t.nodeType === 1) touched.add(t);
            schedule();
        }, true);
        window.addEventListener('resize', schedule);
        setInterval(send, RESEND_CHECK_MS);

        connect();
    }

    // ===============================================================
    //  VIEWER (écran d'affichage)
    // ===============================================================
    function startViewer() {
        const css = document.createElement('style');
        css.textContent =
            'html:not([data-sync-ready]) body{visibility:hidden}' +
            'body *{pointer-events:none!important;-webkit-user-select:none;user-select:none}';
        document.head.appendChild(css);
        badge.set('En attente du PC maître…', 'center');

        const dynStyle = document.createElement('style');
        document.head.appendChild(dynStyle);
        const addedLinks = new Set();
        let ws = null, retry = 1000, pending = null, raf = 0, gotFirst = false, mastersOnline = true;

        // ---- Diff DOM --------------------------------------------------
        function syncAttrs(el, src) {
            for (const a of Array.from(el.attributes)) {
                if (!src.hasAttribute(a.name)) el.removeAttribute(a.name);
            }
            for (const a of Array.from(src.attributes)) {
                if (/^on/i.test(a.name)) continue; // pas de gestionnaires d'événements côté viewer
                if (el.getAttribute(a.name) !== a.value) {
                    if (a.namespaceURI) el.setAttributeNS(a.namespaceURI, a.name, a.value);
                    else el.setAttribute(a.name, a.value);
                }
            }
        }
        function syncMapAttrs(el, map, keep) {
            for (const a of Array.from(el.attributes)) {
                if (!(a.name in map) && !(keep && keep.includes(a.name))) el.removeAttribute(a.name);
            }
            for (const name in map) {
                if (/^on/i.test(name)) continue;
                if (el.getAttribute(name) !== map[name]) el.setAttribute(name, map[name]);
            }
        }
        function sameKind(a, b) {
            if (a.nodeType !== b.nodeType) return false;
            if (a.nodeType !== 1) return true;
            return a.tagName === b.tagName && (a.id || '') === (b.id || '');
        }
        function patch(cur, src) {
            if (cur.nodeType !== 1) {
                if (cur.nodeValue !== src.nodeValue) cur.nodeValue = src.nodeValue;
                return;
            }
            syncAttrs(cur, src);
            const tag = cur.tagName;
            if (tag === 'INPUT') {
                const type = (cur.getAttribute('type') || '').toLowerCase();
                if (type === 'checkbox' || type === 'radio') cur.checked = src.hasAttribute('checked');
                else if (type !== 'file' && type !== 'password') {
                    const v = src.getAttribute('value') || '';
                    if (cur.value !== v) cur.value = v;
                }
                return;
            }
            if (tag === 'TEXTAREA') {
                if (cur.value !== src.textContent) cur.value = src.textContent;
                return;
            }
            if (tag === 'OPTION') cur.selected = src.hasAttribute('selected');
            morphChildren(cur, src);
        }
        function morphChildren(live, next) {
            const nk = next.childNodes;
            for (let i = 0; i < nk.length; i++) {
                const n = nk[i];
                const cur = live.childNodes[i];
                if (!cur) { live.appendChild(document.importNode(n, true)); continue; }
                if (sameKind(cur, n)) { patch(cur, n); continue; }
                if (n.nodeType === 1 && n.id) { // élément à id déplacé : on le retrouve plutôt que de le recréer
                    let found = null;
                    for (let j = i + 1; j < live.childNodes.length; j++) {
                        const c = live.childNodes[j];
                        if (c.nodeType === 1 && c.id === n.id && c.tagName === n.tagName) { found = c; break; }
                    }
                    if (found) { live.insertBefore(found, cur); patch(found, n); continue; }
                }
                live.insertBefore(document.importNode(n, true), cur);
            }
            while (live.childNodes.length > nk.length) live.removeChild(live.lastChild);
        }

        // ---- Application d'un instantané ----------------------------------
        function apply(m) {
            document.title = m.title || document.title;
            syncMapAttrs(document.documentElement, m.html || {}, ['data-sync-ready']);
            syncMapAttrs(document.body, m.bodyAttrs || {});

            const joined = (m.styles || []).join('\n');
            if (dynStyle.textContent !== joined) dynStyle.textContent = joined;
            (m.links || []).forEach(href => {
                if (addedLinks.has(href)) return;
                addedLinks.add(href);
                const l = document.createElement('link');
                l.rel = 'stylesheet'; l.href = href;
                document.head.appendChild(l);
            });

            const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + m.body + '</body></html>', 'text/html');
            morphChildren(document.body, doc.body);

            document.querySelectorAll('video,audio').forEach(v => {
                v.muted = true; // le son vient uniquement du PC maître
                if (v.hasAttribute('autoplay') && v.paused) v.play().catch(() => {});
            });

            // défilement (en proportion : les écrans n'ont pas la même taille)
            if (m.els && m.els.length) {
                const list = document.body.querySelectorAll('*');
                m.els.forEach(([i, rx, ry]) => {
                    const el = list[i];
                    if (!el) return;
                    const mx = el.scrollWidth - el.clientWidth, my = el.scrollHeight - el.clientHeight;
                    if (mx > 0) el.scrollLeft = rx * mx;
                    if (my > 0) el.scrollTop = ry * my;
                });
            }
            const se = document.scrollingElement || document.documentElement;
            const mx = se.scrollWidth - se.clientWidth, my = se.scrollHeight - se.clientHeight;
            if (m.win) {
                if (mx > 0) se.scrollLeft = m.win[0] * mx;
                if (my > 0) se.scrollTop = m.win[1] * my;
            }

            document.documentElement.setAttribute('data-sync-ready', '1');
            if (!gotFirst) { gotFirst = true; badge.set('● Synchronisé', 'corner', 2500); }
        }

        function enqueue(m) {
            pending = m;
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const p = pending; pending = null;
                try { apply(p); } catch (err) { console.error('[sync] application impossible :', err); }
            });
        }

        function connect() {
            ws = new WebSocket(WS_URL);
            ws.onopen = () => { retry = 1000; if (!gotFirst) badge.set('En attente du PC maître…', 'center'); };
            ws.onmessage = e => {
                let m;
                try { m = JSON.parse(e.data); } catch (_) { return; }
                if (m.t === 'snap') enqueue(m);
                else if (m.t === 'status') {
                    mastersOnline = m.masters > 0;
                    if (!mastersOnline && gotFirst) badge.set('⚠ PC maître hors ligne', 'corner');
                    else if (mastersOnline && gotFirst) badge.set('● Synchronisé', 'corner', 2500);
                }
            };
            ws.onclose = () => {
                badge.set(gotFirst ? '⚠ Connexion perdue — reconnexion…' : 'Connexion au serveur…', gotFirst ? 'corner' : 'center');
                setTimeout(connect, retry); retry = Math.min(retry * 2, 5000);
            };
            ws.onerror = () => { try { ws.close(); } catch (_) {} };
        }
        connect();
    }

    if (ROLE === 'master') startMaster(); else startViewer();
})();
