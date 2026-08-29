## Stripped items (summary)

| Schema | What it is |
|---|---|
| auth | Supabase Auth internals — users, sessions, MFA, OAuth, SSO, SAML, tokens |
| storage | Supabase Storage — buckets, objects, multipart uploads, vector indexes |
| realtime | Supabase Realtime — pub/sub messages, subscriptions |
| vault | Supabase Vault — encrypted secrets management |
| extensions | Postgres extension internals (pg_stat_statements) |
| pg_catalog | Postgres system catalog (internal metadata, always present) |
| information_schema | ANSI SQL standard metadata views (always present) |
| supabase_migrations | Supabase's own migration tracking table |


## Project schema - table summary (public)

| Table | Purpose | Key columns |
|---|---|---|
| devices | Physical sensor devices | id, owner_user_id, status, firmware_version, claim_code, last_seen_at |
| device_secrets | Device auth secrets | device_id, secret_hash |
| sensor_readings | Time-series sensor data | device_id, ts, moisture, temp_c, humidity, lux, battery_pct |
| user_plants | User's tracked plants | id, owner_user_id, device_id, plant_species_id, nickname, notes |
| plant_species | Plant reference data | common_name, scientific_name, ideal ranges (moisture/lux/temp/humidity) |
| profiles | User profile info | user_id, display_name, experience_level, goals, plant_types |
| alerts | Plant/device alerts | user_id, device_id, user_plant_id, type, severity, status |
| push_tokens | Mobile push notification tokens | user_id, expo_token, platform |


## Project schema - ALL (public)

| table_name | column_name | data_type | purpose |
|---|---|---|---|
| alerts | id | uuid | Alert record ID |
| alerts | user_id | uuid | Owning user |
| alerts | device_id | uuid | Related device |
| alerts | user_plant_id | uuid | Related plant (optional) |
| alerts | ts | timestamp with time zone | When alert fired |
| alerts | type | text | Alert category (e.g. low moisture) |
| alerts | severity | text | Alert severity level |
| alerts | message | text | Human-readable alert text |
| alerts | status | text | Alert state (open/resolved/etc) |
| alerts | cooldown_key | text | Dedup key to prevent alert spam |
| device_secrets | device_id | uuid | Device the secret belongs to |
| device_secrets | secret_hash | text | Hashed device auth secret |
| device_secrets | created_at | timestamp with time zone | Secret creation time |
| devices | id | uuid | Device ID |
| devices | owner_user_id | uuid | Owning user |
| devices | name | text | Device display name |
| devices | firmware_version | text | Installed firmware version |
| devices | status | text | Device status (online/offline/etc) |
| devices | last_seen_at | timestamp with time zone | Last check-in time |
| devices | claim_code | text | Code used to claim/pair device |
| devices | created_at | timestamp with time zone | Device registration time |
| plant_species | id | uuid | Species ID |
| plant_species | common_name | text | Common plant name |
| plant_species | scientific_name | text | Scientific/botanical name |
| plant_species | aliases | ARRAY | Alternate names |
| plant_species | care_level | text | Difficulty of care |
| plant_species | ideal_moisture_min | numeric | Ideal min soil moisture |
| plant_species | ideal_moisture_max | numeric | Ideal max soil moisture |
| plant_species | ideal_lux_min | numeric | Ideal min light level |
| plant_species | ideal_lux_max | numeric | Ideal max light level |
| plant_species | ideal_temp_min | numeric | Ideal min temperature |
| plant_species | ideal_temp_max | numeric | Ideal max temperature |
| plant_species | ideal_humidity_min | numeric | Ideal min humidity |
| plant_species | ideal_humidity_max | numeric | Ideal max humidity |
| plant_species | source | text | Data source/reference |
| plant_species | created_at | timestamp with time zone | Record creation time |
| profiles | user_id | uuid | User ID (PK) |
| profiles | display_name | text | User's display name |
| profiles | experience_level | text | Gardening experience level |
| profiles | goals | ARRAY | User's stated goals |
| profiles | plant_types | ARRAY | Preferred plant types |
| profiles | created_at | timestamp with time zone | Profile creation time |
| push_tokens | id | uuid | Token record ID |
| push_tokens | user_id | uuid | Owning user |
| push_tokens | expo_token | text | Expo push token string |
| push_tokens | platform | text | Device platform (iOS/Android) |
| push_tokens | created_at | timestamp with time zone | Token registration time |
| push_tokens | last_seen_at | timestamp with time zone | Last active use of token |
| sensor_readings | id | bigint | Reading ID |
| sensor_readings | device_id | uuid | Source device |
| sensor_readings | ts | timestamp with time zone | Reading timestamp |
| sensor_readings | moisture | numeric | Soil moisture reading |
| sensor_readings | temp_c | numeric | Temperature (°C) |
| sensor_readings | humidity | numeric | Humidity reading |
| sensor_readings | lux | numeric | Light level reading |
| sensor_readings | battery_pct | numeric | Device battery percentage |
| user_plants | id | uuid | User plant record ID |
| user_plants | owner_user_id | uuid | Owning user |
| user_plants | device_id | uuid | Linked sensor device |
| user_plants | plant_species_id | uuid | Linked species reference |
| user_plants | nickname | text | User-given plant name |
| user_plants | user_plant_image_path | text | Path to plant photo |
| user_plants | notes | text | User notes |
| user_plants | created_at | timestamp with time zone | Record creation time |