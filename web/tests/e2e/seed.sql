-- Fixture data for the end-to-end tests. text_normalised and search_key are what the pipeline
-- normaliser produces for each title (final sigma folded to σ). Idempotent, and kept apart from real data by its
-- organisation ("E2E") and ΑΔΑΜ range (26...9990xx). Assumes the CPV codes are loaded, or
-- adds the two it needs.
INSERT INTO cpv_code (code, parent_code, level, label_el, label_en) VALUES
  ('33600000-6', NULL, 2, 'Φαρμακευτικά προϊόντα', 'Pharmaceutical products'),
  ('90910000-9', NULL, 3, 'Υπηρεσίες καθαρισμού', 'Cleaning services')
ON CONFLICT DO NOTHING;

INSERT INTO organisation (id, name_el, tax_id, updated_at)
VALUES ('E2E', 'ΔΗΜΟΣ ΔΟΚΙΜΩΝ E2E', NULL, now())
ON CONFLICT DO NOTHING;

INSERT INTO procurement_item
  (source, source_id, kind, title, text_normalised, search_key, amount_eur, cpv_codes, nuts_code,
   organisation_id, published_at, deadline_at, cancelled, raw, updated_at)
VALUES
  ('khmdhs', '26PROC999000001', 'notice', 'ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ ΔΟΚΙΜΗΣ E2E', 'προμηθεια φαρμακων δοκιμησ e2e',
   'promithia farmakon dokimis e2e', 12000, '{33600000-6}', 'EL543', 'E2E', now() - interval '1 day',
   now() + interval '10 days 2 hours', false, '{}', now()),
  ('khmdhs', '26AWRD999000002', 'award', 'ΑΝΑΘΕΣΗ ΦΑΡΜΑΚΩΝ ΔΟΚΙΜΗΣ E2E', 'αναθεση φαρμακων δοκιμησ e2e',
   'anathesi farmakon dokimis e2e', 11500, '{33600000-6}', 'EL543', 'E2E', now() - interval '1 day',
   NULL, false, '{}', now()),
  ('khmdhs', '26PROC999000003', 'notice', 'ΚΑΘΑΡΙΣΜΟΣ ΣΧΟΛΕΙΩΝ ΔΟΚΙΜΗΣ E2E', 'καθαρισμοσ σχολειων δοκιμησ e2e',
   'katharismos sholion dokimis e2e', 80000, '{90910000-9}', 'EL30', 'E2E', now() - interval '2 days',
   now() + interval '3 days', false, '{}', now())
ON CONFLICT (source, source_id) DO NOTHING;

INSERT INTO contractor (name) SELECT 'ΦΑΡΜΑΚΑΠΟΘΗΚΗ E2E Α.Ε.'
WHERE NOT EXISTS (SELECT 1 FROM contractor WHERE name = 'ΦΑΡΜΑΚΑΠΟΘΗΚΗ E2E Α.Ε.');

INSERT INTO item_contractor (item_id, contractor_id, role)
SELECT p.id, c.id, 'winner' FROM procurement_item p, contractor c
WHERE p.source_id = '26AWRD999000002' AND c.name = 'ΦΑΡΜΑΚΑΠΟΘΗΚΗ E2E Α.Ε.'
ON CONFLICT DO NOTHING;

INSERT INTO item_link (from_item_id, relation, to_source, to_source_id, to_item_id)
SELECT a.id, 'notice', 'khmdhs', n.source_id, n.id FROM procurement_item a, procurement_item n
WHERE a.source_id = '26AWRD999000002' AND n.source_id = '26PROC999000001'
ON CONFLICT DO NOTHING;
