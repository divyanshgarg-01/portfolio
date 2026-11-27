-- Allow CMS editors to mark the skills that are a current core focus.
-- Local SQLite already stores this flag; Supabase needs the matching column.
ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS skills_featured_idx
  ON public.skills (featured) WHERE featured;
