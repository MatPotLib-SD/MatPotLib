-- Event captures are service-role operations. Functions serialize every transition
-- through the device row, so unlink/disable, cancellation and completion compete
-- in one database transaction rather than in separate HTTP queries.
ALTER TABLE devices ADD COLUMN tabling_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE devices ADD COLUMN last_command_contact_at timestamptz;

ALTER TABLE sensor_readings ADD COLUMN captured_at timestamptz;
ALTER TABLE sensor_readings ADD COLUMN time_source text NOT NULL DEFAULT 'receipt'
  CHECK (time_source IN ('estimated', 'receipt'));
ALTER TABLE sensor_readings ADD COLUMN sample_age_ms integer
  CHECK (sample_age_ms IS NULL OR sample_age_ms BETWEEN 0 AND 300000);
ALTER TABLE sensor_readings ADD COLUMN capture_request_id uuid;
UPDATE sensor_readings SET captured_at = ts WHERE captured_at IS NULL;
CREATE OR REPLACE FUNCTION tabling_default_captured_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.captured_at := coalesce(NEW.captured_at, NEW.ts);
  RETURN NEW;
END $$;
CREATE TRIGGER tabling_sensor_capture_time BEFORE INSERT ON sensor_readings
  FOR EACH ROW EXECUTE FUNCTION tabling_default_captured_at();
ALTER TABLE sensor_readings ALTER COLUMN captured_at SET NOT NULL;
CREATE INDEX idx_sensor_readings_device_captured
  ON sensor_readings (device_id, captured_at DESC, id DESC);

CREATE TABLE capture_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','measuring','completed','failed','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds'),
  result_reading_id bigint REFERENCES sensor_readings(id),
  failure_reason text,
  UNIQUE (device_id, requester_user_id, idempotency_key),
  CHECK ((state = 'completed') = (result_reading_id IS NOT NULL))
);
CREATE UNIQUE INDEX capture_requests_one_active_per_device
  ON capture_requests(device_id) WHERE state IN ('pending','measuring');
CREATE INDEX capture_requests_device_created ON capture_requests(device_id, created_at DESC);
ALTER TABLE capture_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON capture_requests TO authenticated;
CREATE POLICY capture_requests_select_own ON capture_requests FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM devices WHERE devices.id = device_id AND devices.owner_user_id = auth.uid()
  ));

ALTER TABLE sensor_readings ADD CONSTRAINT sensor_readings_capture_request_id_fkey
  FOREIGN KEY (capture_request_id) REFERENCES capture_requests(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX sensor_readings_one_per_capture
  ON sensor_readings(capture_request_id) WHERE capture_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tabling_invalidate_device_captures()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR (OLD.tabling_enabled AND NOT NEW.tabling_enabled) THEN
    UPDATE capture_requests SET state = 'cancelled', failure_reason = 'Device ownership or event eligibility changed'
      WHERE device_id = NEW.id AND state IN ('pending','measuring');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tabling_device_invalidation AFTER UPDATE OF owner_user_id, tabling_enabled ON devices
  FOR EACH ROW EXECUTE FUNCTION tabling_invalidate_device_captures();

CREATE OR REPLACE FUNCTION tabling_expire_captures(p_device_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE capture_requests SET state = 'expired', failure_reason = 'Capture timed out'
    WHERE device_id = p_device_id AND state IN ('pending','measuring') AND expires_at <= clock_timestamp();
$$;

CREATE OR REPLACE FUNCTION tabling_create_capture(p_device_id uuid, p_user_id uuid, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE; v_now timestamptz;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.owner_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_now := clock_timestamp();
  PERFORM tabling_expire_captures(p_device_id);
  SELECT * INTO v_capture FROM capture_requests
    WHERE device_id = p_device_id AND requester_user_id = p_user_id AND idempotency_key = p_key;
  IF FOUND THEN RETURN jsonb_build_object('capture', to_jsonb(v_capture)); END IF;
  IF NOT v_device.tabling_enabled THEN
    RAISE EXCEPTION 'tabling_disabled' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_capture FROM capture_requests
    WHERE device_id = p_device_id AND state IN ('pending','measuring');
  IF FOUND THEN RETURN jsonb_build_object('active_capture_id', v_capture.id); END IF;
  INSERT INTO capture_requests(device_id, requester_user_id, idempotency_key,created_at,expires_at)
    VALUES (p_device_id,p_user_id,p_key,v_now,v_now + interval '30 seconds') RETURNING * INTO v_capture;
  RETURN jsonb_build_object('capture', to_jsonb(v_capture));
END $$;

-- Cancels an uncertain create by its client key. A tombstone serializes with
-- any later create using that key, even when no request row existed yet.
CREATE OR REPLACE FUNCTION tabling_cancel_pending_capture(p_device_id uuid, p_user_id uuid, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE; v_now timestamptz;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.owner_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_now := clock_timestamp();
  PERFORM tabling_expire_captures(p_device_id);
  SELECT * INTO v_capture FROM capture_requests WHERE device_id = p_device_id
    AND requester_user_id = p_user_id AND idempotency_key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO capture_requests(device_id,requester_user_id,idempotency_key,state,created_at,expires_at,failure_reason)
      VALUES (p_device_id,p_user_id,p_key,'cancelled',v_now,v_now,'Cancelled before request was observed')
      RETURNING * INTO v_capture;
  ELSIF v_capture.state IN ('pending','measuring') THEN
    UPDATE capture_requests SET state='cancelled', failure_reason='Cancelled by facilitator'
      WHERE id=v_capture.id RETURNING * INTO v_capture;
  END IF;
  RETURN to_jsonb(v_capture);
END $$;

CREATE OR REPLACE FUNCTION tabling_active_capture(p_device_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.owner_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM tabling_expire_captures(p_device_id);
  SELECT * INTO v_capture FROM capture_requests WHERE device_id = p_device_id
    AND state IN ('pending','measuring');
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_capture);
END $$;

CREATE OR REPLACE FUNCTION tabling_get_capture(p_device_id uuid, p_user_id uuid, p_capture_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.owner_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM tabling_expire_captures(p_device_id);
  SELECT * INTO v_capture FROM capture_requests WHERE id = p_capture_id
    AND device_id = p_device_id AND requester_user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'capture_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_capture);
END $$;

CREATE OR REPLACE FUNCTION tabling_cancel_capture(p_device_id uuid, p_user_id uuid, p_capture_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.owner_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM tabling_expire_captures(p_device_id);
  SELECT * INTO v_capture FROM capture_requests WHERE id = p_capture_id
    AND device_id = p_device_id AND requester_user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'capture_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_capture.state IN ('pending','measuring') THEN
    UPDATE capture_requests SET state = 'cancelled', failure_reason = 'Cancelled by facilitator'
      WHERE id = p_capture_id RETURNING * INTO v_capture;
  END IF;
  RETURN to_jsonb(v_capture);
END $$;

CREATE OR REPLACE FUNCTION tabling_poll_capture(p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002'; END IF;
  UPDATE devices SET last_command_contact_at = clock_timestamp() WHERE id = p_device_id;
  PERFORM tabling_expire_captures(p_device_id);
  IF NOT v_device.tabling_enabled OR v_device.owner_user_id IS NULL THEN
    RETURN jsonb_build_object('capture_request_id',NULL,'expires_at',NULL,'remaining_ms',NULL);
  END IF;
  SELECT * INTO v_capture FROM capture_requests WHERE device_id = p_device_id
    AND state IN ('pending','measuring') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('capture_request_id',NULL,'expires_at',NULL,'remaining_ms',NULL);
  END IF;
  IF v_capture.state = 'pending' THEN
    UPDATE capture_requests SET state = 'measuring' WHERE id = v_capture.id;
  END IF;
  RETURN jsonb_build_object('capture_request_id',v_capture.id,'expires_at',v_capture.expires_at,
    'remaining_ms',greatest(0,floor(extract(epoch FROM (v_capture.expires_at-clock_timestamp()))*1000)::integer));
END $$;

CREATE OR REPLACE FUNCTION tabling_fail_capture(p_device_id uuid, p_capture_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM tabling_expire_captures(p_device_id);
  SELECT * INTO v_capture FROM capture_requests WHERE id = p_capture_id AND device_id = p_device_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'capture_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_capture.state IN ('pending','measuring') THEN
    UPDATE capture_requests SET state = 'failed', failure_reason = left(coalesce(nullif(p_reason,''),'Sensor acquisition failed'),200)
      WHERE id = p_capture_id RETURNING * INTO v_capture;
  END IF;
  RETURN to_jsonb(v_capture);
END $$;

-- These reads lock the ownership row while selecting readings. A transfer or
-- new-owner upload cannot land between an ownership check and the data read.
CREATE OR REPLACE FUNCTION tabling_owned_latest(p_device_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_reading sensor_readings%ROWTYPE;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id=p_device_id AND owner_user_id=p_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_reading FROM sensor_readings WHERE device_id=p_device_id
    ORDER BY captured_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_reading);
END $$;

CREATE OR REPLACE FUNCTION tabling_owned_history(p_device_id uuid, p_user_id uuid,
                                                 p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_result jsonb;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id=p_device_id AND owner_user_id=p_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.captured_at,r.id),'[]'::jsonb) INTO v_result
    FROM (SELECT * FROM sensor_readings WHERE device_id=p_device_id
          AND (p_from IS NULL OR captured_at >= p_from)
          AND (p_to IS NULL OR captured_at <= p_to)
          ORDER BY captured_at,id LIMIT 5000) r;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION tabling_ingest_reading(
  p_device_id uuid, p_moisture numeric, p_temp_c numeric, p_humidity numeric,
  p_lux numeric, p_battery_pct numeric DEFAULT NULL, p_sample_age_ms integer DEFAULT NULL,
  p_capture_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_device devices%ROWTYPE; v_capture capture_requests%ROWTYPE;
        v_reading sensor_readings%ROWTYPE; v_now timestamptz;
        v_captured_at timestamptz;
BEGIN
  SELECT * INTO v_device FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002'; END IF;
  v_now := clock_timestamp();
  IF p_sample_age_ms IS NOT NULL AND (p_sample_age_ms < 0 OR p_sample_age_ms > 300000) THEN
    RAISE EXCEPTION 'invalid_sample_age' USING ERRCODE = '22023';
  END IF;
  v_captured_at := v_now - coalesce(p_sample_age_ms,0) * interval '1 millisecond';
  IF p_capture_request_id IS NOT NULL THEN
    SELECT * INTO v_capture FROM capture_requests WHERE id = p_capture_request_id
      AND device_id = p_device_id FOR UPDATE;
    v_now := clock_timestamp();
    v_captured_at := v_now - coalesce(p_sample_age_ms,0) * interval '1 millisecond';
    IF NOT FOUND THEN RAISE EXCEPTION 'capture_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_capture.state = 'completed' THEN
      SELECT * INTO v_reading FROM sensor_readings WHERE id = v_capture.result_reading_id;
      RETURN jsonb_build_object('reading',to_jsonb(v_reading),'inserted',false,
        'suppress_alerts',v_device.tabling_enabled);
    END IF;
    IF p_sample_age_ms IS NULL THEN
      RAISE EXCEPTION 'sample_age_required' USING ERRCODE = '22023';
    END IF;
    IF NOT v_device.tabling_enabled OR v_device.owner_user_id IS DISTINCT FROM v_capture.requester_user_id
       OR v_capture.state NOT IN ('pending','measuring') OR v_capture.expires_at <= v_now THEN
      RAISE EXCEPTION 'capture_not_active' USING ERRCODE = 'P0001';
    END IF;
    IF v_captured_at < v_capture.created_at THEN
      RAISE EXCEPTION 'sample_predates_capture' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO sensor_readings(device_id,ts,captured_at,time_source,sample_age_ms,capture_request_id,
                              moisture,temp_c,humidity,lux,battery_pct)
    VALUES (p_device_id,v_now,v_captured_at,
            CASE WHEN p_sample_age_ms IS NULL THEN 'receipt' ELSE 'estimated' END,
            p_sample_age_ms,p_capture_request_id,p_moisture,p_temp_c,p_humidity,p_lux,p_battery_pct)
    RETURNING * INTO v_reading;
  UPDATE devices SET last_seen_at = v_now, status = 'online' WHERE id = p_device_id;
  IF p_capture_request_id IS NOT NULL THEN
    UPDATE capture_requests SET state = 'completed', result_reading_id = v_reading.id
      WHERE id = p_capture_request_id;
  END IF;
  RETURN jsonb_build_object('reading',to_jsonb(v_reading),'inserted',true,
    'suppress_alerts',v_device.tabling_enabled);
END $$;

-- The API alone may invoke these privileged functions using its service role.
REVOKE ALL ON FUNCTION tabling_expire_captures(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_create_capture(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_cancel_pending_capture(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_active_capture(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_get_capture(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_cancel_capture(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_poll_capture(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_fail_capture(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_owned_latest(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_owned_history(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tabling_ingest_reading(uuid,numeric,numeric,numeric,numeric,numeric,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tabling_expire_captures(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_create_capture(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_cancel_pending_capture(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_active_capture(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_get_capture(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_cancel_capture(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_poll_capture(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_fail_capture(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_owned_latest(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_owned_history(uuid,uuid,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION tabling_ingest_reading(uuid,numeric,numeric,numeric,numeric,numeric,integer,uuid) TO service_role;
