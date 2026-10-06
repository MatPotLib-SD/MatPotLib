-- Run only against a disposable, empty PostgreSQL database:
--   psql -X -v ON_ERROR_STOP=1 -d <isolated_database> -f db/test/tabling.sql
-- Everything in this file, including roles and schemas, is rolled back.
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

DO $$
DECLARE
  u uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  d uuid := gen_random_uuid();
  c uuid;
  c2 uuid;
  result jsonb;
  reading_id bigint;
BEGIN
  INSERT INTO auth.users(id) VALUES (u),(other_user);
  INSERT INTO devices(id, owner_user_id, tabling_enabled) VALUES (d,u,true);

  result := tabling_create_capture(d,u,'first-key');
  c := (result->'capture'->>'id')::uuid;
  IF c IS NULL THEN RAISE EXCEPTION 'creation failed'; END IF;
  IF (tabling_create_capture(d,u,'first-key')->'capture'->>'id')::uuid <> c THEN
    RAISE EXCEPTION 'same key created a second request';
  END IF;
  IF (tabling_create_capture(d,u,'different-key')->>'active_capture_id')::uuid <> c THEN
    RAISE EXCEPTION 'different key adopted active request';
  END IF;
  IF (tabling_poll_capture(d)->>'capture_request_id')::uuid <> c
     OR (tabling_poll_capture(d)->>'capture_request_id')::uuid <> c THEN
    RAISE EXCEPTION 'poll did not redeliver request';
  END IF;
  IF (SELECT state FROM capture_requests WHERE id=c) <> 'measuring' THEN
    RAISE EXCEPTION 'poll did not claim request';
  END IF;
  BEGIN
    PERFORM tabling_ingest_reading(d,12,22,45,6000,NULL,NULL,c);
    RAISE EXCEPTION 'command without age accepted' USING ERRCODE='P0003';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF (SELECT last_command_contact_at FROM devices WHERE id=d) IS NULL THEN
    RAISE EXCEPTION 'command contact missing';
  END IF;

  result := tabling_ingest_reading(d,10,22,45,5000,NULL,100,NULL);
  INSERT INTO sensor_readings(device_id,ts,moisture,temp_c,humidity,lux)
    VALUES (d,clock_timestamp()-interval '1 day',11,22,45,5000);
  IF NOT EXISTS (SELECT 1 FROM sensor_readings WHERE device_id=d AND moisture=11
                 AND captured_at=ts AND time_source='receipt') THEN
    RAISE EXCEPTION 'legacy direct insert did not inherit its receipt timestamp';
  END IF;
  IF (SELECT state FROM capture_requests WHERE id=c) <> 'measuring' THEN
    RAISE EXCEPTION 'scheduled upload completed command';
  END IF;
  result := tabling_ingest_reading(d,12,22,45,6000,NULL,0,c);
  reading_id := (result->'reading'->>'id')::bigint;
  IF result->>'inserted' <> 'true'
     OR (SELECT result_reading_id FROM capture_requests WHERE id=c) <> reading_id THEN
    RAISE EXCEPTION 'command completion not atomic';
  END IF;
  result := tabling_ingest_reading(d,99,22,45,6000,NULL,NULL,c);
  IF result->>'inserted' <> 'false' OR (result->'reading'->>'id')::bigint <> reading_id
     OR (SELECT count(*) FROM sensor_readings WHERE capture_request_id=c) <> 1 THEN
    RAISE EXCEPTION 'duplicate upload created a second reading';
  END IF;
  IF (tabling_cancel_capture(d,u,c)->>'state') <> 'completed' THEN
    RAISE EXCEPTION 'late cancel changed completed result';
  END IF;
  IF (tabling_owned_latest(d,u)->>'capture_request_id')::uuid <> c
     OR jsonb_array_length(tabling_owned_history(d,u,NULL,NULL)) < 2 THEN
    RAISE EXCEPTION 'owned reading RPC omitted acquisition history';
  END IF;
  BEGIN
    PERFORM tabling_owned_latest(d,other_user);
    RAISE EXCEPTION 'nonowner read latest' USING ERRCODE='P0003';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  BEGIN
    PERFORM tabling_owned_history(d,other_user,NULL,NULL);
    RAISE EXCEPTION 'nonowner read history' USING ERRCODE='P0003';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  BEGIN
    PERFORM tabling_get_capture(d,other_user,c);
    RAISE EXCEPTION 'nonowner read capture';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
END $$;

DO $$
DECLARE
  u uuid := (SELECT owner_user_id FROM devices LIMIT 1);
  d uuid := (SELECT id FROM devices LIMIT 1);
  c uuid;
  c2 uuid;
  poll_result jsonb;
BEGIN
  c := (tabling_create_capture(d,u,'cancel-key')->'capture'->>'id')::uuid;
  PERFORM tabling_cancel_capture(d,u,c);
  IF (SELECT state FROM capture_requests WHERE id=c) <> 'cancelled' THEN
    RAISE EXCEPTION 'cancel failed';
  END IF;
  BEGIN
    PERFORM tabling_ingest_reading(d,10,22,45,5000,NULL,100,c);
    RAISE EXCEPTION 'cancelled result accepted' USING ERRCODE = 'P0003';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  c2 := (tabling_create_capture(d,u,'fail-key')->'capture'->>'id')::uuid;
  PERFORM tabling_fail_capture(d,c2,'probe unavailable');
  IF (SELECT state FROM capture_requests WHERE id=c2) <> 'failed' THEN
    RAISE EXCEPTION 'explicit failure missing';
  END IF;
  c2 := (tabling_create_capture(d,u,'expiry-key')->'capture'->>'id')::uuid;
  UPDATE capture_requests SET expires_at = now() - interval '1 second' WHERE id=c2;
  poll_result := tabling_poll_capture(d);
  IF (poll_result->>'capture_request_id') IS NOT NULL
     OR (SELECT state FROM capture_requests WHERE id=c2) <> 'expired' THEN
    RAISE EXCEPTION 'expired command was issued: %, %', poll_result,
      (SELECT state FROM capture_requests WHERE id=c2);
  END IF;
  c2 := (tabling_cancel_pending_capture(d,u,'unobserved-key')->>'id')::uuid;
  IF (SELECT state FROM capture_requests WHERE id=c2) <> 'cancelled'
     OR (tabling_create_capture(d,u,'unobserved-key')->'capture'->>'id')::uuid <> c2 THEN
    RAISE EXCEPTION 'cancel-before-create did not leave tombstone';
  END IF;
  c2 := (tabling_create_capture(d,u,'cancel-by-key')->'capture'->>'id')::uuid;
  PERFORM tabling_cancel_pending_capture(d,u,'unrelated-key');
  IF (SELECT state FROM capture_requests WHERE id=c2) <> 'pending' THEN
    RAISE EXCEPTION 'cancel-by-key changed different active request';
  END IF;
  IF (tabling_cancel_pending_capture(d,u,'cancel-by-key')->>'state') <> 'cancelled'
     OR (tabling_create_capture(d,u,'cancel-by-key')->'capture'->>'id')::uuid <> c2 THEN
    RAISE EXCEPTION 'cancel-by-key did not stop active request';
  END IF;
  c2 := (tabling_create_capture(d,u,'disable-key')->'capture'->>'id')::uuid;
  UPDATE devices SET tabling_enabled=false WHERE id=d;
  IF (SELECT state FROM capture_requests WHERE id=c2) <> 'cancelled' THEN
    RAISE EXCEPTION 'disable did not invalidate request';
  END IF;
  IF (tabling_poll_capture(d)->>'capture_request_id') IS NOT NULL THEN
    RAISE EXCEPTION 'disabled device received work';
  END IF;
  IF (tabling_cancel_pending_capture(d,u,'disabled-cleanup')->>'state') <> 'cancelled' THEN
    RAISE EXCEPTION 'disabled device could not cancel unknown create';
  END IF;
  IF (tabling_create_capture(d,u,'disabled-cleanup')->'capture'->>'state') <> 'cancelled' THEN
    RAISE EXCEPTION 'late same-key create did not see disabled tombstone';
  END IF;
END $$;

-- Exercise RLS as the client role, not only service-role functions.
GRANT USAGE ON SCHEMA auth,public TO authenticated;
GRANT SELECT ON devices TO authenticated;
SELECT owner_user_id AS test_owner FROM devices LIMIT 1 \gset
SELECT id AS test_other FROM auth.users WHERE id <> :'test_owner'::uuid LIMIT 1 \gset
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'test_owner', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM capture_requests) = 0 THEN
    RAISE EXCEPTION 'owner could not read capture rows through RLS';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', :'test_other', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM capture_requests) <> 0 THEN
    RAISE EXCEPTION 'nonowner could read capture rows through RLS';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE owner_id uuid := (SELECT owner_user_id FROM devices LIMIT 1);
        device_id uuid := (SELECT id FROM devices LIMIT 1);
        reading_count bigint := (SELECT count(*) FROM sensor_readings);
BEGIN
  DELETE FROM auth.users WHERE id=owner_id;
  IF (SELECT owner_user_id FROM devices WHERE id=device_id) IS NOT NULL
     OR (SELECT count(*) FROM sensor_readings) <> reading_count
     OR EXISTS (SELECT 1 FROM sensor_readings WHERE capture_request_id IS NOT NULL) THEN
    RAISE EXCEPTION 'account deletion lost reading history or left capture reference';
  END IF;
END $$;

DO $$
BEGIN
  IF has_function_privilege('authenticated','tabling_ingest_reading(uuid,numeric,numeric,numeric,numeric,numeric,integer,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','tabling_create_capture(uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'privileged RPC callable by client role';
  END IF;
END $$;
ROLLBACK;
