import type { NavigatorScreenParams } from '@react-navigation/native';

// ---------------------------------------------------------------------------
// API models (mirror backend / Supabase schema — see docs/HANDOFF.md Section 5)
// ---------------------------------------------------------------------------

export interface SpeciesRow {
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
}

export interface Reading {
  id: number;
  device_id: string;
  ts: string;
  moisture: number;
  temp_c: number;
  humidity: number;
  lux: number;
  battery_pct: number | null;
}

export interface Plant {
  id: string;
  owner_user_id: string;
  device_id: string | null;
  plant_species_id: string | null;
  nickname: string | null;
  user_plant_image_path: string | null;
  notes: string | null;
  created_at: string;
  /** Populated by GET /plants (list includes the latest reading per plant). */
  latest_reading?: Reading | null;
  /** Joined species row (ideal ranges) when available. */
  species?: SpeciesRow | null;
}

export type AlertSeverity = 'high' | 'medium' | 'low' | 'info';

export interface Alert {
  id: string;
  user_id: string;
  device_id: string;
  user_plant_id: string | null;
  ts: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  status: 'active' | 'resolved';
  cooldown_key: string | null;
}

export interface Device {
  id: string;
  owner_user_id: string | null;
  name: string | null;
  firmware_version: string | null;
  status: 'online' | 'offline';
  last_seen_at: string | null;
  claim_code: string | null;
  created_at: string;
}

export interface Profile {
  user_id: string;
  display_name: string | null;
  experience_level: string | null;
  goals: string[] | null;
  plant_types: string[] | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export interface PlantInput {
  nickname: string;
  plant_species_id?: string | null;
  device_id?: string | null;
  notes?: string | null;
}

export interface ProfileUpdate {
  display_name?: string | null;
  experience_level?: string | null;
  goals?: string[];
  plant_types?: string[];
}

// ---------------------------------------------------------------------------
// Navigation param lists
// ---------------------------------------------------------------------------

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
};

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  HomeStack: NavigatorScreenParams<HomeStackParamList>;
  Alerts: undefined;
  Settings: undefined;
};

export type HomeStackParamList = {
  PlantList: undefined;
  PlantData: { plantId: string; deviceId: string };
  AddEditPlant: { plantId?: string } | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
