-- ==============================================================================
-- C4A-4: Async Asset Consolidation & Decoupled Revision Snapshots Migration
-- Migration File: 20260818_c4a4_async_assets_and_revisions.sql
-- ==============================================================================

-- 1. Ensure asset_skus table exists with full index support
CREATE TABLE IF NOT EXISTS public.asset_skus (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  project_id TEXT NOT NULL,
  canvas_id TEXT NOT NULL,
  scene_key TEXT NOT NULL,
  sku_code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_skus_project_canvas ON public.asset_skus(project_id, canvas_id);
CREATE INDEX IF NOT EXISTS idx_asset_skus_scene_key ON public.asset_skus(scene_key);

-- 2. Ensure asset_versions table exists and add C4A-4 async persistence columns
CREATE TABLE IF NOT EXISTS public.asset_versions (
  id TEXT PRIMARY KEY,
  asset_sku_id TEXT REFERENCES public.asset_skus(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  version_code TEXT NOT NULL DEFAULT 'V001',
  parent_version_id TEXT,
  source_node_id TEXT,
  generation_provider TEXT DEFAULT 'google',
  generation_model TEXT DEFAULT 'gemini-2.5-flash',
  prompt_snapshot TEXT DEFAULT '',
  parameter_snapshot JSONB DEFAULT '{}'::jsonb,
  storage_provider TEXT DEFAULT 'supabase',
  bucket TEXT DEFAULT 'creative-canvas-assets',
  object_key TEXT,
  mime_type TEXT DEFAULT 'image/png',
  width INTEGER DEFAULT 1024,
  height INTEGER DEFAULT 1024,
  file_size BIGINT DEFAULT 0,
  checksum TEXT,
  product_dna_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Forward-compatible ALTER TABLE statements for asset_versions
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS node_id TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS preview_object_key TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS thumbnail_object_key TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS upload_session_id TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS uploaded_bytes BIGINT DEFAULT 0;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS source_width INTEGER;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS source_height INTEGER;
ALTER TABLE public.asset_versions ADD COLUMN IF NOT EXISTS source_aspect_ratio TEXT;

CREATE INDEX IF NOT EXISTS idx_asset_versions_workspace_status ON public.asset_versions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_versions_node_id ON public.asset_versions(node_id);
CREATE INDEX IF NOT EXISTS idx_asset_versions_checksum ON public.asset_versions(checksum);
CREATE INDEX IF NOT EXISTS idx_asset_versions_object_key ON public.asset_versions(object_key);
CREATE INDEX IF NOT EXISTS idx_asset_versions_idempotency ON public.asset_versions(idempotency_key);

-- 3. Enhance canvas_revisions for two-phase decoupled revisions
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS manifest JSONB;
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS asset_total INTEGER DEFAULT 0;
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS asset_ready_count INTEGER DEFAULT 0;
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS failed_asset_count INTEGER DEFAULT 0;
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
ALTER TABLE public.canvas_revisions ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_canvas_revisions_status ON public.canvas_revisions(status);
CREATE INDEX IF NOT EXISTS idx_canvas_revisions_idempotency ON public.canvas_revisions(idempotency_key);

-- 4. Create canvas_revision_assets junction table
CREATE TABLE IF NOT EXISTS public.canvas_revision_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id TEXT NOT NULL REFERENCES public.canvas_revisions(id) ON DELETE CASCADE,
  asset_version_id TEXT NOT NULL,
  object_key TEXT,
  checksum TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_revision_asset UNIQUE (revision_id, asset_version_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_revision_assets_rev ON public.canvas_revision_assets(revision_id);
CREATE INDEX IF NOT EXISTS idx_canvas_revision_assets_ver ON public.canvas_revision_assets(asset_version_id);

-- 5. RLS Configuration
ALTER TABLE public.asset_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_revision_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to asset_skus" ON public.asset_skus;
CREATE POLICY "Public access to asset_skus" ON public.asset_skus FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to asset_versions" ON public.asset_versions;
CREATE POLICY "Public access to asset_versions" ON public.asset_versions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to canvas_revision_assets" ON public.canvas_revision_assets;
CREATE POLICY "Public access to canvas_revision_assets" ON public.canvas_revision_assets FOR ALL USING (true) WITH CHECK (true);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
