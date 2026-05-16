-- ============================================================
--  Tabela de assinaturas Web Push
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT        NOT NULL,
    endpoint    TEXT          NOT NULL UNIQUE,
    p256dh      TEXT          NOT NULL,
    auth        TEXT          NOT NULL,
    user_agent  TEXT,
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índice para busca por usuário
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario
    ON public.push_subscriptions (usuario_id);

-- RLS: apenas service_role acessa diretamente
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Permite que o anon insira/atualize a própria assinatura
CREATE POLICY "push_insert" ON public.push_subscriptions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "push_update" ON public.push_subscriptions
    FOR UPDATE USING (true);

-- ============================================================
--  INSTRUÇÕES PARA O DATABASE WEBHOOK
--  Configurar em: Supabase Dashboard → Database → Webhooks
--
--  Nome:    notif-push
--  Tabela:  public.notificacoes
--  Evento:  INSERT
--  URL:     https://<ref>.supabase.co/functions/v1/send-push
--  Headers: { "Authorization": "Bearer <service_role_key>" }
-- ============================================================
