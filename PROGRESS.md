# Progress

## Build order (Section 12)
- [x] 1. Repo scaffold, .env.example, README
- [x] 2. DB migrations + RLS + import_miflora + enrichment
- [x] 3. Backend: supabase service, JWT guard, profiles/auth bootstrap, push register
- [x] 4. Backend: devices claim, plants CRUD, species search + LLM fallback
- [x] 5. Backend: sensors ingest + queries
- [x] 6. Backend: alerts evaluate + push + endpoints + unit tests
- [ ] 7. sim_device + end-to-end sim verify — script done; live verify blocked on a real Supabase project (DEPLOYMENT.md §1) — mocked ingest→alert→push covered by test:e2e
- [x] 8. Frontend: nav, auth, onboarding, push registration
- [x] 9. Frontend: Home, Plant Data, Alerts, Settings claim
- [x] 10. Firmware: main.cpp + platformio (TODOs flagged)
- [x] 11. CI workflows
- [x] 12. Deploy workflow + DEPLOYMENT.md
- [x] 13. Testing harness (Section 17): seed_demo, trigger_alert, dev compose, api.http, demo mode
- [ ] 14. Manual hardware e2e

## Notes
- 6b53ece: scaffold + docs/HANDOFF.md (authoritative spec copied into repo); CSV moved to db/. Restored NestJS scaffold from 94169e3 into working tree for backend build.
- 9af90ba: firmware complete (BME280 addr + moisture calibration + setInsecure TODOs flagged in code and DEPLOYMENT.md §6).
- 8e3c93e: ci.yml (backend lint/build/test/e2e + app lint/tsc), deploy.yml (ACR + containerapp update), DEPLOYMENT.md full manual guide, deploy/azure notes.
- 0a9c355: backend/ complete — all 8.4 endpoints + GET/PUT /profiles/me, jose JWKS JWT guard, device-token guard (sha256), alerts per 8.3, Expo push w/ pruning, OpenAI species fallback, Dockerfile, api.http, in-memory-supabase test double. build+lint+14 unit+4 e2e green. Claim race hardened (.is owner null). Harness aliases: npm run seed:demo/sim/trigger:alert from backend/.
- c31834d: app/ complete — Expo SDK 51 (RN 0.74.5), 9 screens, typed api client (all 8.4 endpoints), useAuth w/ demo mode + push registration, usePolling (60s focused), theme tokens. tsc + eslint clean. app.json lacks icon/splash assets and real EAS projectId (fill during EAS setup, DEPLOYMENT.md §7).
- 790ff5c: db/ complete — init migration (RLS: device_secrets no client access, readings via device-ownership subquery, species read-only), import_miflora (csv-parse, batch upsert on scientific_name, OpenAI gap-fill; CSV has 5,534 rows, 0-values treated as null per MiFloraDB convention). Migration not yet applied to a live project (manual step, DEPLOYMENT.md §1).
- 5c4cb2d: scripts/ harness (sim_device, seed_demo idempotent w/ 48h backfill, trigger_alert; tsc clean) + docker-compose.dev.yml. Tasks 7/13 partial — end-to-end sim verify pending live backend + Supabase.
