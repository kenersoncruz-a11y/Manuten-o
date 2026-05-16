import webpush from 'npm:web-push@3';

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@sistema.com';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    // Database Webhook envia { type, table, record, old_record }
    const notif = (body.record ?? body) as Record<string, unknown>;
    if (!notif?.id) {
        return new Response('No record', { status: 400 });
    }

    // Busca todas as assinaturas ativas
    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`, {
        headers: {
            'apikey':        SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
    });

    if (!res.ok) {
        return new Response('Erro ao buscar assinaturas', { status: 500 });
    }

    const subscriptions: { endpoint: string; p256dh: string; auth: string }[] = await res.json();

    if (!subscriptions.length) {
        return new Response(JSON.stringify({ enviados: 0, falhas: 0 }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const payload = JSON.stringify({
        titulo:   notif.titulo   ?? 'Nova notificação',
        mensagem: notif.mensagem ?? '',
        link:     notif.link     ?? '/',
        id:       notif.id,
    });

    const resultados = await Promise.allSettled(
        subscriptions.map(sub =>
            webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
                { TTL: 86400 } // expira em 24h se dispositivo offline
            )
        )
    );

    // Remove assinaturas inválidas (endpoint expirado/revogado)
    const expiradas: string[] = [];
    resultados.forEach((r, i) => {
        if (r.status === 'rejected') {
            const err = r.reason as { statusCode?: number };
            if (err?.statusCode === 410 || err?.statusCode === 404) {
                expiradas.push(subscriptions[i].endpoint);
            }
        }
    });

    if (expiradas.length) {
        await Promise.allSettled(
            expiradas.map(ep =>
                fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey':        SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                    },
                })
            )
        );
    }

    const enviados = resultados.filter(r => r.status === 'fulfilled').length;
    const falhas   = resultados.filter(r => r.status === 'rejected').length - expiradas.length;

    return new Response(JSON.stringify({ enviados, falhas, expiradas: expiradas.length }), {
        headers: { 'Content-Type': 'application/json' },
    });
});
