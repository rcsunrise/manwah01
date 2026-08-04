-- ==============================================================================
-- Supabase Complete Database Schema & Storage Rules for MANWAH AI Platform
-- Architecture: Multi-tenant, Durable State, RLS Protected, Hybrid Persistence
-- ==============================================================================

-- 1. Projects Table (项目企划主表)
CREATE TABLE IF NOT EXISTS public.creative_projects (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'detail_page', -- 'detail_page' | 'nine_grid' | 'poster'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'archived' | 'deleted'
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for creative_projects
ALTER TABLE public.creative_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects"
  ON public.creative_projects FOR SELECT
  USING (auth.uid() = owner_id OR owner_id IS NULL);

CREATE POLICY "Users can insert their own projects"
  ON public.creative_projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR owner_id IS NULL);

CREATE POLICY "Users can update their own projects"
  ON public.creative_projects FOR UPDATE
  USING (auth.uid() = owner_id OR owner_id IS NULL);

CREATE POLICY "Users can delete their own projects"
  ON public.creative_projects FOR DELETE
  USING (auth.uid() = owner_id OR owner_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_creative_projects_owner ON public.creative_projects(owner_id, created_at DESC);


-- 2. Canvases Table (视觉企划画布及实时草稿表)
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

-- Enable RLS for creative_canvases
ALTER TABLE public.creative_canvases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own canvases"
  ON public.creative_canvases FOR SELECT
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can insert own canvases"
  ON public.creative_canvases FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can update own canvases"
  ON public.creative_canvases FOR UPDATE
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can delete own canvases"
  ON public.creative_canvases FOR DELETE
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE INDEX IF NOT EXISTS idx_canvases_project_id ON public.creative_canvases(project_id);
CREATE INDEX IF NOT EXISTS idx_canvases_created_by ON public.creative_canvases(created_by);


-- 3. Canvas Revisions Table (画布里程碑快照不可变记录表)
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

-- Enable RLS for canvas_revisions
ALTER TABLE public.canvas_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own canvas revisions"
  ON public.canvas_revisions FOR SELECT
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can insert own canvas revisions"
  ON public.canvas_revisions FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE INDEX IF NOT EXISTS idx_canvas_revisions_canvas_id ON public.canvas_revisions(canvas_id, revision_number DESC);


-- 4. Generation History Table (AI 渲染与生图历史记录表)
CREATE TABLE IF NOT EXISTS public.generation_history (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES public.creative_projects(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  aspect_ratio TEXT DEFAULT '1:1',
  category TEXT DEFAULT 'general', -- 'product' | 'scene' | 'nine_grid' | 'detail' | 'general'
  style_tags JSONB DEFAULT '[]'::jsonb,
  parameters JSONB DEFAULT '{}'::jsonb,
  size BIGINT DEFAULT 0,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for generation_history
ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generation history"
  ON public.generation_history FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own generation history"
  ON public.generation_history FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete own generation history"
  ON public.generation_history FOR DELETE
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_generation_history_user_ts ON public.generation_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_generation_history_project ON public.generation_history(project_id);


-- 5. Product Visual DNA Table (产品/品牌视觉 DNA 存储表)
CREATE TABLE IF NOT EXISTS public.project_dna (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES public.creative_projects(id) ON DELETE CASCADE,
  dna_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for project_dna
ALTER TABLE public.project_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project dna"
  ON public.project_dna FOR SELECT
  USING (true);

CREATE POLICY "Users can insert or update project dna"
  ON public.project_dna FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update project dna"
  ON public.project_dna FOR UPDATE
  USING (true);


-- 6. System & User Prompts Table (系统与用户提示词库)
CREATE TABLE IF NOT EXISTS public.system_prompts (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  tags JSONB DEFAULT '[]'::jsonb,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for system_prompts
ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to system prompts"
  ON public.system_prompts FOR SELECT
  USING (true);

CREATE POLICY "Users insert prompts"
  ON public.system_prompts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR user_id IS NULL);

CREATE POLICY "Users update prompts"
  ON public.system_prompts FOR UPDATE
  USING (auth.role() = 'authenticated' OR user_id IS NULL);

CREATE POLICY "Users delete prompts"
  ON public.system_prompts FOR DELETE
  USING (auth.role() = 'authenticated' OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_system_prompts_user ON public.system_prompts(user_id, timestamp DESC);

