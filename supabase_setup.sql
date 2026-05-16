-- ============================================================
-- EXECUTAR NO SUPABASE → SQL Editor
-- ============================================================

-- 1. CRIAR TABELA notificacoes (se não existir)
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT        NOT NULL DEFAULT 'geral',
  titulo      TEXT        NOT NULL,
  mensagem    TEXT,
  link        TEXT,
  lida        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. HABILITAR REALTIME (obrigatório para o pop-up funcionar)
-- Se já existir, ignore o erro.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;

-- 3. HABILITAR ROW LEVEL SECURITY
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE ACESSO (anon pode ler, inserir e atualizar)
-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "notif_select" ON public.notificacoes;
DROP POLICY IF EXISTS "notif_insert" ON public.notificacoes;
DROP POLICY IF EXISTS "notif_update" ON public.notificacoes;

CREATE POLICY "notif_select" ON public.notificacoes
  FOR SELECT USING (true);

CREATE POLICY "notif_insert" ON public.notificacoes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "notif_update" ON public.notificacoes
  FOR UPDATE USING (true);

-- 5. ÍNDICE para performance nas consultas
CREATE INDEX IF NOT EXISTS notificacoes_created_at_idx
  ON public.notificacoes (created_at DESC);

CREATE INDEX IF NOT EXISTS notificacoes_lida_idx
  ON public.notificacoes (lida);

-- ============================================================
-- VERIFICAR se o Realtime está ativo:
-- SELECT schemaname, tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime';
-- ============================================================
