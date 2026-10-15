-- ============================================================
-- Cover images for portfolios (reclu.cl)
-- Añade campo de imagen de portada. Idempotente: reejecutable.
-- Las portadas viven en public/covers/ (assets estáticos del repo).
-- ============================================================

alter table public.portfolios
  add column if not exists cover_image text,
  add column if not exists cover_type text not null default 'asset';
-- cover_type: 'asset' (imagen de public/covers) | 'upload' (subida manual)

comment on column public.portfolios.cover_image is 'Ruta relativa en /covers, ej. 05-algoritmo.png';
comment on column public.portfolios.cover_type is 'asset = de public/covers; upload = subida manual';
