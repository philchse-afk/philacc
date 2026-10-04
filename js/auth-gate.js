// js/auth-gate.js
// -----------------------------------------------------------------------
// Gère la connexion / inscription / attente d'approbation, puis démarre
// App.init() une fois l'utilisateur authentifié et approuvé. Ajoute aussi
// une petite barre "compte" (déconnexion, import depuis le répertoire
// admin, panneau d'administration pour l'admin).
//
// Ce fichier doit être chargé AVANT js/app.js dans index.html.
// -----------------------------------------------------------------------

(function () {
    const readyCallbacks = [];
    let appStarted = false;

    const AccordsAuth = {
        currentUser: null,
        onReady(cb) {
            if (appStarted) { cb(); return; }
            readyCallbacks.push(cb);
        },
        async saveMySong(filename, songData, indexEntry) {
            // Route unique : le serveur écrit dans le répertoire maître si on
            // est admin, dans le répertoire personnel sinon — même appel des
            // deux côtés, plus besoin de distinguer ici.
            const res = await fetch(`/api/repertoire/song?file=${encodeURIComponent(filename)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songData, indexEntry }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur serveur.');
        },
        async deleteMySong(filename) {
            const res = await fetch(`/api/repertoire/song?file=${encodeURIComponent(filename)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur serveur.');
        },
    };
    window.AccordsAuth = AccordsAuth;

    function startApp(user) {
        AccordsAuth.currentUser = user;
        appStarted = true;
        removeOverlay();
        buildAccountBar(user);
        readyCallbacks.forEach(cb => cb());
    }

    // ---------------------------------------------------------------
    // Overlay plein écran (connexion / inscription / attente)
    // ---------------------------------------------------------------
    let overlayEl = null;

    function removeOverlay() {
        if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    }

    function showOverlay(html) {
        if (!overlayEl) {
            overlayEl = document.createElement('div');
            overlayEl.id = 'auth-overlay';
            document.body.appendChild(overlayEl);
        }
        overlayEl.innerHTML = html;
    }

    function showLoginForm(message) {
        showOverlay(`
            <div class="auth-card">
                <h1>🎸 Mes Accords</h1>
                <p class="auth-subtitle">Connexion</p>
                ${message ? `<div class="auth-message auth-message--error">${escapeHtml(message)}</div>` : ''}
                <form id="auth-login-form">
                    <label>Nom d'utilisateur
                        <input type="text" id="auth-login-username" autocomplete="username" required>
                    </label>
                    <label>Mot de passe
                        <input type="password" id="auth-login-password" autocomplete="current-password" required>
                    </label>
                    <button type="submit">Se connecter</button>
                </form>
                <p class="auth-switch">Pas encore de compte ? <a href="#" id="auth-go-register">Créer un compte</a></p>
            </div>
        `);
        document.getElementById('auth-login-form').addEventListener('submit', onLoginSubmit);
        document.getElementById('auth-go-register').addEventListener('click', e => { e.preventDefault(); showRegisterForm(); });
    }

    function showRegisterForm(message) {
        showOverlay(`
            <div class="auth-card">
                <h1>🎸 Mes Accords</h1>
                <p class="auth-subtitle">Créer un compte</p>
                ${message ? `<div class="auth-message auth-message--error">${escapeHtml(message)}</div>` : ''}
                <form id="auth-register-form">
                    <label>Nom d'utilisateur
                        <input type="text" id="auth-reg-username" autocomplete="username" required minlength="3">
                    </label>
                    <label>Mot de passe (8 caractères min.)
                        <input type="password" id="auth-reg-password" autocomplete="new-password" required minlength="8">
                    </label>
                    <button type="submit">Créer mon compte</button>
                </form>
                <p class="auth-hint">Après inscription, un administrateur doit approuver votre compte avant que vous puissiez vous connecter.</p>
                <p class="auth-switch">Déjà un compte ? <a href="#" id="auth-go-login">Se connecter</a></p>
            </div>
        `);
        document.getElementById('auth-register-form').addEventListener('submit', onRegisterSubmit);
        document.getElementById('auth-go-login').addEventListener('click', e => { e.preventDefault(); showLoginForm(); });
    }

    function showPendingScreen(status) {
        const text = status === 'rejected'
            ? "Votre demande de compte a été refusée par l'administrateur."
            : "Votre compte a été créé et attend l'approbation de l'administrateur. Revenez un peu plus tard.";
        showOverlay(`
            <div class="auth-card">
                <h1>🎸 Mes Accords</h1>
                <p class="auth-subtitle">${status === 'rejected' ? 'Compte refusé' : 'En attente d\u2019approbation'}</p>
                <p>${text}</p>
                <button id="auth-logout-pending">Se déconnecter</button>
            </div>
        `);
        document.getElementById('auth-logout-pending').addEventListener('click', doLogout);
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    async function onLoginSubmit(e) {
        e.preventDefault();
        const username = document.getElementById('auth-login-username').value;
        const password = document.getElementById('auth-login-password').value;
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) { showLoginForm(data.error || 'Erreur de connexion.'); return; }
            startApp(data.user);
        } catch (err) { showLoginForm('Erreur réseau, réessayez.'); }
    }

    async function onRegisterSubmit(e) {
        e.preventDefault();
        const username = document.getElementById('auth-reg-username').value;
        const password = document.getElementById('auth-reg-password').value;
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) { showRegisterForm(data.error || 'Erreur lors de la création du compte.'); return; }
            if (data.user.status === 'approved') {
                // Premier compte de l'installation → admin auto-approuvé : on peut se connecter tout de suite.
                showLoginForm('Compte administrateur créé, connectez-vous.');
            } else {
                showPendingScreen('pending');
            }
        } catch (err) { showRegisterForm('Erreur réseau, réessayez.'); }
    }

    async function doLogout() {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        window.location.reload();
    }

    // ---------------------------------------------------------------
    // Barre "compte" une fois connecté
    // ---------------------------------------------------------------
    function buildAccountBar(user) {
        const bar = document.getElementById('auth-account-bar');
        if (!bar) return; // sécurité si index.html n'a pas été mis à jour
        bar.innerHTML = `
            <span class="auth-bar-user">👤 ${escapeHtml(user.username)}${user.role === 'admin' ? ' (admin)' : ''}</span>
            ${user.role !== 'admin' ? '<button class="tab auth-bar-btn" id="auth-bar-import" title="Importer depuis le répertoire admin">📥 Importer</button>' : ''}
            ${user.role === 'admin' ? '<button class="tab auth-bar-btn" id="auth-bar-admin">⚙️ Administration</button>' : ''}
            <button class="tab auth-bar-btn" id="auth-bar-password" title="Changer mon mot de passe">🔑</button>
            <button class="tab auth-bar-btn" id="auth-bar-logout">Déconnexion</button>
        `;

        if (user.role !== 'admin') {
            document.getElementById('auth-bar-import').addEventListener('click', showImportPanel);
        } else {
            document.getElementById('auth-bar-admin').addEventListener('click', showAdminPanel);
        }
        document.getElementById('auth-bar-password').addEventListener('click', () => showChangePasswordForm(false));
        document.getElementById('auth-bar-logout').addEventListener('click', doLogout);

        if (user.mustChangePassword) {
            showChangePasswordForm(true);
        }
    }

    // ---------------------------------------------------------------
    // Changement de mot de passe (self-service)
    // ---------------------------------------------------------------
    function showChangePasswordForm(forced) {
        const modal = openModal('Changer mon mot de passe', !forced);
        modal.body.innerHTML = `
            ${forced ? '<p class="auth-message auth-message--error">Un mot de passe temporaire vous a été attribué : vous devez le changer avant de continuer.</p>' : ''}
            <form id="auth-change-pw-form">
                <label>Mot de passe actuel
                    <input type="password" id="auth-old-password" autocomplete="current-password" required>
                </label>
                <label>Nouveau mot de passe (8 caractères min.)
                    <input type="password" id="auth-new-password" autocomplete="new-password" required minlength="8">
                </label>
                <div id="auth-change-pw-error"></div>
                <button type="submit" class="tab">Valider</button>
            </form>
        `;
        document.getElementById('auth-change-pw-form').addEventListener('submit', async e => {
            e.preventDefault();
            const oldPassword = document.getElementById('auth-old-password').value;
            const newPassword = document.getElementById('auth-new-password').value;
            const errBox = document.getElementById('auth-change-pw-error');
            errBox.textContent = '';
            try {
                const res = await fetch('/api/auth/change-password', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPassword, newPassword }),
                });
                const data = await res.json();
                if (!res.ok) { errBox.textContent = data.error || 'Erreur.'; return; }
                AccordsAuth.currentUser = data.user;
                closeModal();
            } catch (err) { errBox.textContent = 'Erreur réseau, réessayez.'; }
        });
    }

    // ---------------------------------------------------------------
    // Panneau d'import (utilisateur normal) : parcourir le répertoire
    // admin et cloner des chansons vers son propre répertoire.
    // ---------------------------------------------------------------
    async function showImportPanel() {
        const modal = openModal('Importer depuis le répertoire admin');
        modal.body.innerHTML = '<p>Chargement…</p>';
        try {
            const res = await fetch('/api/repertoire/master/index');
            const master = await res.json();
            const mineRes = await fetch('/api/repertoire/mine/index');
            const mine = mineRes.ok ? await mineRes.json() : [];
            const mineFiles = new Set(mine.map(s => s.file));

            modal.body.innerHTML = `
                <div class="auth-import-toolbar">
                    <button id="auth-import-all">Tout importer</button>
                </div>
                <ul class="auth-import-list">
                    ${master.map(s => `
                        <li>
                            <span>${escapeHtml(s.title)} — ${escapeHtml(s.artist)}</span>
                            ${mineFiles.has(s.file)
                                ? '<span class="auth-import-done">✓ déjà dans votre liste</span>'
                                : `<button class="auth-import-one" data-file="${escapeHtml(s.file)}">Importer</button>`}
                        </li>
                    `).join('')}
                </ul>
            `;
            modal.body.querySelectorAll('.auth-import-one').forEach(btn => {
                btn.addEventListener('click', async () => {
                    btn.disabled = true; btn.textContent = '…';
                    const r = await fetch('/api/repertoire/mine/clone', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file: btn.dataset.file }),
                    });
                    if (r.ok) { btn.replaceWith(Object.assign(document.createElement('span'), { className: 'auth-import-done', textContent: '✓ importé' })); }
                    else { btn.disabled = false; btn.textContent = 'Réessayer'; }
                });
            });
            document.getElementById('auth-import-all').addEventListener('click', async () => {
                await fetch('/api/repertoire/mine/clone-all', { method: 'POST' });
                if (window.App && typeof window.App.loadSongsIndex === 'function') window.App.loadSongsIndex();
                closeModal();
            });
        } catch (err) {
            modal.body.innerHTML = '<p>Erreur de chargement du répertoire admin.</p>';
        }
    }

    // ---------------------------------------------------------------
    // Panneau admin : liste des comptes, approbation / refus.
    // ---------------------------------------------------------------
    async function showAdminPanel() {
        const modal = openModal('Administration des comptes');
        modal.body.innerHTML = '<p>Chargement…</p>';
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            renderAdminList(modal.body, data.users);
        } catch (err) {
            modal.body.innerHTML = '<p>Erreur de chargement.</p>';
        }
    }

    function renderAdminList(container, list) {
        const statusLabel = { pending: '⏳ en attente', approved: '✅ approuvé', rejected: '⛔ refusé' };
        container.innerHTML = `
            <ul class="auth-admin-list">
                ${list.map(u => `
                    <li data-id="${u.id}">
                        <span class="auth-admin-name">${escapeHtml(u.username)} ${u.role === 'admin' ? '(admin)' : ''}</span>
                        <span class="auth-admin-status">${statusLabel[u.status] || u.status}</span>
                        <span class="auth-admin-actions">
                            ${u.status !== 'approved' ? '<button data-action="approve">Approuver</button>' : ''}
                            ${u.status !== 'rejected' && u.role !== 'admin' ? '<button data-action="reject">Refuser</button>' : ''}
                            ${u.role !== 'admin' ? '<button data-action="reset-password">Réinitialiser mdp</button>' : ''}
                            ${u.role !== 'admin' ? '<button data-action="delete">Supprimer</button>' : ''}
                        </span>
                    </li>
                `).join('')}
            </ul>
        `;
        container.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const li = btn.closest('li');
                const id = li.dataset.id;
                const action = btn.dataset.action;
                if (action === 'delete' && !confirm('Supprimer définitivement ce compte ?')) return;
                if (action === 'reset-password' && !confirm(`Générer un nouveau mot de passe temporaire pour "${li.querySelector('.auth-admin-name').textContent.trim()}" ?`)) return;

                if (action === 'reset-password') {
                    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        alert(`Mot de passe temporaire : ${data.tempPassword}\n\nCommuniquez-le à la personne — il ne sera plus jamais affiché. Elle devra le changer à sa prochaine connexion.`);
                    } else {
                        alert(data.error || 'Erreur.');
                    }
                    return;
                }

                const url = action === 'delete' ? `/api/admin/users/${id}` : `/api/admin/users/${id}/${action}`;
                await fetch(url, { method: action === 'delete' ? 'DELETE' : 'POST' });
                showAdminPanel();
            });
        });
    }

    // ---------------------------------------------------------------
    // Petit système de modale générique
    // ---------------------------------------------------------------
    let modalEl = null;
    function openModal(title, closable = true) {
        closeModal();
        modalEl = document.createElement('div');
        modalEl.id = 'auth-modal-backdrop';
        modalEl.innerHTML = `
            <div class="auth-modal">
                <div class="auth-modal-header">
                    <h2>${escapeHtml(title)}</h2>
                    ${closable ? '<button id="auth-modal-close">✕</button>' : ''}
                </div>
                <div class="auth-modal-body"></div>
            </div>
        `;
        document.body.appendChild(modalEl);
        if (closable) {
            modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
            document.getElementById('auth-modal-close').addEventListener('click', closeModal);
        }
        return { body: modalEl.querySelector('.auth-modal-body') };
    }
    function closeModal() {
        if (modalEl) { modalEl.remove(); modalEl = null; }
    }

    // ---------------------------------------------------------------
    // Démarrage : vérifie la session actuelle
    // ---------------------------------------------------------------
    async function init() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            if (!data.user) { showLoginForm(); return; }
            if (data.user.status === 'approved') { startApp(data.user); return; }
            showPendingScreen(data.user.status);
        } catch (err) {
            showLoginForm('Impossible de contacter le serveur.');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
