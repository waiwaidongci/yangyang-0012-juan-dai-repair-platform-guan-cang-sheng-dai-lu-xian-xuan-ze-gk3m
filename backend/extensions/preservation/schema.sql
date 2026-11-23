CREATE TABLE IF NOT EXISTS reel_capture_profiles (
  reel text PRIMARY KEY REFERENCES acetate_reels(code),
  target_seconds numeric NOT NULL CHECK(target_seconds > 0),
  target_channels smallint NOT NULL CHECK(target_channels IN (1,2))
);
CREATE TABLE IF NOT EXISTS audio_derivative_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card bigint NOT NULL REFERENCES conservation_cards(id),
  kind text NOT NULL CHECK(kind IN ('master','access')),
  filename text NOT NULL, expected_digest text NOT NULL, measured_digest text NOT NULL,
  duration_seconds numeric NOT NULL CHECK(duration_seconds > 0),
  sample_rate integer NOT NULL CHECK(sample_rate > 0),
  channels smallint NOT NULL CHECK(channels IN (1,2)),
  clipped_frames integer NOT NULL CHECK(clipped_frames >= 0),
  recorded_by text NOT NULL,
  stage text NOT NULL DEFAULT 'queued' CHECK(stage IN ('queued','accepted','failed')),
  review_by text, failed_rules text[] NOT NULL DEFAULT '{}',
  UNIQUE(card,filename),
  CHECK ((stage='queued') = (review_by IS NULL)),
  CHECK ((stage='failed') = (cardinality(failed_rules) > 0))
);
-- 访问副本送检时登记取用的母版及校验值
ALTER TABLE audio_derivative_checks
  ADD COLUMN IF NOT EXISTS source_derivative bigint REFERENCES audio_derivative_checks(id),
  ADD COLUMN IF NOT EXISTS source_digest text;
ALTER TABLE audio_derivative_checks DROP CONSTRAINT IF EXISTS access_copy_source;
ALTER TABLE audio_derivative_checks ADD CONSTRAINT access_copy_source CHECK (
  (kind='access' AND source_derivative IS NOT NULL AND source_digest IS NOT NULL)
  OR (kind='master' AND source_derivative IS NULL AND source_digest IS NULL)
) NOT VALID;
-- 归档包换包申请：一母版一访问副本整包切换，每卷至多一个现用包
CREATE TABLE IF NOT EXISTS reel_archive_packages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reel text NOT NULL REFERENCES acetate_reels(code),
  base_package bigint REFERENCES reel_archive_packages(id),
  master bigint NOT NULL REFERENCES audio_derivative_checks(id),
  access_copy bigint NOT NULL REFERENCES audio_derivative_checks(id),
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  stage text NOT NULL CHECK(stage IN ('current','replaced','rejected','superseded')),
  conclusion text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_package_per_reel
  ON reel_archive_packages(reel) WHERE stage='current';
