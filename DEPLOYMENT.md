# DEPLOYMENT.md — every manual step, in order

Everything below is a step a human must perform; nothing here is automated. Placeholders you choose yourself are written `<like-this>`. Never commit real keys — they belong in `.env` files (git-ignored) or Azure/GitHub secrets.

---

## 1. Supabase (database + auth)

1. Create a project at <https://supabase.com/dashboard> (free tier is fine). Pick a strong DB password and save it.
2. From **Project Settings → API**, record:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → app's `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → backend's `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never in the app)
   - JWKS URL is `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` → `SUPABASE_JWT_JWKS_URL`
3. Install the Supabase CLI: `npm i -g supabase` (or scoop/brew).
4. Link and run migrations from the repo root:
   ```bash
   cd db
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push        # applies db/supabase/migrations/*.sql
   ```
5. Seed the species table (5,335 rows from MiFloraDB):
   ```bash
   cd db
   npm ci
   cp .env.example .env    # fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ OPENAI_API_KEY optional)
   npm run import
   ```
   With `OPENAI_API_KEY` set, the import also fills missing ideal-range cells via LLM and logs ~20 sampled rows for manual spot-checking. Without the key it logs the count of incomplete rows and continues.
6. **Google sign-in**: in Google Cloud Console create an OAuth 2.0 Client (type Web), authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase **Authentication → Providers → Google**, paste client ID + secret and enable.
7. **Password reset**: Supabase **Authentication → Email Templates** — confirm the "Reset password" template is enabled (default is fine). No custom email code exists in this repo by design.

## 2. OpenAI (optional)

- Put `OPENAI_API_KEY` in `backend/.env` (runtime species fallback) and `db/.env` (seed enrichment). Both features degrade gracefully without it: search returns "no data found" and the import skips enrichment.

## 3. Azure (backend hosting)

1. Install the Azure CLI, then `az login`.
2. Create resources (region `eastus`):
   ```bash
   az group create -n matpotlib-rg -l eastus
   az acr create -n <acrname> -g matpotlib-rg --sku Basic --admin-enabled false
   az extension add --name containerapp
   az containerapp env create -n matpotlib-env -g matpotlib-rg -l eastus
   ```
3. First image push (later pushes are done by CI):
   ```bash
   az acr login -n <acrname>
   docker build -t <acrname>.azurecr.io/matpotlib-backend:init backend
   docker push <acrname>.azurecr.io/matpotlib-backend:init
   ```
4. Create the Container App — external ingress on port 3000, scale-to-zero:
   ```bash
   az containerapp create -n matpotlib-api -g matpotlib-rg \
     --environment matpotlib-env \
     --image <acrname>.azurecr.io/matpotlib-backend:init \
     --registry-server <acrname>.azurecr.io --registry-identity system \
     --ingress external --target-port 3000 \
     --min-replicas 0 --max-replicas 1 \
     --secrets supabase-service-key=<service_role_key> openai-key=<openai_key> \
     --env-vars PORT=3000 SUPABASE_URL=<url> \
       SUPABASE_JWT_JWKS_URL=<jwks-url> \
       SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-key \
       OPENAI_API_KEY=secretref:openai-key
   ```
   (`EXPO_ACCESS_TOKEN` is optional — only needed if you enable Expo push security.)
5. Note the app URL `https://matpotlib-api.<hash>.eastus.azurecontainerapps.io`. Paste it into:
   - `firmware/include/secrets.h` → `API_URL`
   - `app/.env` → `EXPO_PUBLIC_BACKEND_URL`
6. Sanity check: `curl https://<app-url>/plants` should return **401** (JWT required), not a connection error. Cold starts take a few seconds with min-replicas 0 — expected.

## 4. GitHub repo secrets (CI/CD deploy)

`deploy.yml` pushes a new image and updates the Container App on every push to `main` touching `backend/`.

1. Create a service principal with access to the resource group:
   ```bash
   az ad sp create-for-rbac --name matpotlib-deploy --role contributor \
     --scopes /subscriptions/<sub-id>/resourceGroups/matpotlib-rg --sdk-auth
   ```
   Also grant it ACR push: `az role assignment create --assignee <sp-appId> --role AcrPush --scope $(az acr show -n <acrname> --query id -o tsv)`
2. In GitHub **Settings → Secrets and variables → Actions**, add:
   - `AZURE_CREDENTIALS` — the full JSON output of the command above
   - `ACR_NAME` — `<acrname>`
   - `CONTAINERAPP_NAME` — `matpotlib-api`
   - `RESOURCE_GROUP` — `matpotlib-rg`

   (Alternative: OIDC federated credentials — swap `azure/login` inputs accordingly.)

## 5. Provision each physical device

Per pot, generate an ID + secret and insert both rows (run in Supabase SQL editor — see `db/seed_notes.md` for a copy-pasteable snippet):

```sql
-- pick/record: device uuid, a random secret string, a short human-friendly claim code
insert into devices (id, name, claim_code)
values ('<uuid>', 'Pot #1', '<CLAIM-CODE>');
insert into device_secrets (device_id, secret_hash)
values ('<uuid>', encode(digest('<secret-string>', 'sha256'), 'hex'));
```

Record `<uuid>`, `<secret-string>`, `<CLAIM-CODE>`. The UUID + secret go into firmware `secrets.h`; the claim code is what the user types in the app's Settings → Claim Device. One device per user (enforced by the backend).

## 6. Firmware

1. Install VS Code + PlatformIO extension (or `pip install platformio`).
2. `cd firmware`, copy `include/secrets.h.example` → `include/secrets.h`, fill `WIFI_SSID/WIFI_PASS` (2.4 GHz network), `API_URL` (from step 3.5), `DEVICE_ID`/`DEVICE_TOKEN` (from step 5).
3. **I2C address check**: temporarily build/flash `src/i2c_scan.cpp.example` (instructions in that file's header). BME280 shows as 0x76 or 0x77 — set `BME_ADDR` in `main.cpp` accordingly.
4. **Moisture calibration**: with the sketch flashed, read the raw ADC value with the probe dry in air → set `DRY_RAW`; submerge probe (up to the line) in water → set `WET_RAW`.
5. `pio run -t upload`, then `pio device monitor`. Expect `POST 201` (or 200) every 15 min and a new row in `sensor_readings` (Supabase Table Editor).
6. **TODO / RISK (accepted for MVP)**: firmware uses `client.setInsecure()` — TLS encrypted but **no certificate validation**, so it's spoofable by a man-in-the-middle. Acceptable for the demo on a trusted network. Before any real deployment, embed the ISRG/DigiCert root CA and use `client.setCACert(...)`.

## 7. Mobile app

1. Create an Expo account; `npm i -g eas-cli`; `eas login`.
2. `cd app && npm ci`, copy `.env.example` → `.env`: set `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. `eas build:configure` (links the project), then:
   - Android: `eas build -p android --profile preview` → installable APK, sideload onto any Android device.
   - iOS: `eas build -p ios --profile preview` → requires a paid Apple Developer account for device installs.
4. Push notifications require a physical device (not simulators) and, for Android, the FCM setup EAS walks you through on first build.
5. For development you can instead run `npx expo start` and use Expo Go / a dev client.

## 8. No-hardware test flow (works before any of steps 5-6)

```bash
docker compose -f docker-compose.dev.yml up --build   # backend on :3000 (needs backend/.env)
cd scripts && npm ci && cp .env.example .env          # fill Supabase URL + service key
npm run seed:demo    # demo user + claimed device + plant + 48h readings; prints DEVICE_ID/TOKEN
npm run sim          # fake pot posting every 10s
npm run trigger:alert
```
Open the app with `EXPO_PUBLIC_DEMO_MODE=true` → auto-login as the demo user, populated dashboards. `backend/test/api.http` covers every endpoint for manual API testing.

## 9. Verification checklist

- [ ] ESP32 posts every 15 min; rows appear in `sensor_readings`.
- [ ] App shows live values + history charts per plant.
- [ ] An out-of-range reading yields an alert row + push notification within one interval.
- [ ] A second out-of-range reading within 2h does NOT create a duplicate alert (cooldown).
- [ ] A return to range creates one "recovered" info alert.
- [ ] User A cannot read User B's plants/readings/alerts (try a second account).
- [ ] CI green on PR; push to `main` deploys the backend automatically.
