# MatPotLib SD1 MVP — Implementation Handoff (authoritative spec)

Scope: Senior Design 1 MVP only. Do not build SD2 stretch features.
This file overrides the PDD where they conflict. Do not invent credentials — use `.env` placeholders and `.env.example`.

---

## 1. Product summary

- Physical pot: ESP32 + sensors reads environment, POSTs to backend over WiFi every 15 min.
- Backend: validates, stores readings, compares to species ideal ranges, generates alerts + push.
- Mobile app: dashboards, history charts, alerts, settings.
- Users: beginner plant owners. UX priority: simple.

Data flow:
```
ESP32 (hardcoded WiFi) --HTTPS POST--> Backend (Azure Container Apps)
   validate token + payload -> INSERT sensor_readings
   compare vs plant_species ranges -> if out-of-range & not in cooldown:
       INSERT alert -> Expo push
Backend <--REST(JWT)--> Supabase (managed Postgres, all data)
Mobile app <--REST(JWT)--> Backend ; receives Expo push
```

---

## 2. Resolved decisions (do not deviate)

Architecture:
- Monorepo, single repo, directories per Section 4.
- No BLE. No provisioning UI. WiFi credentials hardcoded in firmware.
- Device pairing = claim by `claim_code`, not radio.

Backend:
- NestJS + TypeScript, Node 20 LTS.
- DB access: Supabase JS client. No ORM (no Prisma).
- Migrations: Supabase CLI (`supabase/migrations/*.sql`).
- Auth: Supabase Auth. Backend verifies Supabase JWT via JWKS. Ownership enforced in Nest guards.
- Google sign-in: in scope (Supabase OAuth provider).
- Password reset: in scope, via Supabase Auth email (no custom email code).
- Push: `expo-server-sdk`.
- Reading interval: 15 min.
- Alert cooldown: universal 2h. Single exported constant `ALERT_COOLDOWN_SECONDS = 7200`. Easy to change.
- Thresholds: `plant_species` table only. No per-plant overrides.
- One "recovered" info alert when a metric returns in-range (still respects same dedupe key clear).

Database:
- Supabase managed Postgres. RLS on all user tables + Nest ownership checks (service key bypasses RLS).
- Tables: `profiles, devices, device_secrets, plant_species, user_plants, sensor_readings, alerts, push_tokens`.
- Dropped: `pairing_codes`, `anomaly_events`.
- Cut from MVP: battery/power management, `device_secrets` rotation, multi-device per user (one device per user), image upload.
- `user_plant_image_path` column stays, nullable, unused.
- Server stamps `sensor_readings.ts = now()`. ESP32 sends no timestamp (no NTP).

Dataset (reference ideal ranges):
- Base: MiFloraDB, https://github.com/khronimo/MiFloraDB, file `PlantDB_5335_U0.csv`, 5335 species. License GPL-3.0, attribute in repo + report.
- Import once into `plant_species` via `db/import_miflora.ts`.
- LLM enrichment: fills only missing cells during seed (one-time), and runtime fallback when a user selects a species absent from the table. OpenAI key in `.env`. If key absent, skip enrichment gracefully and log.
- Actual CSV headers (verified): `pid,display_pid,alias,image,floral_language,origin,production,category,blooming,color,size,soil,sunlight,watering,fertilization,pruning,max_light_mmol,min_light_mmol,max_light_lux,min_light_lux,max_temp,min_temp,max_env_humid,min_env_humid,max_soil_moist,min_soil_moist,max_soil_ec,min_soil_ec`. CSV lives at `db/PlantDB_5335_U0.csv`.

Frontend:
- Expo + React Native + TypeScript. EAS Build for both iOS and Android.
- Nav: React Navigation (bottom tabs + stack).
- Charts: react-native-gifted-charts. Icons: lucide-react-native. Push: expo-notifications. Auth/data: @supabase/supabase-js + REST to backend.
- No react-native-ble-plx.
- Refresh: pull-to-refresh + 60s poll while a data screen is focused. No background fetch.
- Onboarding quiz answers stored in `profiles`. Used only to set alert message verbosity (beginner = verbose). No other behavior.

Deploy:
- Backend: Azure Container Apps, region `eastus`. Free `*.azurecontainerapps.io` domain + auto HTTPS. Scale-to-zero allowed (min replicas 0).
- Image registry: Azure Container Registry (ACR).
- CI/CD: GitHub Actions. PR: lint + build + unit test (backend + app). Push to `main`: build image, push ACR, update Container App.
- Supabase and OpenAI are external services, not on Azure.

Firmware TODOs (flag in code + DEPLOYMENT.md, not auto-resolvable):
- BME280 I2C address 0x76 vs 0x77: run I2C scanner, set actual.
- Moisture calibration: measure `DRY_RAW`/`WET_RAW` per sensor.
- HTTPS `client.setInsecure()` used for MVP. Encrypted, no cert validation. Documented risk. Keep in DEPLOYMENT.md TODO.

Testing:
- Unit: alert evaluation logic, ingest DTO validation.
- One manual end-to-end pass on real hardware.
- `scripts/sim_device.ts` posts fake readings to unblock app/backend before hardware.

---

## 3. Tech stack table

| Layer | Choice |
|---|---|
| MCU | Arduino Nano ESP32 |
| Sensors | Capacitive soil moisture (A0), BME280 (I2C temp/humidity/pressure), BH1750 (I2C lux) |
| Firmware | C++ / PlatformIO, native WiFi.h + WiFiClientSecure + HTTPClient |
| Backend | NestJS, TypeScript, Node 20 |
| DB access | @supabase/supabase-js |
| Validation | class-validator, class-transformer |
| Auth | Supabase Auth (JWT verify via JWKS in Nest) |
| Push | expo-server-sdk |
| DB | Supabase managed Postgres |
| Migrations | Supabase CLI |
| App | Expo, React Native, TypeScript, EAS Build |
| Nav | React Navigation (tabs + stack) |
| Charts | react-native-gifted-charts |
| Icons | lucide-react-native |
| Deploy | Azure Container Apps + ACR |
| CI/CD | GitHub Actions |

---

## 4. Repo structure

Repo root = monorepo root (this repository).

```
├─ firmware/
│  ├─ platformio.ini
│  ├─ src/main.cpp
│  ├─ include/secrets.h.example
│  └─ src/i2c_scan.cpp.example        # helper sketch, not compiled by default
├─ backend/
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ app.module.ts
│  │  ├─ common/
│  │  │  ├─ supabase.service.ts       # admin (service role) + jwt verify client
│  │  │  ├─ jwt.guard.ts              # verifies Supabase JWT via JWKS
│  │  │  ├─ constants.ts              # ALERT_COOLDOWN_SECONDS, INTERVAL notes
│  │  ├─ auth/                        # /push/register, profile bootstrap
│  │  ├─ profiles/
│  │  ├─ devices/                     # claim, list, delete
│  │  ├─ plants/                      # CRUD, species search
│  │  ├─ sensors/                     # ingest (device token), latest, history
│  │  ├─ alerts/                      # list, evaluate(), push
│  │  └─ enrichment/                  # OpenAI gap-fill + runtime fallback
│  ├─ test/                          # unit tests
│  ├─ Dockerfile
│  ├─ .env.example
│  └─ package.json
├─ app/
│  └─ src/{screens,components,navigation,api,hooks,constants,types}
│  ├─ app.json / eas.json
│  └─ .env.example
├─ db/
│  ├─ PlantDB_5335_U0.csv
│  ├─ supabase/migrations/*.sql
│  ├─ import_miflora.ts
│  └─ seed_notes.md
├─ deploy/
│  └─ azure/ (deploy notes, referenced by DEPLOYMENT.md)
├─ scripts/sim_device.ts
├─ .github/workflows/ci.yml
├─ .github/workflows/deploy.yml
├─ DEPLOYMENT.md
└─ README.md
```

---

## 5. Database schema

Supabase `auth.users` is the user identity. Do not recreate it. App tables reference `auth.users(id)`.

Tables and key columns:

- `profiles`: `user_id uuid pk fk auth.users`, `display_name text`, `experience_level text`, `goals text[]`, `plant_types text[]`, `created_at timestamptz default now()`
- `devices`: `id uuid pk`, `owner_user_id uuid fk auth.users null`, `name text`, `firmware_version text`, `status text default 'offline'`, `last_seen_at timestamptz`, `claim_code text unique`, `created_at timestamptz default now()`
- `device_secrets`: `device_id uuid pk fk devices`, `secret_hash text not null`, `created_at timestamptz default now()`
- `plant_species`: `id uuid pk`, `common_name text`, `scientific_name text`, `aliases text[]`, `care_level text`, `ideal_moisture_min numeric`, `ideal_moisture_max numeric`, `ideal_lux_min numeric`, `ideal_lux_max numeric`, `ideal_temp_min numeric`, `ideal_temp_max numeric`, `ideal_humidity_min numeric`, `ideal_humidity_max numeric`, `source text`, `created_at timestamptz default now()`
- `user_plants`: `id uuid pk`, `owner_user_id uuid fk auth.users`, `device_id uuid fk devices null`, `plant_species_id uuid fk plant_species null`, `nickname text`, `user_plant_image_path text null`, `notes text`, `created_at timestamptz default now()`
- `sensor_readings`: `id bigint pk generated always as identity`, `device_id uuid fk devices`, `ts timestamptz default now()`, `moisture numeric`, `temp_c numeric`, `humidity numeric`, `lux numeric`, `battery_pct numeric null`
- `alerts`: `id uuid pk`, `user_id uuid fk auth.users`, `device_id uuid fk devices`, `user_plant_id uuid fk user_plants null`, `ts timestamptz default now()`, `type text`, `severity text`, `message text`, `status text default 'active'`, `cooldown_key text`
- `push_tokens`: `id uuid pk`, `user_id uuid fk auth.users`, `expo_token text`, `platform text`, `created_at timestamptz default now()`, `last_seen_at timestamptz`

Indexes:
- `sensor_readings (device_id, ts desc)`
- `plant_species (common_name)`, `plant_species (scientific_name)`
- `alerts (user_id, ts desc)`
- `devices (claim_code)`

RLS:
- Enable on `profiles, devices, user_plants, sensor_readings, alerts, push_tokens`.
- Policy: row visible/mutable when `owner_user_id = auth.uid()` (or `user_id = auth.uid()`).
- `plant_species`: readable by all authenticated users, writable only by service role.
- Nest still enforces ownership in every query (service role bypasses RLS).

Claim flow:
1. Human pre-inserts each device into `devices` (unclaimed) + `device_secrets` (sha256 of a generated token). Prints `claim_code`.
2. App: `POST /devices/claim {claim_code}` sets `owner_user_id` if unclaimed.
3. One device per user for MVP: reject claim if user already owns a device.

---

## 6. Dataset import + enrichment

`db/import_miflora.ts`:
1. Read `db/PlantDB_5335_U0.csv` (headers listed in Section 2). Log detected headers.
2. Map to `plant_species`:
   - `min/max_soil_moist` → `ideal_moisture_min/max`
   - `min/max_temp` → `ideal_temp_min/max`
   - `min/max_light_lux` → `ideal_lux_min/max`
   - `min/max_env_humid` → `ideal_humidity_min/max`
   - `pid` → `scientific_name`, `display_pid` → `common_name`
   - `alias` → `aliases`
   - ignore soil EC/fertility, pH, image, care text columns
   - `source = 'MiFloraDB'`
3. Upsert into Supabase.
4. Enrichment pass (only if `OPENAI_API_KEY` set): for rows missing any ideal_* cell, call OpenAI to fill, write back. Random-sample log ~20 filled rows for manual verification. If no key, skip and log count of incomplete rows.

Runtime fallback (`enrichment` module):
- When user searches a species not in `plant_species`, backend calls OpenAI web-search to generate one row, inserts it (`source='llm'`), returns to user. Cache persists for all users.
- If OpenAI fails or no key: return "no data found", let user proceed with manual/default ranges.

---

## 7. Firmware spec

Pins confirmed (PDD Fig 4): moisture AOUT→A0, BME280+BH1750 on I2C (D11 SDA, D12 SCL), 3.3V/GND to rails.

`firmware/include/secrets.h.example`:
```cpp
#define WIFI_SSID    "REPLACE"
#define WIFI_PASS    "REPLACE"
#define API_URL      "https://REPLACE.azurecontainerapps.io"
#define DEVICE_ID    "REPLACE_UUID"
#define DEVICE_TOKEN "REPLACE_SECRET"
```

`firmware/src/main.cpp` reads BME280 (temp/humidity), BH1750 (lux), analog moisture on A0, maps raw→% with `DRY_RAW`/`WET_RAW` (TODO calibrate), clamps 0-100, POSTs JSON `{device_id, moisture, temp_c, humidity, lux}` to `API_URL /sensors/readings` with header `x-device-token: DEVICE_TOKEN` every 15 min. `WiFiClientSecure` + `client.setInsecure()` (MVP risk, documented). BME I2C address 0x76 default, TODO verify with scanner.

`firmware/platformio.ini`: platform espressif32, board arduino_nano_esp32, framework arduino, monitor 115200, lib_deps: Adafruit BME280 Library, Adafruit Unified Sensor, claws/BH1750.

I2C scanner helper (`i2c_scan.cpp.example`): standard Wire address sweep printing found addresses. Human runs once to confirm BME280 address.

---

## 8. Backend spec

### 8.1 Auth
- `common/jwt.guard.ts`: verify incoming `Authorization: Bearer <supabase_jwt>` against Supabase JWKS. Attach `user.sub`.
- `common/supabase.service.ts`: expose `admin` client (service role) for queries.

### 8.2 Device ingest (token auth, not JWT)

DTO:
```ts
import { IsUUID, IsNumber, Min, Max, IsOptional } from 'class-validator';
export class CreateReadingDto {
  @IsUUID() device_id: string;
  @IsNumber() @Min(0) @Max(100) moisture: number;
  @IsNumber() @Min(-40) @Max(85) temp_c: number;
  @IsNumber() @Min(0) @Max(100) humidity: number;
  @IsNumber() @Min(0) @Max(200000) lux: number;
  @IsOptional() @IsNumber() battery_pct?: number;
}
```

Guard: `DeviceTokenGuard` — reads `x-device-token` header + `device_id` from body, sha256 the token, match against `device_secrets.secret_hash` for that device_id, else 401.

Controller:
```ts
@Post('readings')
@UseGuards(DeviceTokenGuard)
async ingest(@Body() dto: CreateReadingDto) {
  const reading = await this.svc.insert(dto);      // INSERT + update devices.last_seen_at (status='online')
  await this.alerts.evaluate(dto.device_id, reading);
  return { ok: true };
}
```

### 8.3 Alert evaluation

`common/constants.ts`:
```ts
export const ALERT_COOLDOWN_SECONDS = 7200; // 2h, universal
```

Logic (per metric: moisture, temp, lux, humidity):
- Find plant for device (join user_plants + plant_species). No plant → skip.
- Skip metric if value or min/max null.
- cooldown/dedupe key = `${user_plant_id}:${metric}`.
- In range: if there was an active alert for that key, resolve it and send one "recovered" info alert.
- Out of range: skip if an alert with that cooldown_key exists within ALERT_COOLDOWN_SECONDS. Else insert alert with `type = metric_low|metric_high`, `severity = 'high'` if moisture low else `'medium'`, message built with verbosity from profile.experience_level (beginner = verbose), then Expo push.

Push: query `push_tokens` by user_id, send via expo-server-sdk. Handle receipts/errors, prune invalid tokens.

### 8.4 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /sensors/readings | device token | ingest |
| GET | /sensors/:deviceId | JWT | latest reading (ownership checked) |
| GET | /sensors/:deviceId/history?from&to | JWT | chart range |
| GET | /plants | JWT | list plants + latest reading |
| POST | /plants | JWT | add plant |
| GET | /plants/:id | JWT | detail |
| PUT | /plants/:id | JWT | edit |
| DELETE | /plants/:id | JWT | remove |
| GET | /species?q= | JWT | search; triggers LLM fallback if none |
| POST | /devices/claim | JWT | claim by claim_code (reject if user already owns device) |
| GET | /devices | JWT | list owned |
| DELETE | /devices/:id | JWT | unlink |
| GET | /alerts | JWT | history |
| POST | /push/register | JWT | store expo token |

Plus: profile bootstrap/read/update for onboarding (`GET/PUT /profiles/me` style, JWT).

Auth (signup/login/Google/reset) handled by Supabase client in the app, not by backend endpoints.

### 8.5 backend/.env.example
```
PORT=3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_JWKS_URL=https://<project>.supabase.co/auth/v1/.well-known/jwks.json
EXPO_ACCESS_TOKEN=
OPENAI_API_KEY=
```

### 8.6 Dockerfile
Multi-stage node:20-alpine: npm ci + build, then copy node_modules + dist, expose 3000, `node dist/main.js`.

---

## 9. Frontend spec

Expo blank-typescript template. Deps: @react-navigation/native + bottom-tabs + native-stack, react-native-gifted-charts, react-native-linear-gradient, lucide-react-native, react-native-svg, expo-notifications, @supabase/supabase-js, react-native-screens, react-native-safe-area-context. No BLE package.

Screens (PDD 5.4.3):
- Auth: signup, login, Google sign-in, forgot-password (all via Supabase Auth).
- Onboarding quiz (3 steps): experience, goals, plant types. Save to `profiles`. Returning users skip.
- Home ("My Plants"): card list, health indicator, latest 4 metrics, last-updated.
- Plant Data: per-metric gauges with in/out-range color, history charts via gifted-charts over selectable windows.
- Alerts: severity-coded history list.
- Settings: claim device (enter claim_code), notification prefs, edit profile, logout.

Behavior:
- State: React hooks + Context. No Redux.
- REST to backend over HTTPS with Supabase JWT in Authorization header.
- Refresh: pull-to-refresh + 60s poll while a data screen focused. No background fetch.
- Register Expo push token after login → `POST /push/register`.
- Image upload deferred: no UI.
- Demo mode: env flag points app at local backend, auto-login demo user, skip onboarding.

Design tokens (PDD 5.4.4): green primary, semantic status colors, spacing 4/8/16/24/32, type 12-32, 44x44 touch targets, WCAG AA contrast.

Build: EAS Build, both platforms. `eas.json` with development + preview profiles.

---

## 10. CI/CD (GitHub Actions)

`.github/workflows/ci.yml` (PR + push):
- backend job: `npm ci`, `npm run lint`, `npm run build`, `npm test`.
- app job: `npm ci`, `npm run lint`, `npx tsc --noEmit`.

`.github/workflows/deploy.yml` (push to main):
1. Build backend Docker image. 2. Login to ACR, push image tag. 3. `az containerapp update` to new image.
- Azure auth: OIDC federated credential or service principal secret in repo secrets. Manual setup in DEPLOYMENT.md.
- Required repo secrets: `AZURE_CREDENTIALS` (or OIDC client/tenant/subscription), `ACR_NAME`, `CONTAINERAPP_NAME`, `RESOURCE_GROUP`.

---

## 11. Simulation mode

`scripts/sim_device.ts`: POST fake readings every 10s to `/sensors/readings` using env `API_URL`, `DEVICE_ID`, `DEVICE_TOKEN`. Randomize values across in/out-range to exercise alerts.

---

## 12. Build order

1. Repo scaffold, monorepo, `.env.example`, README.
2. DB: Supabase migrations for all tables + RLS. `db/import_miflora.ts` + enrichment.
3. Backend: Supabase service, JWT guard, profiles/auth bootstrap, push register.
4. Backend: devices (claim), plants CRUD, species search + LLM fallback.
5. Backend: sensors ingest (device token) + queries.
6. Backend: alerts evaluate + push + endpoints. Unit tests (alert eval, DTO validation).
7. `scripts/sim_device.ts`. Verify end-to-end with simulation.
8. Frontend: navigation shell, Supabase auth, onboarding, push registration.
9. Frontend: Home, Plant Data (gauges + charts), Alerts, Settings (claim).
10. Firmware: main.cpp + platformio, mark calibration/address TODOs.
11. CI workflows.
12. Deploy workflow + `DEPLOYMENT.md`.
13. Manual hardware e2e.

---

## 13. DEPLOYMENT.md contents (mandatory)

Ordered manual steps: Azure (CLI, resource group eastus, ACR, Container Apps env + app, ingress 3000, min replicas 0, env vars, note URL, GitHub secrets), Supabase (keys/JWKS from dashboard, CLI link + migrations, run import, enable Google provider, verify reset email), OpenAI key (optional), device provisioning (UUID + secret + sha256 insert, claim_code), firmware (PlatformIO, secrets.h, I2C scan, moisture calibration, flash, verify POST 200; TLS setInsecure risk TODO), app (Expo account, eas.json, EAS build both platforms, backend URL + Supabase keys in config), verification checklist (15-min posts, live+history in app, alert+push within one interval, 2h cooldown, cross-user isolation).

---

## 14. Acceptance criteria (MVP done)

- Real ESP32 ingest working over HTTPS to Azure.
- App: auth (incl. Google + reset), onboarding, Home, Plant Data, Alerts, Settings claim.
- Alerts + push on threshold breach, 2h cooldown, recovery alert.
- Ownership enforced.
- `plant_species` seeded from MiFloraDB; LLM fallback for unknown species.
- CI green; deploy workflow ships to Container Apps.
- `DEPLOYMENT.md` complete.

---

## 15. Explicitly out of scope (do not build)

- BLE, SoftAP, WiFi provisioning UI.
- anomaly_events, pairing_codes.
- Battery/power management, deep sleep.
- device_secrets rotation.
- Multiple devices per user.
- Plant image upload.
- Background fetch.
- Automated watering, chatbot, predictive ML (SD2).

---

## 17. Testing harness

Artifacts:
- `scripts/sim_device.ts`: POST fake readings every 10s. Randomize in/out range.
- `scripts/seed_demo.ts`: create demo user, one claimed device, one plant (known species), backfill ~48h `sensor_readings` (mixed range). One command populates app.
- `scripts/trigger_alert.ts`: POST one out-of-range reading. Verify alert + push path on demand.
- `docker-compose.dev.yml`: backend + Supabase target. One-command boot.
- `test/api.http`: every endpoint pre-filled. Manual API test without app.
- App demo mode: env flag → local backend, auto-login demo user, skip onboarding.

Backend package.json scripts: `test` (unit), `test:e2e` (ingest → alert → push, Expo mocked), `seed:demo`, `sim`.

One-command test flow (README + DEPLOYMENT.md):
```
docker compose -f docker-compose.dev.yml up
npm run seed:demo
npm run sim
# open app in demo mode -> populated dashboards
npm run trigger:alert
```

Acceptance additions: fresh clone reaches populated app via test flow, no hardware; `test:e2e` green in CI.
