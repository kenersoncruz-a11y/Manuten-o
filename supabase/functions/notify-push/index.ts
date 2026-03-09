/**
 * ============================================================
 *  Supabase Edge Function — notify-push
 *  Arquivo: supabase/functions/notify-push/index.ts
 * ============================================================
 *
 *  Deploy:
 *    supabase functions deploy notify-push
 *
 *  Esta função é chamada por um Database Webhook
 *  configurado na tabela `notificacoes` para evento INSERT.
 *
 *  Webhook URL: https://<seu-projeto>.supabase.co/functions/v1/notify-push
 * ============================================================
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ── Variáveis de ambiente ─────────────────────────────────── */
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!;
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT        = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@empresa.com';

/* ── Criar JWT VAPID para autenticação ─────────────────────── */
async function criarVapidJWT(audience: string): Promise<string> {
    const header  = { typ: 'JWT', alg: 'ES256' };
    const payload = {
        aud: new URL(audience).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: VAPID_SUBJECT,
    };

    const b64url = (obj: object | string) => {
        const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    const unsigned = `${b64url(header)}.${b64url(payload)}`;

    // Importar chave privada VAPID
    const keyData = Uint8Array.from(
        atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')),
        c => c.charCodeAt(0)
    );

    const privateKey = await crypto.subtle.importKey(
        'pkcs8', keyData.buffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, ['sign']
    );

    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(unsigned)
    );

    return `${unsigned}.${b64url(btoa(String.fromCharCode(...new Uint8Array(signature))))}`;
}

/* ── Enviar Web Push para uma assinatura ───────────────────── */
async function enviarPush(sub: {
    endpoint: string;
    p256dh: string;
    auth: string;
}, payload: object): Promise<boolean> {
    try {
        const jwt = await criarVapidJWT(sub.endpoint);

        const res = await fetch(sub.endpoint, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
                'TTL':           '86400',
            },
            body: JSON.stringify(payload),
        });

        if (res.status === 410 || res.status === 404) {
            // Assinatura expirada — sinalizar para remoção
            return false;
        }

        console.log(`[Push] Enviado para ${sub.endpoint.slice(0, 50)}... status: ${res.status}`);
        return res.ok;
    } catch (e) {
        console.error('[Push] Erro:', e);
        return false;
    }
}

/* ── Handler principal ─────────────────────────────────────── */
serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    let body: { record?: Record<string, unknown>; type?: string };
    try {
        body = await req.json();
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    // Supabase Database Webhook envia { type: "INSERT", record: {...} }
    const notif = body.record;
    if (!notif) {
        return new Response('No record', { status: 400 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Buscar todas as assinaturas de admins
    const { data: subs, error } = await sb
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, id')
        .limit(100);

    if (error || !subs?.length) {
        console.log('[Push] Nenhuma assinatura encontrada');
        return new Response(JSON.stringify({ ok: true, enviados: 0 }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const payload = {
        id:       notif.id,
        titulo:   notif.titulo,
        mensagem: notif.mensagem,
        link:     notif.link,
        tipo:     notif.tipo,
    };

    // Enviar para todos os dispositivos registrados
    const resultados = await Promise.all(
        subs.map(sub => enviarPush(sub, payload))
    );

    // Remover assinaturas expiradas
    const expiradas = subs.filter((_, i) => !resultados[i]);
    if (expiradas.length > 0) {
        await sb.from('push_subscriptions')
            .delete()
            .in('id', expiradas.map(s => (s as { id: string }).id));
        console.log(`[Push] ${expiradas.length} assinatura(s) expirada(s) removida(s)`);
    }

    const enviados = resultados.filter(Boolean).length;
    console.log(`[Push] ${enviados}/${subs.length} notificações enviadas`);

    return new Response(JSON.stringify({ ok: true, enviados, total: subs.length }), {
        headers: { 'Content-Type': 'application/json' }
    });
});
