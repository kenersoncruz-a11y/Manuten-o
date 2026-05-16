/**
 * ============================================================
 *  notifications.js — Sistema de Notificações em Tempo Real
 *  Incluir em TODOS os HTMLs do sistema:
 *    <script src="notifications.js"></script>
 *    (antes do </body>)
 * ============================================================
 *
 *  Requisitos:
 *    - O HTML já deve ter o Supabase client inicializado
 *      como `window.supabase` ou `supabase`
 *    - O usuário logado deve estar em `currentUser` com
 *      perfil === 'admin' para ver as notificações
 * ============================================================
 */

(function () {
    'use strict';

    /* ── Configuração ──────────────────────────────────────── */
    const SUPABASE_URL = 'https://wcfrwsgnxochxvwhxnvy.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjZnJ3c2dueG9jaHh2d2h4bnZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzExMDgsImV4cCI6MjA4MzIwNzEwOH0.Yb4cT5chXp3S8NZaWbLpv436HzxGCO7CZTruPpOPDdU';

    /* ── Estado interno ────────────────────────────────────── */
    let _sb           = null;   // cliente Supabase
    let _canal        = null;   // canal Realtime
    let _contador     = 0;
    let _painelAberto = false;
    let _intervalo    = null;                       // handle do setInterval de polling
    let _ultimaVerif  = new Date().toISOString();   // timestamp da última verificação
    let _idsMostrados = new Set();                  // IDs já exibidos no toast (evita duplicata)

    /* ── Obter cliente Supabase ────────────────────────────── */
    function getSB() {
        if (_sb) return _sb;
        // Prefere reusar o cliente da página (window.db)
        if (window.db && window.db.from) return (_sb = window.db);
        // Fallback: cria novo cliente a partir da lib CDN
        if (window.supabase && window.supabase.createClient) {
            return (_sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
        }
        console.warn('[Notif] Supabase client não encontrado.');
        return null;
    }

    /* ── Verificar se está logado ──────────────────────────── */
    function isLoggedIn() {
        return !!(window.currentUser);
    }

    /* ── Injetar estilos ───────────────────────────────────── */
    function injetarEstilos() {
        if (document.getElementById('notif-styles')) return;
        const style = document.createElement('style');
        style.id = 'notif-styles';
        style.textContent = `
            /* ── Sino ── */
            #notif-sino {
                position: fixed;
                top: 16px;
                right: 16px;
                z-index: 9999;
                width: 44px;
                height: 44px;
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: background 0.2s, transform 0.15s;
                user-select: none;
            }
            #notif-sino:hover { background: #334155; transform: scale(1.08); }
            #notif-sino svg   { width: 22px; height: 22px; color: #94a3b8; }

            #notif-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                background: #ef4444;
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                border: 2px solid #0f172a;
                animation: notif-pop 0.3s ease;
                display: none;
            }
            @keyframes notif-pop {
                0%   { transform: scale(0); }
                70%  { transform: scale(1.2); }
                100% { transform: scale(1); }
            }

            /* ── Painel ── */
            #notif-painel {
                position: fixed;
                top: 68px;
                right: 16px;
                z-index: 9998;
                width: 360px;
                max-width: calc(100vw - 32px);
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 12px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                overflow: hidden;
                display: none;
                flex-direction: column;
                max-height: 70vh;
                animation: notif-slide 0.2s ease;
            }
            @keyframes notif-slide {
                from { opacity: 0; transform: translateY(-8px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            #notif-painel.aberto { display: flex; }

            #notif-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                border-bottom: 1px solid #334155;
            }
            #notif-header span {
                font-size: 14px;
                font-weight: 600;
                color: #e2e8f0;
            }
            #notif-marcar-todas {
                font-size: 12px;
                color: #60a5fa;
                cursor: pointer;
                background: none;
                border: none;
                padding: 0;
            }
            #notif-marcar-todas:hover { color: #93c5fd; text-decoration: underline; }

            #notif-lista {
                overflow-y: auto;
                flex: 1;
            }
            #notif-lista::-webkit-scrollbar { width: 4px; }
            #notif-lista::-webkit-scrollbar-track { background: transparent; }
            #notif-lista::-webkit-scrollbar-thumb { background: #475569; border-radius: 2px; }

            .notif-item {
                display: flex;
                gap: 12px;
                padding: 12px 16px;
                border-bottom: 1px solid #1e293b;
                cursor: pointer;
                transition: background 0.15s;
                background: #0f172a;
                position: relative;
            }
            .notif-item:hover { background: #1e293b; }
            .notif-item.lida  { background: #1e293b; opacity: 0.6; }

            .notif-icone {
                font-size: 22px;
                flex-shrink: 0;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #0f172a;
                border-radius: 8px;
            }

            .notif-corpo { flex: 1; min-width: 0; }
            .notif-titulo {
                font-size: 13px;
                font-weight: 600;
                color: #e2e8f0;
                margin-bottom: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .notif-msg {
                font-size: 12px;
                color: #94a3b8;
                line-height: 1.4;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .notif-tempo {
                font-size: 11px;
                color: #475569;
                margin-top: 4px;
            }

            .notif-ponto {
                width: 8px;
                height: 8px;
                background: #3b82f6;
                border-radius: 50%;
                flex-shrink: 0;
                margin-top: 4px;
            }
            .notif-item.lida .notif-ponto { display: none; }

            #notif-vazio {
                padding: 32px 16px;
                text-align: center;
                color: #475569;
                font-size: 13px;
            }
            #notif-vazio span { display: block; font-size: 28px; margin-bottom: 8px; }

            /* ── Toast ── */
            #notif-toast-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 8px;
                pointer-events: none;
            }
            .notif-toast {
                background: #1e293b;
                border: 1px solid #334155;
                border-left: 3px solid #3b82f6;
                border-radius: 8px;
                padding: 12px 16px;
                min-width: 280px;
                max-width: 340px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                animation: toast-in 0.3s ease;
                pointer-events: auto;
            }
            .notif-toast.saindo { animation: toast-out 0.3s ease forwards; }
            @keyframes toast-in  { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }
            @keyframes toast-out { from { opacity:1; transform: translateX(0); } to { opacity:0; transform: translateX(20px); } }
            .notif-toast { cursor: pointer; position: relative; }
            .notif-toast-titulo { font-size: 13px; font-weight: 600; color: #e2e8f0; margin-bottom: 2px; padding-right: 20px; }
            .notif-toast-msg    { font-size: 12px; color: #94a3b8; line-height: 1.4; }
            .notif-toast-fechar {
                position: absolute; top: 8px; right: 10px;
                font-size: 16px; color: #64748b; cursor: pointer; line-height: 1;
            }
            .notif-toast-fechar:hover { color: #e2e8f0; }
        `;
        document.head.appendChild(style);
    }

    /* ── Injetar HTML do sino + painel ────────────────────── */
    function injetarHTML() {
        if (document.getElementById('notif-sino')) return;

        // Sino
        const sino = document.createElement('div');
        sino.id = 'notif-sino';
        sino.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            <span id="notif-badge">0</span>
        `;
        sino.addEventListener('click', togglePainel);
        document.body.appendChild(sino);

        // Painel
        const painel = document.createElement('div');
        painel.id = 'notif-painel';
        painel.innerHTML = `
            <div id="notif-header">
                <span>Notificações</span>
                <button id="notif-marcar-todas" onclick="window._notif.marcarTodas()">Marcar todas como lidas</button>
            </div>
            <div id="notif-lista">
                <div id="notif-vazio"><span>🔔</span>Nenhuma notificação</div>
            </div>
        `;
        document.body.appendChild(painel);

        // Container de toasts
        const toastContainer = document.createElement('div');
        toastContainer.id = 'notif-toast-container';
        document.body.appendChild(toastContainer);

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (_painelAberto &&
                !document.getElementById('notif-painel').contains(e.target) &&
                !document.getElementById('notif-sino').contains(e.target)) {
                fecharPainel();
            }
        });
    }

    /* ── Toggle painel ─────────────────────────────────────── */
    function togglePainel() {
        _painelAberto ? fecharPainel() : abrirPainel();
    }
    function abrirPainel() {
        document.getElementById('notif-painel').classList.add('aberto');
        _painelAberto = true;
        carregarNotificacoes();
    }
    function fecharPainel() {
        document.getElementById('notif-painel').classList.remove('aberto');
        _painelAberto = false;
    }

    /* ── Ícone por tipo ────────────────────────────────────── */
    function icone(tipo) {
        const mapa = {
            checklist_problema:    '⚠️',
            ocorrencia_criada:     '🆕',
            ocorrencia_atualizada: '🔄',
            ocorrencia_concluida:  '✅',
            comentario_adicionado: '💬',
        };
        return mapa[tipo] || '🔔';
    }

    /* ── Formatar tempo relativo ───────────────────────────── */
    function tempoRelativo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const min  = Math.floor(diff / 60000);
        if (min < 1)  return 'agora mesmo';
        if (min < 60) return `há ${min} min`;
        const h = Math.floor(min / 60);
        if (h < 24)   return `há ${h}h`;
        const d = Math.floor(h / 24);
        return `há ${d} dia${d > 1 ? 's' : ''}`;
    }

    /* ── Carregar notificações do Supabase ─────────────────── */
    async function carregarNotificacoes() {
        const sb = getSB();
        if (!sb) return;

        const { data, error } = await sb
            .from('notificacoes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) { console.error('[Notif]', error); return; }

        renderizarLista(data || []);
        atualizarContador((data || []).filter(n => !n.lida).length);
    }

    /* ── Renderizar lista ──────────────────────────────────── */
    function renderizarLista(notifs) {
        const lista = document.getElementById('notif-lista');
        if (!lista) return;

        if (!notifs.length) {
            lista.innerHTML = `<div id="notif-vazio"><span>🔔</span>Nenhuma notificação</div>`;
            return;
        }

        lista.innerHTML = notifs.map(n => `
            <div class="notif-item ${n.lida ? 'lida' : ''}"
                 onclick="window._notif.abrirNotif('${n.id}', '${n.link || ''}')">
                <div class="notif-icone">${icone(n.tipo)}</div>
                <div class="notif-corpo">
                    <div class="notif-titulo">${n.titulo}</div>
                    <div class="notif-msg">${n.mensagem}</div>
                    <div class="notif-tempo">${tempoRelativo(n.created_at)}</div>
                </div>
                ${!n.lida ? '<div class="notif-ponto"></div>' : ''}
            </div>
        `).join('');
    }

    /* ── Atualizar badge ───────────────────────────────────── */
    function atualizarContador(total) {
        _contador = total;
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        if (total > 0) {
            badge.style.display = 'flex';
            badge.textContent = total > 99 ? '99+' : total;
        } else {
            badge.style.display = 'none';
        }
    }

    /* ── Abrir notificação (marcar como lida + navegar) ─────── */
    async function abrirNotif(id, link) {
        const sb = getSB();
        if (sb) {
            await sb.from('notificacoes').update({ lida: true }).eq('id', id);
        }
        if (link) window.location.href = link;
        else carregarNotificacoes();
    }

    /* ── Marcar todas como lidas ───────────────────────────── */
    async function marcarTodas() {
        const sb = getSB();
        if (!sb) return;
        await sb.from('notificacoes').update({ lida: true }).eq('lida', false);
        carregarNotificacoes();
    }

    /* ── Mostrar toast ─────────────────────────────────────── */
    function mostrarToast(notif) {
        const container = document.getElementById('notif-toast-container');
        if (!container) return;

        // Som de notificação (beep suave via AudioContext)
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch(e) {}

        const toast = document.createElement('div');
        toast.className = 'notif-toast';
        toast.innerHTML = `
            <div class="notif-toast-titulo">${icone(notif.tipo)} ${notif.titulo}</div>
            <div class="notif-toast-msg">${notif.mensagem}</div>
            <div class="notif-toast-fechar" title="Fechar">×</div>
        `;
        toast.querySelector('.notif-toast-fechar').addEventListener('click', (e) => {
            e.stopPropagation();
            toast.classList.add('saindo');
            setTimeout(() => toast.remove(), 300);
        });
        toast.addEventListener('click', () => abrirNotif(notif.id, notif.link));
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('saindo');
            setTimeout(() => toast.remove(), 300);
        }, 7000);
    }

    /* ── Inscrever no Realtime ─────────────────────────────── */
    function inscreverRealtime() {
        const sb = getSB();
        if (!sb) return;

        // Cancela canal anterior se existir
        if (_canal) { try { sb.removeChannel(_canal); } catch(e) {} }

        _canal = sb
            .channel('notificacoes-realtime')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notificacoes' },
                (payload) => {
                    const nova = payload.new;
                    if (_idsMostrados.has(nova.id)) return; // já exibiu via polling
                    _idsMostrados.add(nova.id);
                    if (nova.created_at > _ultimaVerif) _ultimaVerif = nova.created_at;
                    atualizarContador(_contador + 1);
                    mostrarToast(nova);
                    if (_painelAberto) carregarNotificacoes();
                }
            )
            .subscribe((status) => {
                console.log('[Notif] Realtime status:', status);
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn('[Notif] Canal perdido, reconectando em 5s...');
                    setTimeout(inscreverRealtime, 5000);
                }
            });
    }

    /* ── Polling: busca notificações novas a cada 10s ─────── */
    async function verificarNovas() {
        const sb = getSB();
        if (!sb) return;
        try {
            const { data } = await sb
                .from('notificacoes')
                .select('*')
                .gt('created_at', _ultimaVerif)
                .order('created_at', { ascending: true });

            if (!data || !data.length) return;

            // Avança o cursor para a notificação mais recente
            _ultimaVerif = data[data.length - 1].created_at;

            data.forEach(n => {
                if (_idsMostrados.has(n.id)) return; // já exibiu via Realtime
                _idsMostrados.add(n.id);
                atualizarContador(_contador + 1);
                mostrarToast(n);
                if (_painelAberto) carregarNotificacoes();
            });
        } catch(e) {
            console.warn('[Notif] Erro no polling:', e);
        }
    }

    function iniciarPolling() {
        if (_intervalo) return; // já rodando
        verificarNovas(); // verificação imediata
        _intervalo = setInterval(verificarNovas, 10000); // a cada 10s
    }

    /* ── Inicialização ─────────────────────────────────────── */
    function init() {
        // Aguarda o DOM e o currentUser estarem prontos
        const tentar = () => {
            if (!isLoggedIn()) return;
            injetarEstilos();
            injetarHTML();
            carregarNotificacoes();
            inscreverRealtime(); // Realtime (quando habilitado no Supabase)
            iniciarPolling();    // Polling garantido a cada 10s
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(tentar, 500));
        } else {
            setTimeout(tentar, 500);
        }
    }

    /* ── API pública ───────────────────────────────────────── */
    window._notif = { abrirNotif, marcarTodas, recarregar: carregarNotificacoes };

    /* ── Reinicializar quando o usuário logar ──────────────── */
    window.notifInit = function () {
        if (!isLoggedIn()) return;
        if (!document.getElementById('notif-sino')) {
            injetarEstilos();
            injetarHTML();
        }
        carregarNotificacoes();
        if (!_canal) inscreverRealtime();
        iniciarPolling();
    };

    init();
})();
