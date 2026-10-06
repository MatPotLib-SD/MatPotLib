/**
 * Hand-written row types for the Supabase schema (see docs/HANDOFF.md §5).
 * Kept minimal on purpose — no ORM, just typing for the supabase-js client.
 * Note: these must be type aliases (not interfaces) so they satisfy the
 * Record<string, unknown> constraint of the supabase-js generics.
 */

export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  experience_level: string | null;
  goals: string[] | null;
  plant_types: string[] | null;
  created_at: string;
};

export type DeviceRow = {
  id: string;
  owner_user_id: string | null;
  name: string | null;
  firmware_version: string | null;
  status: string;
  last_seen_at: string | null;
  tabling_enabled: boolean;
  last_command_contact_at: string | null;
  claim_code: string | null;
  created_at: string;
};

export type DeviceSecretRow = {
  device_id: string;
  secret_hash: string;
  created_at: string;
};

export type PlantSpeciesRow = {
  id: string;
  common_name: string | null;
  scientific_name: string | null;
  aliases: string[] | null;
  care_level: string | null;
  ideal_moisture_min: number | null;
  ideal_moisture_max: number | null;
  ideal_lux_min: number | null;
  ideal_lux_max: number | null;
  ideal_temp_min: number | null;
  ideal_temp_max: number | null;
  ideal_humidity_min: number | null;
  ideal_humidity_max: number | null;
  source: string | null;
  created_at: string;
};

export type UserPlantRow = {
  id: string;
  owner_user_id: string;
  device_id: string | null;
  plant_species_id: string | null;
  nickname: string | null;
  user_plant_image_path: string | null;
  notes: string | null;
  created_at: string;
};

export type SensorReadingRow = {
  id: number;
  device_id: string;
  ts: string;
  captured_at: string;
  time_source: 'estimated' | 'receipt';
  sample_age_ms: number | null;
  capture_request_id: string | null;
  moisture: number | null;
  temp_c: number | null;
  humidity: number | null;
  lux: number | null;
  battery_pct: number | null;
};

export type CaptureRequestRow = {
  id: string;
  device_id: string;
  requester_user_id: string;
  idempotency_key: string;
  state:
    | 'pending'
    | 'measuring'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled';
  created_at: string;
  expires_at: string;
  result_reading_id: number | null;
  failure_reason: string | null;
};

export type AlertRow = {
  id: string;
  user_id: string;
  device_id: string;
  user_plant_id: string | null;
  ts: string;
  type: string;
  severity: string;
  message: string;
  status: string;
  cooldown_key: string | null;
};

export type PushTokenRow = {
  id: string;
  user_id: string;
  expo_token: string;
  platform: string | null;
  created_at: string;
  last_seen_at: string | null;
};

type TableDef<R extends Record<string, unknown>> = {
  Row: R;
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow>;
      devices: TableDef<DeviceRow>;
      device_secrets: TableDef<DeviceSecretRow>;
      plant_species: TableDef<PlantSpeciesRow>;
      user_plants: TableDef<UserPlantRow>;
      sensor_readings: TableDef<SensorReadingRow>;
      capture_requests: TableDef<CaptureRequestRow>;
      alerts: TableDef<AlertRow>;
      push_tokens: TableDef<PushTokenRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      tabling_create_capture: {
        Args: { p_device_id: string; p_user_id: string; p_key: string };
        Returns: Record<string, unknown>;
      };
      tabling_cancel_pending_capture: {
        Args: { p_device_id: string; p_user_id: string; p_key: string };
        Returns: Record<string, unknown>;
      };
      tabling_active_capture: {
        Args: { p_device_id: string; p_user_id: string };
        Returns: Record<string, unknown> | null;
      };
      tabling_get_capture: {
        Args: { p_device_id: string; p_user_id: string; p_capture_id: string };
        Returns: Record<string, unknown>;
      };
      tabling_cancel_capture: {
        Args: { p_device_id: string; p_user_id: string; p_capture_id: string };
        Returns: Record<string, unknown>;
      };
      tabling_poll_capture: {
        Args: { p_device_id: string };
        Returns: Record<string, unknown>;
      };
      tabling_fail_capture: {
        Args: { p_device_id: string; p_capture_id: string; p_reason: string };
        Returns: Record<string, unknown>;
      };
      tabling_owned_latest: {
        Args: { p_device_id: string; p_user_id: string };
        Returns: Record<string, unknown> | null;
      };
      tabling_owned_history: {
        Args: {
          p_device_id: string;
          p_user_id: string;
          p_from: string | null;
          p_to: string | null;
        };
        Returns: Record<string, unknown>[];
      };
      tabling_ingest_reading: {
        Args: {
          p_device_id: string;
          p_moisture: number;
          p_temp_c: number;
          p_humidity: number;
          p_lux: number;
          p_battery_pct?: number | null;
          p_sample_age_ms?: number | null;
          p_capture_request_id?: string | null;
        };
        Returns: Record<string, unknown>;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
