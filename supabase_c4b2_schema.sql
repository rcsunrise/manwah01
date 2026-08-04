-- ==============================================================================
-- C4B-2: Structured Marketing Copy & Copy Versioning Schema for MANWAH AI Platform
-- Architecture: Idempotent, RLS Protected, Immutability Trigger, Atomic RPC
-- ==============================================================================

-- 1. Copy SKUs Table (文案 SKU 主表)
CREATE TABLE IF NOT EXISTS public.copy_skus (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL,
  canvas_id TEXT NOT NULL,
  scene_key TEXT NOT NULL,
  sku_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  current_version_id TEXT DEFAULT NULL, -- 首次创建允许 NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_copy_project_canvas_scene UNIQUE (project_id, canvas_id, scene_key),
  CONSTRAINT unique_copy_canvas_scene UNIQUE (canvas_id, scene_key),
  CONSTRAINT unique_copy_sku_id_current_ver UNIQUE (id, current_version_id)
);

-- Enable RLS for copy_skus
ALTER TABLE public.copy_skus ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive policies allowing unauthenticated public access
DROP POLICY IF EXISTS "Users can view own copy skus" ON public.copy_skus;
DROP POLICY IF EXISTS "Users can insert own copy skus" ON public.copy_skus;
DROP POLICY IF EXISTS "Users can update own copy skus" ON public.copy_skus;
DROP POLICY IF EXISTS "Users can delete own copy skus" ON public.copy_skus;

-- Strict SELECT policy: Only authenticated users can view their own copy skus directly
-- (All writes and primary queries are routed through Express API using service_role)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can select own copy skus') THEN
    CREATE POLICY "Authenticated users can select own copy skus"
      ON public.copy_skus FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_copy_skus_canvas ON public.copy_skus(canvas_id, scene_key);
CREATE INDEX IF NOT EXISTS idx_copy_skus_code ON public.copy_skus(sku_code);


-- 2. Copy Versions Table (文案不可变历史版本表)
CREATE TABLE IF NOT EXISTS public.copy_versions (
  id TEXT PRIMARY KEY,
  copy_sku_id TEXT NOT NULL REFERENCES public.copy_skus(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_code TEXT NOT NULL, -- e.g. 'COPY-V001', 'COPY-V002'
  parent_version_id TEXT DEFAULT NULL,
  source_type TEXT NOT NULL DEFAULT 'ai_generated', -- 'ai_generated' | 'manual_edit'
  product_dna_version_id TEXT DEFAULT NULL,
  asset_version_id TEXT DEFAULT NULL,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT NOT NULL, -- 64位 SHA-256 十六进制摘要
  generation_provider TEXT DEFAULT 'google',
  generation_model TEXT DEFAULT 'gemini-2.5-flash',
  prompt_snapshot TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_copy_sku_ver_pair UNIQUE (copy_sku_id, id),
  CONSTRAINT unique_copy_sku_version_number UNIQUE (copy_sku_id, version_number),
  CONSTRAINT unique_copy_sku_version_code UNIQUE (copy_sku_id, version_code),
  CONSTRAINT fk_parent_version_same_sku FOREIGN KEY (copy_sku_id, parent_version_id)
    REFERENCES public.copy_versions(copy_sku_id, id) ON DELETE SET NULL
);

-- Enable RLS for copy_versions
ALTER TABLE public.copy_versions ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive policies allowing unauthenticated public access
DROP POLICY IF EXISTS "Users can view own copy versions" ON public.copy_versions;
DROP POLICY IF EXISTS "Users can insert own copy versions" ON public.copy_versions;

-- Strict SELECT policy: Only authenticated users can view their own copy versions directly
-- (All version writes are handled atomically by Express API using service_role)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can select own copy versions') THEN
    CREATE POLICY "Authenticated users can select own copy versions"
      ON public.copy_versions FOR SELECT
      TO authenticated
      USING (auth.uid() = created_by);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_copy_versions_sku ON public.copy_versions(copy_sku_id, version_number ASC);
CREATE INDEX IF NOT EXISTS idx_copy_versions_hash ON public.copy_versions(content_hash);


-- 3. Composite Foreign Key: copy_skus.current_version_id must belong to same copy_sku
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_current_version_same_sku'
  ) THEN
    ALTER TABLE public.copy_skus
      ADD CONSTRAINT fk_current_version_same_sku
      FOREIGN KEY (id, current_version_id)
      REFERENCES public.copy_versions(copy_sku_id, id) ON DELETE SET NULL;
  END IF;
END $$;


-- 4. Database-Level Immutability Protection Trigger
CREATE OR REPLACE FUNCTION public.prevent_copy_versions_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'COPY_VERSION_IMMUTABLE: Copy Versions are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_copy_versions_mutation ON public.copy_versions;
CREATE TRIGGER trg_prevent_copy_versions_mutation
BEFORE UPDATE OR DELETE ON public.copy_versions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_copy_versions_mutation();


-- 5. Atomic Copy Version Creation Stored Procedure (RPC Function)
CREATE OR REPLACE FUNCTION public.create_copy_version_atomic(
  p_copy_sku_id TEXT,
  p_version_id TEXT,
  p_parent_version_id TEXT DEFAULT NULL,
  p_source_type TEXT DEFAULT 'ai_generated',
  p_product_dna_version_id TEXT DEFAULT NULL,
  p_asset_version_id TEXT DEFAULT NULL,
  p_content_json JSONB DEFAULT '{}'::jsonb,
  p_content_hash TEXT DEFAULT '',
  p_generation_provider TEXT DEFAULT 'google',
  p_generation_model TEXT DEFAULT 'gemini-2.5-flash',
  p_prompt_snapshot TEXT DEFAULT '',
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_next_number INT;
  v_version_code TEXT;
  v_created_at TIMESTAMPTZ := NOW();
  v_new_version JSONB;
BEGIN
  -- Row-level lock on copy_skus to prevent concurrent race conditions
  PERFORM 1 FROM public.copy_skus WHERE id = p_copy_sku_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPY_SKU_NOT_FOUND: Copy SKU with ID % does not exist', p_copy_sku_id;
  END IF;

  -- Calculate next sequential version number for this copy_sku
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_number
    FROM public.copy_versions
   WHERE copy_sku_id = p_copy_sku_id;

  v_version_code := 'COPY-V' || LPAD(v_next_number::text, 3, '0');

  -- Insert new version record
  INSERT INTO public.copy_versions (
    id,
    copy_sku_id,
    version_number,
    version_code,
    parent_version_id,
    source_type,
    product_dna_version_id,
    asset_version_id,
    content_json,
    content_hash,
    generation_provider,
    generation_model,
    prompt_snapshot,
    status,
    created_by,
    created_at
  ) VALUES (
    p_version_id,
    p_copy_sku_id,
    v_next_number,
    v_version_code,
    p_parent_version_id,
    p_source_type,
    p_product_dna_version_id,
    p_asset_version_id,
    p_content_json,
    p_content_hash,
    p_generation_provider,
    p_generation_model,
    p_prompt_snapshot,
    'active',
    p_created_by,
    v_created_at
  );

  -- Atomically update copy_skus.current_version_id
  UPDATE public.copy_skus
     SET current_version_id = p_version_id,
         updated_at = v_created_at
   WHERE id = p_copy_sku_id;

  SELECT jsonb_build_object(
    'id', p_version_id,
    'copy_sku_id', p_copy_sku_id,
    'version_number', v_next_number,
    'version_code', v_version_code,
    'parent_version_id', p_parent_version_id,
    'source_type', p_source_type,
    'product_dna_version_id', p_product_dna_version_id,
    'asset_version_id', p_asset_version_id,
    'content_json', p_content_json,
    'content_hash', p_content_hash,
    'created_at', v_created_at
  ) INTO v_new_version;

  RETURN v_new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

