-- Las fotos se guardan en Neon, comprimidas a WebP desde el editor.
-- La eliminación lógica conserva las fichas y sus referencias históricas.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_data bytea;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_mime text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS products_visible_idx
  ON public.products (category, name) WHERE active = true AND deleted_at IS NULL;
