-- ==============================================================================
-- G0-1: Agent Chat & Continuous Dialogue Persistence Schema
-- ==============================================================================

-- 1. agent_conversations (会话元数据表)
CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  canvas_id TEXT NOT NULL,
  title TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  provider_conversation_id TEXT DEFAULT NULL,
  previous_response_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Enablement
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can select own agent_conversations') THEN
    CREATE POLICY "Authenticated users can select own agent_conversations"
      ON public.agent_conversations FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated users can manage own agent_conversations" ON public.agent_conversations;
CREATE POLICY "Authenticated users can manage own agent_conversations"
  ON public.agent_conversations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.creative_canvases canvas
      WHERE canvas.id = agent_conversations.canvas_id
        AND canvas.project_id = agent_conversations.project_id
        AND canvas.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_canvas ON public.agent_conversations(user_id, canvas_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_project ON public.agent_conversations(project_id);

-- 2. agent_messages (会话消息事实来源表)
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'streaming', 'completed', 'failed')),
  provider_response_id TEXT DEFAULT NULL,
  parent_message_id UUID DEFAULT NULL,
  context_snapshot JSONB DEFAULT NULL,
  error_code TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Enablement
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can select own agent_messages') THEN
    CREATE POLICY "Authenticated users can select own agent_messages"
      ON public.agent_messages FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated users can manage own agent_messages" ON public.agent_messages;
CREATE POLICY "Authenticated users can manage own agent_messages"
  ON public.agent_messages FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.agent_conversations conversation
      WHERE conversation.id = agent_messages.conversation_id
        AND conversation.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.agent_conversations conversation
      WHERE conversation.id = agent_messages.conversation_id
        AND conversation.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON public.agent_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_messages_user ON public.agent_messages(user_id);
