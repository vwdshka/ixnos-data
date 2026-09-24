-- Runs once, when the Postgres data volume is first created.
-- Migrations also create these (IF NOT EXISTS) so managed databases get them too.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
