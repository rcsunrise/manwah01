-- ==============================================================================
-- C4A-2: Asset SKU & Asset Versioning Schema for MANWAH AI Platform
-- ==============================================================================

-- 1. Asset SKUs Table
CREATE TABLE IF NOT EXISTS public.asset_skus (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL,
  canvas_id TEXT NOT NULL REFERENCES public.creative_canvases(id) ON DELETE CASCADE,
  scene_key TEXT NOT NULL,
  sku_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  current_version_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_project_canvas_scene UNIQUE (project_id, canvas_id, scene_key)
);

-- Enable RLS for asset_skus
ALTER TABLE public.asset_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own asset skus"
  ON public.asset_skus FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own asset skus"
  ON public.asset_skus FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own asset skus"
  ON public.asset_skus FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete own asset skus"
  ON public.asset_skus FOR DELETE
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_asset_skus_canvas ON public.asset_skus(canvas_id, scene_key);
CREATE INDEX IF NOT EXISTS idx_asset_skus_code ON public.asset_skus(sku_code);

-- 2. Asset Versions Table
CREATE TABLE IF NOT EXISTS public.asset_versions (
  id TEXT PRIMARY KEY,
  asset_sku_id TEXT NOT NULL REFERENCES public.asset_skus(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_code TEXT NOT NULL, -- e.g. 'V001', 'V002'
  parent_version_id TEXT REFERENCES public.asset_versions(id) ON DELETE SET NULL,
  source_node_id TEXT DEFAULT NULL,
  generation_provider TEXT DEFAULT 'google',
  generation_model TEXT DEFAULT 'gemini-2.5-flash',
  prompt_snapshot TEXT DEFAULT '',
  parameter_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_provider TEXT NOT NULL DEFAULT 'supabase',
  bucket TEXT NOT NULL DEFAULT 'creative-canvas-assets',
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  width INTEGER NOT NULL DEFAULT 1024,
  height INTEGER NOT NULL DEFAULT 1024,
  file_size INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_sku_version_number UNIQUE (asset_sku_id, version_number),
  CONSTRAINT unique_sku_version_code UNIQUE (asset_sku_id, version_code)
);

-- Enable RLS for asset_versions
ALTER TABLE public.asset_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own asset versions"
  ON public.asset_versions FOR SELECT
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can insert own asset versions"
  ON public.asset_versions FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can update own asset versions"
  ON public.asset_versions FOR UPDATE
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE INDEX IF NOT EXISTS idx_asset_versions_sku ON public.asset_versions(asset_sku_id, version_number ASC);
