/**
 * ============================================================
 *  push.js — Web Push + PWA
 *  Incluir em TODOS os HTMLs antes do </body>:
 *    <script src="push.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    /* ── Chave pública VAPID (gerada uma única vez) ─────────── */
    const VAPID_PUBLIC_KEY = 'BP4Rfy-cX97O24aJlk4KoyMpelg2Z3S37Ptmm0Nw6lPK55lOiQ6NwGFPDnf9sjZYHl9sumx86hBLSbkI0Hmb5xs';

    const SUPABASE_URL = 'https://wcfrwsgnxochxvwhxnvy.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjZnJ3c2dueG9jaHh2d2h4bnZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzExMDgsImV4cCI6MjA4MzIwNzEwOH0.Yb4cT5chXp3S8NZaWbLpv436HzxGCO7CZTruPpOPDdU';

    /* ── Converter VAPID key para Uint8Array ────────────────── */
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw     = atob(base64);
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    /* ── Verificar suporte ──────────────────────────────────── */
    function suportado() {
        return 'serviceWorker' in navigator && 'PushManager' in window;
    }

    /* ── Verificar se é admin/supervisor ───────────────────── */
    function isAdmin() {
        const u = window.currentUser;
        return u && (u.perfil === 'admin' || u.perm_usuarios_visualizar);
    }

    /* ── Registrar Service Worker ───────────────────────────── */
    async function registrarSW() {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('[Push] Service Worker registrado');
            return reg;
        } catch (e) {
            console.error('[Push] Erro ao registrar SW:', e);
            return null;
        }
    }

    /* ── Solicitar permissão e criar assinatura ─────────────── */
    async function assinarPush(reg) {
        try {
            const permissao = await Notification.requestPermission();
            if (permissao !== 'granted') {
                console.log('[Push] Permissão negada');
                return null;
            }

            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly:      true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            console.log('[Push] Assinatura criada');
            return subscription;
        } catch (e) {
            console.error('[Push] Erro ao assinar:', e);
            return null;
        }
    }

    /* ── Salvar assinatura no Supabase ──────────────────────── */
    async function salvarAssinatura(subscription) {
        const u = window.currentUser;
        if (!u?.id) return;

        const payload = {
            usuario_id:   u.id,
            endpoint:     subscription.endpoint,
            p256dh:       btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
            auth:         btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
            user_agent:   navigator.userAgent,
            updated_at:   new Date().toISOString(),
        };

        // Upsert — atualiza se já existe o mesmo endpoint
        const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'apikey':        SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer':        'resolution=merge-duplicates',
            },
            body: JSON.stringify(payload),
        });

        if (res.ok) console.log('[Push] Assinatura salva no Supabase');
        else console.error('[Push] Erro ao salvar assinatura:', await res.text());
    }

    /* ── Instalar PWA (botão "Adicionar à tela inicial") ────── */
    let _deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredPrompt = e;
        mostrarBotaoInstalar();
    });

    function mostrarBotaoInstalar() {
        if (document.getElementById('pwa-install-btn')) return;

        const btn = document.createElement('button');
        btn.id        = 'pwa-install-btn';
        btn.innerHTML = '📲 Instalar app';
        btn.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 24px;
            z-index: 9999;
            background: #1e40af;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 6px;
        `;
        btn.addEventListener('click', async () => {
            if (!_deferredPrompt) return;
            _deferredPrompt.prompt();
            const { outcome } = await _deferredPrompt.userChoice;
            console.log('[PWA] Resultado instalação:', outcome);
            _deferredPrompt = null;
            btn.remove();
        });

        document.body.appendChild(btn);
    }

    /* ── Inicialização principal ────────────────────────────── */
    async function init() {
        if (!suportado()) {
            console.log('[Push] Navegador não suporta Web Push');
            return;
        }

        const reg = await registrarSW();
        if (!reg) return;

        // Aguarda o currentUser estar disponível (login)
        // A função pushInit() pode ser chamada manualmente após login
        window.pushInit = async function () {
            if (!isAdmin()) return;

            // Verifica se já tem assinatura ativa
            const subAtual = await reg.pushManager.getSubscription();

            if (subAtual) {
                // Já assinado — apenas garante que está salvo no banco
                await salvarAssinatura(subAtual);
            } else {
                // Primeira vez — pede permissão
                const sub = await assinarPush(reg);
                if (sub) await salvarAssinatura(sub);
            }
        };

        // Tentar automaticamente se já logado
        setTimeout(() => {
            if (isAdmin()) window.pushInit();
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
