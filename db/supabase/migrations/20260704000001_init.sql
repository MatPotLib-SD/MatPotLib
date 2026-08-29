-- MatPotLib — Initial schema migration
-- Run via Supabase CLI from the db/ directory:
--   supabase link --project-ref <your-project-ref>
--   supabase db push
--
-- pgcrypto: gen_random_uuid() is built-in since PG 13, but we enable
-- pgcrypto anyway for digest() used in device provisioning.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- Each row is owned by a single auth user.  Cascade-delete when the user is
-- deleted (profile is owned data).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  user_id          uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name     text,
  experience_level text,
  goals            text[],
  plant_types      text[],
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- devices
-- Pre-provisioned by an admin (service role).  owner_user_id is null until a
-- user claims the device via claim_code.  SET NULL on user-delete so the
-- device record (and its history) survives if the owner account is removed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  name             text,
  firmware_version text,
  status           text        NOT NULL DEFAULT 'offline',
  last_seen_at     timestamptz,
  claim_code       text        UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Index per spec (the UNIQUE constraint also creates an implicit unique index;
-- this named index gives the spec-required identifier).
CREATE INDEX IF NOT EXISTS idx_devices_claim_code ON devices (claim_code);

-- Owners can read and delete (unlink) their device.
-- INSERT and UPDATE (claim / status) are performed via the service role only.
CREATE POLICY "devices_select_own"
  ON devices FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "devices_delete_own"
  ON devices FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- device_secrets
-- Stores sha-256 hash of each device's provisioning token.
-- RLS enabled with NO policies → zero client access; service role only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_secrets (
  device_id   uuid        PRIMARY KEY REFERENCES devices (id) ON DELETE CASCADE,
  secret_hash text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE device_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no RLS policies: only the backend service role may read/write.

-- ─────────────────────────────────────────────────────────────────────────────
-- plant_species
-- Reference catalogue seeded from MiFloraDB (5 335 species) and enriched via
-- OpenAI.  scientific_name is the natural key used for upsert.
-- RLS: SELECT for any authenticated user; INSERT/UPDATE/DELETE via service role.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plant_species (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  common_name        text,
  scientific_name    text    NOT NULL UNIQUE,     -- unique index for upsert
  aliases            text[],
  care_level         text,
  ideal_moisture_min numeric,
  ideal_moisture_max numeric,
  ideal_lux_min      numeric,
  ideal_lux_max      numeric,
  ideal_temp_min     numeric,
  ideal_temp_max     numeric,
  ideal_humidity_min numeric,
  ideal_humidity_max numeric,
  source             text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plant_species ENABLE ROW LEVEL SECURITY;

-- Indexes per spec.  scientific_name is already covered by the UNIQUE
-- constraint above; the named index below makes the spec intent explicit.
CREATE INDEX IF NOT EXISTS idx_plant_species_scientific_name ON plant_species (scientific_name);
CREATE INDEX IF NOT EXISTS idx_plant_species_common_name     ON plant_species (common_name);

-- Authenticated users may read; only service role may write.
CREATE POLICY "plant_species_select_authenticated"
  ON plant_species FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- user_plants
-- A user's registered plant instance.  Device and species links are nullable
-- so the plant record survives if either is deleted.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_plants (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         uuid        NOT NULL REFERENCES auth.users (id)    ON DELETE CASCADE,
  device_id             uuid        REFERENCES devices      (id)           ON DELETE SET NULL,
  plant_species_id      uuid        REFERENCES plant_species(id)           ON DELETE SET NULL,
  nickname              text,
  user_plant_image_path text,          -- nullable, image upload deferred to SD2
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_plants_select_own"
  ON user_plants FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "user_plants_insert_own"
  ON user_plants FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "user_plants_update_own"
  ON user_plants FOR UPDATE TO authenticated
  USING  (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "user_plants_delete_own"
  ON user_plants FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- sensor_readings
-- High-volume table.  Server stamps ts = now(); ESP32 sends no timestamp.
-- Cascade-delete when the device is removed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_readings (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  device_id   uuid        NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL DEFAULT now(),
  moisture    numeric,
  temp_c      numeric,
  humidity    numeric,
  lux         numeric,
  battery_pct numeric          -- nullable; hardware may not report
);

ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- Composite index for per-device time-series queries (most recent first).
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_ts
  ON sensor_readings (device_id, ts DESC);

-- Owner can read readings for their device (via subquery join on devices).
-- Inserts are performed by the backend service role only.
CREATE POLICY "sensor_readings_select_own"
  ON sensor_readings FOR SELECT TO authenticated
  USING (
    device_id IN (
      SELECT id FROM devices WHERE owner_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- alerts
-- Generated by the backend alert evaluation logic.  user_plant_id is nullable
-- so the alert survives if the plant is deleted.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users (id)  ON DELETE CASCADE,
  device_id     uuid        NOT NULL REFERENCES devices    (id)  ON DELETE CASCADE,
  user_plant_id uuid        REFERENCES user_plants (id)          ON DELETE SET NULL,
  ts            timestamptz NOT NULL DEFAULT now(),
  type          text        NOT NULL,  -- e.g. moisture_low, temp_high
  severity      text        NOT NULL,  -- high | medium | info
  message       text,
  status        text        NOT NULL DEFAULT 'active',  -- active | resolved
  cooldown_key  text        -- ${user_plant_id}:${metric} for dedupe
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Per-user time-series index for alert history.
CREATE INDEX IF NOT EXISTS idx_alerts_user_ts ON alerts (user_id, ts DESC);

-- Users can read and update (mark resolved) their own alerts.
-- Inserts are performed by the backend service role only.
CREATE POLICY "alerts_select_own"
  ON alerts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "alerts_update_own"
  ON alerts FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- push_tokens
-- Expo push tokens registered after login.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expo_token   text        NOT NULL,
  platform     text,          -- ios | android
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- One row per (user, token): supports idempotent upsert from /push/register.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_user_token
  ON push_tokens (user_id, expo_token);

CREATE POLICY "push_tokens_select_own"
  ON push_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "push_tokens_insert_own"
  ON push_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_update_own"
  ON push_tokens FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_delete_own"
  ON push_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());
