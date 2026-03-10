/**
 * ============================================================
 *  sw.js — Service Worker
 *  Salvar na RAIZ do projeto (mesma pasta dos HTMLs)
 * ============================================================
 */

const CACHE_NAME = 'manutencao-v1';

/* ── Arquivos para cache offline (PWA) ─────────────────────── */
const CACHE_URLS = [
    '/',
    '/checklist.html',
    '/ocorrencias.html',
    '/usuarios.html',
    '/notifications.js',
    '/push.js',
    '/menu.html',
    '/manifest.json',
];

/* ── Instalar: cachear arquivos estáticos ──────────────────── */
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(CACHE_URLS).catch(() => {
                // Ignora erros de arquivos não encontrados no cache
            });
        })
    );
});

/* ── Ativar: limpar caches antigos ────────────────────────── */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

/* ── Fetch: servir do cache quando offline ─────────────────── */
self.addEventListener('fetch', (event) => {
    // Só intercepta requisições GET
    if (event.request.method !== 'GET') return;
    // Não intercepta chamadas ao Supabase
    if (event.request.url.includes('supabase.co')) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Atualiza o cache com a resposta mais recente
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

/* ── Push: receber notificação do servidor ─────────────────── */
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { titulo: 'Nova notificação', mensagem: event.data?.text() || '' };
    }

    const titulo  = data.titulo  || '🔔 Sistema de Manutenção';
    const opcoes  = {
        body:    data.mensagem || '',
        icon:    '/icon-192.png',
        badge:   '/icon-96.png',
        tag:     data.id || 'notif-' + Date.now(),
        data:    { url: data.link || '/', id: data.id },
        actions: [
            { action: 'abrir',   title: '📂 Abrir' },
            { action: 'fechar',  title: '✕ Fechar' },
        ],
        requireInteraction: false,
        vibrate: [200, 100, 200],
    };

    event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

/* ── Clique na notificação ─────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'fechar') return;

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Se já tem uma aba aberta, foca nela
            for (const client of windowClients) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Senão, abre nova aba
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
