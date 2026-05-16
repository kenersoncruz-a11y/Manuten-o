/**
 * push.js — Registro do Service Worker + botão PWA
 * Incluir em todos os HTMLs antes do </body>
 */
(function () {
    'use strict';

    /* ── Registrar Service Worker ───────────────────────────── */
    async function registrarSW() {
        if (!('serviceWorker' in navigator)) return;
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch (e) {
            console.warn('[SW] Erro ao registrar:', e);
        }
    }

    /* ── Botão "Adicionar à tela inicial" (PWA) ─────────────── */
    let _deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredPrompt = e;
        mostrarBotaoInstalar();
    });

    function mostrarBotaoInstalar() {
        if (document.getElementById('pwa-install-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'pwa-install-btn';
        btn.innerHTML = '📲 Instalar app';
        btn.style.cssText = `
            position: fixed; bottom: 24px; left: 24px; z-index: 9999;
            background: #1e40af; color: #fff; border: none; border-radius: 8px;
            padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 6px;
        `;
        btn.addEventListener('click', async () => {
            if (!_deferredPrompt) return;
            _deferredPrompt.prompt();
            await _deferredPrompt.userChoice;
            _deferredPrompt = null;
            btn.remove();
        });
        document.body.appendChild(btn);
    }

    registrarSW();
})();
