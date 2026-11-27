-- supabase/seed.sql
-- Safe draft seed data carried over from lib/defaults.ts / the previous
-- project's content files. EVERYTHING IS DRAFT except the three social links.
-- Nothing here is verified for publication; review and publish from the CMS.
--
-- Idempotent: ON CONFLICT DO NOTHING throughout. Re-running does not duplicate
-- rows or overwrite edits made in the CMS.
--
-- No auth.users rows and no passwords are created here. See the owner setup
-- instructions at the end of this file.

BEGIN;

-- ---------------------------------------------------------------------------
-- Site settings (single row; IDs fixed in 0001_initial_schema.sql)
-- ---------------------------------------------------------------------------
INSERT INTO public.site_settings (
  id, site_title, site_description, nav_items, contact_email, location,
  timezone, footer_note, cta, section_visibility, appearance, og_image, updated_by
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Divyansh Garg — Data, Business & Technology',
  'Portfolio of Divyansh Garg, undergraduate at IIT Madras, exploring data, business and technology.',
  '[
    {"label":"About","section":"about","visible":true},
    {"label":"Education","section":"education","visible":true},
    {"label":"Experience","section":"experience","visible":true},
    {"label":"Projects","section":"projects","visible":true},
    {"label":"Certifications","section":"certifications","visible":true},
    {"label":"Skills","section":"skills","visible":true},
    {"label":"Achievements","section":"achievements","visible":true},
    {"label":"Contact","section":"contact","visible":true}
  ]'::jsonb,
  'divyanshgarg.contact@gmail.com',
  'India',
  'Asia/Kolkata',
  'Built with intention. Coffee black, bronze light.',
  '{"label":"Contact","url":"/#contact"}'::jsonb,
  '{
    "hero":true,"about":true,"education":true,"experience":true,
    "projects":true,"certifications":true,"skills":true,"achievements":true,
    "community":true,"contact":true
  }'::jsonb,
  '{"accent":"caramel","grain":false,"loader":true,"terminal":true,"ember_density":"medium"}'::jsonb,
  NULL,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- About (single row; DRAFT placeholder text)
-- ---------------------------------------------------------------------------
INSERT INTO public.about (
  id, headline, subheadline, bio, intro, availability_status, location,
  career_direction, profile_image, interests, currently_learning, updated_by
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'DIVYANSH GARG',
  'Driven by curiosity. Grounded in data. Inspired by technology.',
  $bio$I am an undergraduate student at IIT Madras, pursuing a BS in Management and Data Science. My work explores how analytical thinking and technology can support better decisions and stronger products.

This biography is a draft placeholder. Confirm the exact programme title, academic status and career focus in the CMS before publishing.$bio$,
  'Exploring the intersection of data, business and technology.',
  'Open to internships, analytics roles and collaborative technical work',
  'IIT Madras, India',
  'Data and business technologist',
  NULL,
  ARRAY['Data analytics', 'Business strategy', 'Web technologies', 'Computational problem solving']::text[],
  ARRAY['Machine learning pipelines', 'Full-stack architecture', 'Data engineering']::text[],
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Social links (the only LIVE rows: verified-looking public links from the
-- previous project; confirm them before going to production)
-- ---------------------------------------------------------------------------
INSERT INTO public.social_links (id, platform, label, url, icon_key, visible, visibility, order_index)
VALUES
  ('00000000-0000-0000-0000-000000100001'::uuid, 'github',   'GitHub',   'https://github.com/divyanshgarg-01',                'github',    true, 'published', 1),
  ('00000000-0000-0000-0000-000000100002'::uuid, 'linkedin', 'LinkedIn', 'https://www.linkedin.com/in/divyanshgarg01',       'linkedin',  true, 'published', 2),
  ('00000000-0000-0000-0000-000000100003'::uuid, 'email',    'Email',    'mailto:divyanshgarg.contact@gmail.com',            'mail',      true, 'published', 3)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Projects (all DRAFT; no cover images and no invented URLs)
-- ---------------------------------------------------------------------------
INSERT INTO public.projects (
  id, slug, title, summary, description, category, status, cover_image,
  gallery, technologies, github_url, live_url, featured, visibility, order_index
)
VALUES
  (
    '00000000-0000-0000-0000-000000200001'::uuid,
    'cynorva',
    'Cynorva',
    'A co-founded initiative exploring digital products and data-backed business services.',
    'Draft placeholder description. Confirm the exact role, dates, outcomes and visuals before publishing.',
    'Business & Analytics',
    'Active prototype',
    NULL,
    '{}'::uuid[],
    ARRAY['Product strategy', 'Full-stack web', 'Data architecture']::text[],
    'https://github.com/divyanshgarg-01',
    '',
    true,
    'draft',
    1
  ),
  (
    '00000000-0000-0000-0000-000000200002'::uuid,
    'iit-ropar-vled-lab',
    'IIT Ropar VLED Lab Research',
    'Research and data analysis work at the Vision, Learning and Deep Learning Laboratory.',
    'Draft placeholder description. Add verified research outputs, mentor details and visuals before publishing.',
    'Research',
    'Completed',
    NULL,
    '{}'::uuid[],
    ARRAY['Python', 'Data analysis', 'Research']::text[],
    'https://github.com/divyanshgarg-01',
    '',
    false,
    'draft',
    2
  ),
  (
    '00000000-0000-0000-0000-000000200003'::uuid,
    'pybe-evidence-detective-lab',
    'PyBe Evidence Detective Lab',
    'An experimental forensic data investigation toolkit.',
    'Draft placeholder description. Confirm the repository, feature list and visuals before publishing.',
    'Cybersecurity & Forensic',
    'Prototype',
    NULL,
    '{}'::uuid[],
    ARRAY['Python', 'Data parsing', 'Pattern recognition']::text[],
    'https://github.com/divyanshgarg-01',
    '',
    false,
    'draft',
    3
  )
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Experience (all DRAFT; exact day/month dates are not invented)
-- ---------------------------------------------------------------------------
INSERT INTO public.experience (
  id, role, organization, location, employment_type, start_date, end_date,
  is_current, description, highlights, tags, logo, certificate, visibility, order_index
)
VALUES
  (
    '00000000-0000-0000-0000-000000300001'::uuid,
    'Co-founder', 'Cynorva', 'India', 'Venture', NULL, NULL, true,
    'Draft placeholder. Confirm dates and responsibilities before publishing.',
    ARRAY['Product direction', 'Digital strategy']::text[],
    ARRAY['Product', 'Analytics']::text[],
    NULL, NULL, 'draft', 1
  ),
  (
    '00000000-0000-0000-0000-000000300002'::uuid,
    'Research Intern, VLED Lab', 'IIT Ropar', 'Rupnagar, India', 'Internship', NULL, NULL, false,
    'Draft placeholder. Confirm exact title, dates and outputs before publishing.',
    ARRAY['Data preparation', 'Experimental analysis']::text[],
    ARRAY['Python', 'Research']::text[],
    NULL, NULL, 'draft', 2
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Education (all DRAFT)
-- ---------------------------------------------------------------------------
INSERT INTO public.education (
  id, degree, institution, location, period, status, details, coursework,
  achievement_note, visibility, order_index
)
VALUES
  (
    '00000000-0000-0000-0000-000000400001'::uuid,
    'BS in Management and Data Science',
    'Indian Institute of Technology, Madras',
    'Chennai, India',
    'Undergraduate — currently pursuing',
    'Currently pursuing',
    'Confirm the exact programme name and expected graduation date before publishing.',
    ARRAY['Mathematics', 'Statistics', 'Programming', 'Management']::text[],
    '',
    'draft', 1
  ),
  (
    '00000000-0000-0000-0000-000000400002'::uuid,
    'Intermediate of Science',
    'St. Xavier''s College, Ranchi',
    'Ranchi, India',
    '2022–2024',
    'Completed',
    'Physics, Chemistry, Mathematics, English and Computer Science.',
    '{}'::text[],
    '',
    'draft', 2
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Skill categories: CMS-managed groups with honest, no-level descriptions.
-- ---------------------------------------------------------------------------
INSERT INTO public.skill_categories (id, title, description, colour_token, visibility, published_at, order_index)
VALUES
  ('00000000-0000-0000-0000-000000500001'::uuid, 'Full-Stack Development (MERN)',           'MERN foundations, interfaces and full-stack workflows I am building with.',                     'caramel', 'published', now(), 1),
  ('00000000-0000-0000-0000-000000500002'::uuid, 'Data Science & Analytics',                 'Python-centred analysis, statistics and data handling, backed by coursework and lab work.',   'bronze',  'published', now(), 2),
  ('00000000-0000-0000-0000-000000500003'::uuid, 'Artificial Intelligence & Machine Learning', 'Applied AI and machine-learning concepts I am exploring and building with.',                    'warm',    'published', now(), 3),
  ('00000000-0000-0000-0000-000000500004'::uuid, 'Business & Strategy',                      'Management, strategy and product thinking from IIT Madras and Cynorva.',                        'text',    'published', now(), 4),
  ('00000000-0000-0000-0000-000000500005'::uuid, 'Developer Tools & Technologies',            'Everyday development tools, version control and integration patterns in my workflow.',          'bronze',  'published', now(), 5)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Skills: published, CMS-managed, with no levels or proficiency percentages.
-- Newer entries are explicitly framed as learning / working knowledge.
-- ---------------------------------------------------------------------------
INSERT INTO public.skills (id, category_id, name, note, featured, visibility, published_at, order_index)
VALUES
  ('00000000-0000-0000-0000-000000600001'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'React',                      '',                             true,  'published', now(), 1),
  ('00000000-0000-0000-0000-000000600002'::uuid, '00000000-0000-0000-0000-000000500002'::uuid, 'Python',                     '',                             true,  'published', now(), 2),
  ('00000000-0000-0000-0000-000000600003'::uuid, '00000000-0000-0000-0000-000000500002'::uuid, 'SQL',                        '',                             false, 'published', now(), 3),
  ('00000000-0000-0000-0000-000000600004'::uuid, '00000000-0000-0000-0000-000000500002'::uuid, 'Exploratory data analysis',  '',                             true,  'published', now(), 4),
  ('00000000-0000-0000-0000-000000600005'::uuid, '00000000-0000-0000-0000-000000500004'::uuid, 'Business strategy',          '',                             true,  'published', now(), 5),
  ('00000000-0000-0000-0000-000000600006'::uuid, '00000000-0000-0000-0000-000000500005'::uuid, 'Git & GitHub',               '',                             false, 'published', now(), 6),
  ('00000000-0000-0000-0000-000000600007'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'MongoDB',                    'Learning / working knowledge.', true,  'published', now(), 7),
  ('00000000-0000-0000-0000-000000600008'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'Express.js',                 'Learning / working knowledge.', true,  'published', now(), 8),
  ('00000000-0000-0000-0000-000000600009'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'Node.js',                    'Learning / working knowledge.', true,  'published', now(), 9),
  ('00000000-0000-0000-0000-000000600010'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'JavaScript',                 'Learning / working knowledge.', false, 'published', now(), 10),
  ('00000000-0000-0000-0000-000000600011'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'HTML5',                      'Learning / working knowledge.', false, 'published', now(), 11),
  ('00000000-0000-0000-0000-000000600012'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'CSS3',                       'Learning / working knowledge.', false, 'published', now(), 12),
  ('00000000-0000-0000-0000-000000600013'::uuid, '00000000-0000-0000-0000-000000500001'::uuid, 'REST APIs',                  'Learning / working knowledge.', false, 'published', now(), 13),
  ('00000000-0000-0000-0000-000000600014'::uuid, '00000000-0000-0000-0000-000000500002'::uuid, 'Pandas',                     'Learning / working knowledge.', false, 'published', now(), 14),
  ('00000000-0000-0000-0000-000000600015'::uuid, '00000000-0000-0000-0000-000000500002'::uuid, 'NumPy',                      'Learning / working knowledge.', false, 'published', now(), 15),
  ('00000000-0000-0000-0000-000000600016'::uuid, '00000000-0000-0000-0000-000000500002'::uuid, 'Data Cleaning',              'Learning / working knowledge.', false, 'published', now(), 16),
  ('00000000-0000-0000-0000-000000600017'::uuid, '00000000-0000-0000-0000-000000500002'::uuid, 'Data Visualization',         'Learning / working knowledge.', false, 'published', now(), 17),
  ('00000000-0000-0000-0000-000000600018'::uuid, '00000000-0000-0000-0000-000000500003'::uuid, 'Artificial Intelligence',    'Learning / working knowledge.', true,  'published', now(), 18),
  ('00000000-0000-0000-0000-000000600019'::uuid, '00000000-0000-0000-0000-000000500003'::uuid, 'Machine Learning',           'Learning / working knowledge.', true,  'published', now(), 19),
  ('00000000-0000-0000-0000-000000600020'::uuid, '00000000-0000-0000-0000-000000500003'::uuid, 'Generative AI',              'Learning / working knowledge.', false, 'published', now(), 20),
  ('00000000-0000-0000-0000-000000600021'::uuid, '00000000-0000-0000-0000-000000500003'::uuid, 'Large Language Models (LLMs)', 'Learning / working knowledge.', false, 'published', now(), 21),
  ('00000000-0000-0000-0000-000000600022'::uuid, '00000000-0000-0000-0000-000000500003'::uuid, 'Predictive Analytics',       'Learning / working knowledge.', false, 'published', now(), 22),
  ('00000000-0000-0000-0000-000000600023'::uuid, '00000000-0000-0000-0000-000000500004'::uuid, 'Business Analysis',          'Learning / working knowledge.', false, 'published', now(), 23),
  ('00000000-0000-0000-0000-000000600024'::uuid, '00000000-0000-0000-0000-000000500004'::uuid, 'Strategic Thinking',         'Learning / working knowledge.', false, 'published', now(), 24),
  ('00000000-0000-0000-0000-000000600025'::uuid, '00000000-0000-0000-0000-000000500004'::uuid, 'Problem Solving',            'Learning / working knowledge.', false, 'published', now(), 25),
  ('00000000-0000-0000-0000-000000600026'::uuid, '00000000-0000-0000-0000-000000500004'::uuid, 'Market Research',            'Learning / working knowledge.', false, 'published', now(), 26),
  ('00000000-0000-0000-0000-000000600027'::uuid, '00000000-0000-0000-0000-000000500004'::uuid, 'Data-Driven Decision Making', 'Learning / working knowledge.', false, 'published', now(), 27),
  ('00000000-0000-0000-0000-000000600028'::uuid, '00000000-0000-0000-0000-000000500004'::uuid, 'Product Thinking',           'Learning / working knowledge.', false, 'published', now(), 28),
  ('00000000-0000-0000-0000-000000600029'::uuid, '00000000-0000-0000-0000-000000500005'::uuid, 'VS Code',                    'Learning / working knowledge.', false, 'published', now(), 29),
  ('00000000-0000-0000-0000-000000600030'::uuid, '00000000-0000-0000-0000-000000500005'::uuid, 'API Integration',            'Learning / working knowledge.', false, 'published', now(), 30)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Achievements (only the two carried over from the previous project; both
-- DRAFT. No credential IDs, issue dates or verification URLs are invented.)
-- ---------------------------------------------------------------------------
INSERT INTO public.achievements (
  id, type, title, issuer, issue_date, expiry_date, credential_id, description,
  verification_url, file, featured, visibility, order_index
)
VALUES
  (
    '00000000-0000-0000-0000-000000700001'::uuid,
    'certificate',
    'Foundations Level in Data Science & Applications',
    'IIT Madras',
    NULL,
    NULL,
    '',
    'Draft placeholder. Upload the certificate and verification link before publishing.',
    '',
    NULL,
    true,
    'draft',
    1
  ),
  (
    '00000000-0000-0000-0000-000000700002'::uuid,
    'achievement',
    'Co-founding Cynorva',
    'Cynorva',
    NULL,
    NULL,
    '',
    'Draft placeholder. Confirm the achievement details before publishing.',
    '',
    NULL,
    false,
    'draft',
    2
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- OWNER SETUP (do this manually, never in seed.sql)
-- ---------------------------------------------------------------------------
-- 1. In the Supabase Dashboard open Authentication -> Users -> Add user and
--    create the owner account with the email configured in OWNER_EMAIL.
--    Choose a strong password or email magic link, then enable TOTP MFA for
--    that account (Security Plan §2). Do NOT script a password into SQL.
--
-- 2. The trigger public.handle_new_user() (0003) creates the matching profile
--    with role 'viewer'. Promote it by running this as postgres/service role
--    AFTER replacing the placeholder with the real owner email:
--
--      UPDATE public.profiles
--         SET role = 'owner', display_name = 'Divyansh Garg'
--       WHERE lower(email::text) = lower('replace-with-owner-email@example.com');
--
-- 3. Verify with: SELECT id, email, role FROM public.profiles;
--    Exactly one row should have role = 'owner'.
--
-- Optional editors/viewers: invite them in Auth, then set role = 'editor' or
-- 'viewer' on their profiles row using the same UPDATE pattern.
