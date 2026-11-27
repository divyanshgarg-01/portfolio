-- Certificates can optionally carry an expiry / validity date. This reuses the
-- existing achievements table because Certifications is a public view of
-- achievement records whose type is 'certificate'.
ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS expiry_date date;

COMMENT ON COLUMN public.achievements.expiry_date IS
  'Optional expiry date for a certificate; leave empty for lifetime credentials.';
