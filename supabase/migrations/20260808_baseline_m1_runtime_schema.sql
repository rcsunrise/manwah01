-- ==============================================================================
-- BASELINE-M1-R1: Supabase Runtime Schema & Persistence Verification
-- Migration File: 20260808_baseline_m1_runtime_schema.sql
-- ==============================================================================

-- 1. Projects Table (项目企划主表)
CREATE TABLE IF NOT EXISTS public.creative_projects (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'detail_page',
  status TEXT NOT NULL DEFAULT 'active',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.creative_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own projects" ON public.creative_projects;
CREATE POLICY "Users can view their own projects"
  ON public.creative_projects FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own projects" ON public.creative_projects;
CREATE POLICY "Users can insert their own projects"
  ON public.creative_projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own projects" ON public.creative_projects;
CREATE POLICY "Users can update their own projects"
  ON public.creative_projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own projects" ON public.creative_projects;
CREATE POLICY "Users can delete their own projects"
  ON public.creative_projects FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_creative_projects_owner ON public.creative_projects(owner_id, created_at DESC);


-- 2. Canvases Table (视觉企划画布表)
CREATE TABLE IF NOT EXISTS public.creative_canvases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.creative_projects(id) ON DELETE CASCADE,
  canvas_name TEXT NOT NULL DEFAULT '主视觉九屏画布',
  canvas_status TEXT NOT NULL DEFAULT 'active',
  nodes_draft JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges_draft JSONB NOT NULL DEFAULT '[]'::jsonb,
  viewport_draft JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  source_revision_id TEXT DEFAULT NULL,
  current_revision INTEGER NOT NULL DEFAULT 0,
  snapshot_checksum TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.creative_canvases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own canvases" ON public.creative_canvases;
CREATE POLICY "Users can view own canvases"
  ON public.creative_canvases FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can insert own canvases" ON public.creative_canvases;
CREATE POLICY "Users can insert own canvases"
  ON public.creative_canvases FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update own canvases" ON public.creative_canvases;
CREATE POLICY "Users can update own canvases"
  ON public.creative_canvases FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete own canvases" ON public.creative_canvases;
CREATE POLICY "Users can delete own canvases"
  ON public.creative_canvases FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_canvases_project_id ON public.creative_canvases(project_id);
CREATE INDEX IF NOT EXISTS idx_canvases_created_by ON public.creative_canvases(created_by);


-- 3. Canvas Revisions Table (画布快照表)
CREATE TABLE IF NOT EXISTS public.canvas_revisions (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES public.creative_canvases(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  version_name TEXT NOT NULL,
  change_summary TEXT DEFAULT '',
  version_tag TEXT DEFAULT '正式版',
  nodes_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  viewport_snapshot JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT unique_canvas_revision UNIQUE (canvas_id, revision_number)
);

ALTER TABLE public.canvas_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own canvas revisions" ON public.canvas_revisions;
CREATE POLICY "Users can view own canvas revisions"
  ON public.canvas_revisions FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can insert own canvas revisions" ON public.canvas_revisions;
CREATE POLICY "Users can insert own canvas revisions"
  ON public.canvas_revisions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_canvas_revisions_canvas ON public.canvas_revisions(canvas_id, revision_number DESC);


-- 4. agent_conversations (Agent 会话表)
CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES public.creative_projects(id) ON DELETE CASCADE,
  canvas_id TEXT NOT NULL REFERENCES public.creative_canvases(id) ON DELETE CASCADE,
  title TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  provider_conversation_id TEXT DEFAULT NULL,
  previous_response_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select own agent_conversations" ON public.agent_conversations;
CREATE POLICY "Authenticated users can select own agent_conversations"
  ON public.agent_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

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


-- 5. agent_messages (Agent 消息表)
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

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select own agent_messages" ON public.agent_messages;
CREATE POLICY "Authenticated users can select own agent_messages"
  ON public.agent_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
