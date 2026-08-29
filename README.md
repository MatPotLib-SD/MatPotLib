## Run Instructions
note: upon running an inactive backend, the backend takes ~>10 seconds to "wake up"


### Frontend
BUILD: 
*for a demo, just have a memeber who has the frontend running (npx expo start) and demo-er with Expo Go app installed scan the QR code.

One-time setup on your machine (also finally fills that REPLACE_WITH_EAS_PROJECT_ID placeholder):
cd app
npx eas-cli login          # create a free Expo account if you don't have one
npx eas init               # writes the real projectId into app.json
npx eas update:configure   # wires the project for updates
Then publish:
npx eas update --branch preview --message "friend demo"
The command output (and your project page on expo.dev) gives a QR/link. Your friend: installs Expo Go from the App Store/Play Store, opens the link → your app loads, talking to the live Azure backend.

Caveats: the EXPO_PUBLIC_* values from app/.env get baked in at publish time — so decide before publishing whether you want DEMO_MODE=true (friend lands straight on the seeded Demo Pothos with charts, zero friction — probably what you want) or false (they'd sign up themselves and see onboarding, but have no device to claim). Push notifications still don't work in Expo Go, and warn them the very first request may take ~25 s if the Azure container is cold.

then (in /app):

Normal run — real sign-in screen, live Azure backend:
npx expo start

Demo run — auto-signs in as the seeded demo user and skips onboarding:
npm run demo

On managed or campus Wi-Fi (WhiteSky-KnightsCircle, eduroam, most apartment networks) the default
LAN mode fails silently: the access point isolates clients, so your phone cannot reach Metro on your
laptop and Expo Go just spins. Add --tunnel:

npx expo start --tunnel
npm run demo -- --tunnel        # note the -- before flags when using npm run

Then scan the QR code with Expo Go.

Both modes talk to the SAME live Azure backend and Supabase project — there is no separate demo
environment. "npm run demo" only sets EXPO_PUBLIC_DEMO_MODE=true for that one run (shell env
overrides app/.env) so it signs in as the demo user instead of showing the login screen. Seed that
user first with: cd scripts && npm ci && npm run seed:demo

The demo script also passes --clear, because EXPO_PUBLIC_* values are inlined into the bundle at
build time. Going back to a normal run right after a demo run needs the cache cleared once:
npx expo start --clear


### Backend
BUILD:
Already built and deployed on Azure. 

REBUILD:
Pushing to main triggers the build automatically, but the new image doesn't go live until you roll it out:

1. Push → wait for the green check in the Actions tab (~3–5 min).
2. Then run:
az containerapp update -n matpotlib-backend -g matpotlib-rg --image "matpotlibacr.azurecr.io/matpotlib-backend:$(git rev-parse HEAD)"


# MatPotLib — Smart Plant Pot (SD1 MVP)

Full-stack smart plant monitoring system: an ESP32-powered pot posts soil moisture, temperature, humidity, and light readings every 15 minutes to a cloud backend, which compares them against species ideal ranges and pushes alerts to a mobile app.

## Architecture

```
ESP32 (WiFi) --HTTPS POST--> Backend (NestJS on Azure Container Apps)
                                 │ validate device token + payload
                                 │ store reading, evaluate vs species ranges
                                 │ out-of-range -> alert + Expo push (2h cooldown)
                                 ▼
                             Supabase (Postgres + Auth)
                                 ▲
Mobile app (Expo/React Native) --REST (Supabase JWT)--> Backend
```

## Repo layout

| Path | What |
|---|---|
| `firmware/` | PlatformIO project for Arduino Nano ESP32 (BME280, BH1750, capacitive moisture) |
| `backend/` | NestJS API: ingest, plants, devices, species, alerts, push |
| `app/` | Expo React Native app: auth, onboarding, dashboards, charts, alerts, settings |
| `db/` | Supabase migrations, MiFloraDB dataset + import/enrichment script |
| `scripts/` | `sim_device`, `seed_demo`, `trigger_alert` — test without hardware |
| `deploy/azure/` | Azure deploy notes |
| `docs/HANDOFF.md` | Authoritative implementation spec |
| `DEPLOYMENT.md` | Every manual step to deploy from scratch |
| `PROGRESS.md` | Build-order checklist (state lives in git) |

## Quick start (no hardware needed)

```bash
# 1. Backend
cd backend && npm ci
cp .env.example .env   # fill Supabase keys (see DEPLOYMENT.md)
npm run start:dev

# 2. Seed demo data (demo user + device + plant + 48h of readings)
npm run seed:demo

# 3. Simulate the pot
npm run sim

# 4. App
cd ../app && npm ci
cp .env.example .env   # backend URL + Supabase anon key; set demo mode
npx expo start
```

`backend/test/api.http` has every endpoint pre-filled for manual API testing.

## Testing

- `cd backend && npm test` — unit tests (alert evaluation, ingest DTO validation)
- `npm run test:e2e` — ingest → alert → push with Expo mocked
- CI (GitHub Actions) runs lint + build + tests on every PR

## Dataset attribution

Species ideal ranges are seeded from **MiFloraDB** (<https://github.com/khronimo/MiFloraDB>), file `PlantDB_5335_U0.csv`, 5,335 species, licensed **GPL-3.0**. Missing values are optionally filled by LLM enrichment (`source` column distinguishes `MiFloraDB` vs `llm`).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete ordered manual-step guide (Azure Container Apps, Supabase, device provisioning, firmware flashing, EAS builds).
