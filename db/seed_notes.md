# Database seed notes

How to stand up the MatPotLib database: run migrations, import the species
dataset, and provision devices.

## 1. Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in
  (`supabase login`).
- Node 20 LTS.
- A Supabase project (note the project ref from the dashboard URL).

## 2. Run migrations (Supabase CLI)

From the `db/` directory (it contains `supabase/migrations/`):

```bash
cd db
supabase link --project-ref <your-project-ref>
supabase db push
```

`supabase db push` applies every file in `supabase/migrations/` in filename
order. Current migrations:

- `20260704000001_init.sql` — all tables (`profiles`, `devices`,
  `device_secrets`, `plant_species`, `user_plants`, `sensor_readings`,
  `alerts`, `push_tokens`), indexes, and RLS policies.

Verify in the dashboard (Table Editor) that the eight tables exist and RLS
shows as enabled on each.

## 3. Import the MiFloraDB dataset

```bash
cd db
npm install
cp .env.example .env    # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run import
```

What the import does:

1. Parses `PlantDB_5335_U0.csv` (5,335 species) and logs the detected headers.
2. Maps CSV columns to `plant_species`:
   `pid` → `scientific_name`, `display_pid` → `common_name`,
   `alias` → `aliases[]`, `min/max_soil_moist` → `ideal_moisture_min/max`,
   `min/max_light_lux` → `ideal_lux_min/max`, `min/max_temp` →
   `ideal_temp_min/max`, `min/max_env_humid` → `ideal_humidity_min/max`.
   Soil EC, image URLs, and care-text columns are ignored. `source` is set to
   `'MiFloraDB'`. Empty, non-numeric, and zero cells become `NULL` (MiFloraDB
   uses `0` as a missing-value marker).
3. Upserts in batches of 500 using the service-role key, conflict target
   `scientific_name` (unique index created in the migration). The import is
   idempotent — safe to re-run.

### Enrichment pass (optional, needs `OPENAI_API_KEY`)

If `OPENAI_API_KEY` is set in `.env`, the script then queries the DB for rows
missing **any** `ideal_*` value and asks OpenAI (chat completions, JSON output,
temperature 0) to fill **only the missing cells**. Values outside sanity
bounds (e.g. temp outside −40…60 °C) are discarded. Per-row API failures are
logged and skipped — the run never aborts. At the end it prints a random
sample of ~20 filled rows; **manually spot-check these** against a care guide
before trusting the enrichment.

If no key is set, the enrichment pass is skipped and the script logs the count
of incomplete rows so you can re-run later with a key.

## 4. Manual device provisioning

There is no provisioning UI in the MVP. An admin pre-inserts each physical
device and its secret, then hands the `claim_code` to the user and flashes the
plaintext token into the firmware (`DEVICE_TOKEN` in `secrets.h`).

Generate a token locally (keep the plaintext for the firmware; only its
sha-256 hex goes into the DB):

```bash
# any of these produce a good 32-byte random token
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then run this in the Supabase SQL editor (pgcrypto is enabled by the
migration). Replace `MY-PLAINTEXT-TOKEN` and `POT-0001`:

```sql
WITH new_device AS (
  INSERT INTO devices (name, claim_code)
  VALUES ('MatPot #1', 'POT-0001')          -- claim_code: print on the pot
  RETURNING id
)
INSERT INTO device_secrets (device_id, secret_hash)
SELECT id, encode(digest('MY-PLAINTEXT-TOKEN', 'sha256'), 'hex')
FROM new_device
RETURNING device_id;
```

The `RETURNING device_id` value is the `DEVICE_ID` for `firmware/include/secrets.h`;
`MY-PLAINTEXT-TOKEN` is the `DEVICE_TOKEN`. The backend authenticates ingest by
sha-256-hashing the `x-device-token` header and comparing against
`device_secrets.secret_hash`.

The user claims the device in the app via `POST /devices/claim` with
`{"claim_code": "POT-0001"}` (one device per user; claim is rejected if the
user already owns one).

## 5. Attribution (required)

The `plant_species` seed data is derived from **MiFloraDB**
(<https://github.com/khronimo/MiFloraDB>, file `PlantDB_5335_U0.csv`,
5,335 species), licensed under **GPL-3.0**. This attribution must also appear
in the project report. Rows added or completed by the LLM enrichment pass are
marked by `source = 'MiFloraDB'` with filled cells (seed-time enrichment) or
`source = 'llm'` (runtime fallback rows created by the backend).
