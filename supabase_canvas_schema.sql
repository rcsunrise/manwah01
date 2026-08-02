-- Supabase Table Schemas for Canvas Draft Persistence & Immutable Revisions (Phase C4A-1)

-- 1. Canvases table
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.creative_canvases ENABLE ROW LEVEL SECURITY;

-- Policies for creative_canvases
CREATE POLICY "Users can view own canvases"
  ON public.creative_canvases FOR SELECT
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can insert own canvases"
  ON public.creative_canvases FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can update own canvases"
  ON public.creative_canvases FOR UPDATE
  USING (auth.uid() = created_by OR created_by IS NULL);

-- 2. Canvas Revisions table (Immutable version snapshots)
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

-- Enable RLS
ALTER TABLE public.canvas_revisions ENABLE ROW LEVEL SECURITY;

-- Policies for canvas_revisions
CREATE POLICY "Users can view own canvas revisions"
  ON public.canvas_revisions FOR SELECT
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can insert own canvas revisions"
  ON public.canvas_revisions FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Indexes for optimal querying
CREATE INDEX IF NOT EXISTS idx_canvases_project_id ON public.creative_canvases(project_id);
CREATE INDEX IF NOT EXISTS idx_canvas_revisions_canvas_id ON public.canvas_revisions(canvas_id);
