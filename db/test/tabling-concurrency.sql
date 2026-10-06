-- Run only on a fresh, disposable PostgreSQL database. This deliberately
-- commits the schema so dblink's second connection can see it.
-- psql -X -v ON_ERROR_STOP=1 -d <empty isolated database> -f db/test/tabling-concurrency.sql
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
\ir ../supabase/migrations/20260704000001_init.sql
\ir ../supabase/migrations/20260924000001_tabling.sql
CREATE EXTENSION dblink;
SELECT gen_random_uuid() AS u, gen_random_uuid() AS d \gset
INSERT INTO auth.users(id) VALUES (:'u'::uuid);
INSERT INTO devices(id,owner_user_id,tabling_enabled) VALUES (:'d'::uuid,:'u'::uuid,true);
COMMIT;

-- Supply -v dblink_connection='host=... dbname=... user=... password=...'
-- for a password-protected disposable test service (never a live database).
\if :{?dblink_connection}
SELECT dblink_connect('race', :'dblink_connection');
\else
SELECT dblink_connect('race', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
\endif

-- Completion wins: the competing cancellation waits on the device lock and
-- must observe the completed state after the first transaction commits.
SELECT (tabling_create_capture(:'d'::uuid,:'u'::uuid,'complete-wins')->'capture'->>'id') AS c1 \gset
SELECT set_config('test.c1', :'c1', false);
BEGIN;
SELECT id FROM devices WHERE id=:'d'::uuid FOR UPDATE;
SELECT dblink_send_query('race',format('SELECT tabling_cancel_capture(%L::uuid,%L::uuid,%L::uuid)',
  :'d',:'u',:'c1'));
SELECT pg_sleep(0.1);
DO $$ BEGIN
  IF dblink_is_busy('race') <> 1 THEN RAISE EXCEPTION 'cancel did not contend'; END IF;
END $$;
SELECT tabling_ingest_reading(:'d'::uuid,10,22,45,5000,NULL,0,:'c1'::uuid);
COMMIT;
SELECT * FROM dblink_get_result('race') AS r(result jsonb);
SELECT * FROM dblink_get_result('race') AS r(result jsonb);
DO $$ BEGIN
  IF (SELECT state FROM capture_requests WHERE id=current_setting('test.c1')::uuid) <> 'completed'
     OR (SELECT count(*) FROM sensor_readings WHERE capture_request_id=current_setting('test.c1')::uuid) <> 1 THEN
    RAISE EXCEPTION 'completion/cancellation race disagreed';
  END IF;
END $$;

-- Cancellation wins: remote completion waits on the same device lock, then
-- fails without inserting a reading after cancellation commits.
SELECT (tabling_create_capture(:'d'::uuid,:'u'::uuid,'cancel-wins')->'capture'->>'id') AS c2 \gset
SELECT set_config('test.c2', :'c2', false);
BEGIN;
SELECT id FROM devices WHERE id=:'d'::uuid FOR UPDATE;
SELECT dblink_send_query('race',format(
  'SELECT tabling_ingest_reading(%L::uuid,10,22,45,5000,NULL,0,%L::uuid)',:'d',:'c2'));
SELECT pg_sleep(0.1);
DO $$ BEGIN
  IF dblink_is_busy('race') <> 1 THEN RAISE EXCEPTION 'completion did not contend'; END IF;
END $$;
SELECT tabling_cancel_capture(:'d'::uuid,:'u'::uuid,:'c2'::uuid);
COMMIT;
SELECT * FROM dblink_get_result('race',false) AS r(result jsonb);
SELECT * FROM dblink_get_result('race',false) AS r(result jsonb);
DO $$ BEGIN
  IF (SELECT state FROM capture_requests WHERE id=current_setting('test.c2')::uuid) <> 'cancelled'
     OR EXISTS (SELECT 1 FROM sensor_readings WHERE capture_request_id=current_setting('test.c2')::uuid) THEN
    RAISE EXCEPTION 'cancellation/completion race disagreed';
  END IF;
END $$;

-- The receive timestamp must be sampled after the contended device lock.
-- A result queued before the deadline but unblocked afterward is expired.
SELECT (tabling_create_capture(:'d'::uuid,:'u'::uuid,'blocked-expiry')->'capture'->>'id') AS c3 \gset
SELECT set_config('test.c3', :'c3', false);
BEGIN;
SELECT id FROM devices WHERE id=:'d'::uuid FOR UPDATE;
SELECT dblink_send_query('race',format(
  'SELECT tabling_ingest_reading(%L::uuid,10,22,45,5000,NULL,0,%L::uuid)',:'d',:'c3'));
SELECT pg_sleep(0.1);
DO $$ BEGIN
  IF dblink_is_busy('race') <> 1 THEN RAISE EXCEPTION 'expiry completion did not contend'; END IF;
END $$;
UPDATE capture_requests SET expires_at=clock_timestamp()-interval '1 second' WHERE id=:'c3'::uuid;
COMMIT;
SELECT * FROM dblink_get_result('race',false) AS r(result jsonb);
SELECT * FROM dblink_get_result('race',false) AS r(result jsonb);
SELECT tabling_get_capture(:'d'::uuid,:'u'::uuid,:'c3'::uuid);
DO $$ BEGIN
  IF (SELECT state FROM capture_requests WHERE id=current_setting('test.c3')::uuid) <> 'expired'
     OR EXISTS (SELECT 1 FROM sensor_readings WHERE capture_request_id=current_setting('test.c3')::uuid) THEN
    RAISE EXCEPTION 'blocked completion crossed expiry';
  END IF;
END $$;

-- Cancellation ordered ahead of an in-flight create leaves a tombstone.
BEGIN;
SELECT id FROM devices WHERE id=:'d'::uuid FOR UPDATE;
SELECT dblink_send_query('race',format(
  'SELECT tabling_create_capture(%L::uuid,%L::uuid,%L)',:'d',:'u','cancel-before-create'));
SELECT pg_sleep(0.1);
DO $$ BEGIN
  IF dblink_is_busy('race') <> 1 THEN RAISE EXCEPTION 'create did not contend with cancel-pending'; END IF;
END $$;
SELECT (tabling_cancel_pending_capture(:'d'::uuid,:'u'::uuid,'cancel-before-create')->>'id') AS c4 \gset
COMMIT;
SELECT set_config('test.c4', :'c4', false);
SELECT * FROM dblink_get_result('race') AS r(result jsonb);
SELECT * FROM dblink_get_result('race') AS r(result jsonb);
DO $$ BEGIN
  IF (SELECT state FROM capture_requests WHERE id=current_setting('test.c4')::uuid) <> 'cancelled'
     OR (SELECT count(*) FROM capture_requests WHERE id=current_setting('test.c4')::uuid) <> 1 THEN
    RAISE EXCEPTION 'cancel-before-create race issued work';
  END IF;
END $$;

-- A same-key cancellation arriving after create waits, then cancels exactly it.
SELECT (tabling_create_capture(:'d'::uuid,:'u'::uuid,'cancel-after-create')->'capture'->>'id') AS c5 \gset
SELECT set_config('test.c5', :'c5', false);
BEGIN;
SELECT id FROM devices WHERE id=:'d'::uuid FOR UPDATE;
SELECT dblink_send_query('race',format(
  'SELECT tabling_cancel_pending_capture(%L::uuid,%L::uuid,%L)',:'d',:'u','cancel-after-create'));
SELECT pg_sleep(0.1);
DO $$ BEGIN
  IF dblink_is_busy('race') <> 1 THEN RAISE EXCEPTION 'cancel-pending did not contend with create'; END IF;
END $$;
COMMIT;
SELECT * FROM dblink_get_result('race') AS r(result jsonb);
SELECT * FROM dblink_get_result('race') AS r(result jsonb);
DO $$ BEGIN
  IF (SELECT state FROM capture_requests WHERE id=current_setting('test.c5')::uuid) <> 'cancelled' THEN
    RAISE EXCEPTION 'cancel-after-create race left work active';
  END IF;
END $$;
SELECT dblink_disconnect('race');
