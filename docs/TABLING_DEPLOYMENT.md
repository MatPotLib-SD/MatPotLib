# Tabling cloud deployment

Deployed on 2026-10-13 from the `stem-day` backend at commit `ebe93eb02f7ea10a2fabc24684c7f9fb61a44c58`.

| Target | Value |
| --- | --- |
| Supabase project | `MatPotLib-SD2` / `pnlimknbolkpfausfmjh` |
| Azure subscription | Azure for Students |
| Resource group | `matpotlib-rg` |
| Container App | `matpotlib-backend` |
| Revision | `matpotlib-backend--stemday-ebe93eb` |
| Registry build | `matpotlibacr` / `ca1`, succeeded |
| Image tag | `matpotlib-backend:stem-day-ebe93eb02f7ea10a2fabc24684c7f9fb61a44c58` |
| Image digest | `sha256:11e210dbf5cd15dc6c0715fc17c17dbe84f453ec967a7bf894956c10c17332d4` |

The new revision is healthy and receives 100% of traffic. The app, firmware, and cloud backend reference the same backend and Supabase project. [Health endpoint](https://matpotlib-backend.bluefield-2206023f.eastus.azurecontainerapps.io/health).

The image was built directly through Azure Container Registry using an isolated copy of tracked backend source plus `backend/.dockerignore`. No private environment files or local dependencies were uploaded. The GitHub workflow still needs its registry secrets before it can build images.

## Database changes

Applied `20261013173320_tabling.sql` and `20261013173953_tabling_function_search_paths.sql`. The second migration fixes the search paths of the three new helper functions. Capture RLS is enabled, and all ten privileged tabling functions permit execution only through the service role among the application roles checked.

All 790 pre-existing readings retain their original IDs, device IDs, timestamps, and sensor values. Their checksum before and after migration is `237d34e25e03f09dfcb8494d364482be`. Acquisition-time backfill checks passed.

Local filenames match the timestamps recorded by Supabase. The already-applied `20261006170204_backup_plant_species_and_common_name_work.sql` was exported from remote history to complete the local migration sequence. Automatic approval review rejected a proposed migration-history rewrite because it could desynchronize deployments; alignment was completed through local files instead.

## Verification

- Backend build and lint passed; 14 unit tests and 8 HTTP tests passed.
- App typecheck and lint passed; 7 model tests and 16 mounted-hook tests passed after restoring dependencies from the existing lockfile.
- The iOS tabling bundle exported successfully offline with placeholder settings. This checks bundling, not installation or sensor operation.
- All four migrations passed the disposable PostgreSQL lifecycle/RLS and competing-connection test scripts. These tests did not target the live database.
- Live health returned 200. User capture/read routes and device capture/ingestion routes rejected unauthenticated requests with 401.
- Existing-reading access through the deployed database functions passed.
- The three new security advisories were cleared. Existing platform advisories remain for [`rls_auto_enable` execution grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Existing private backup and device-secret tables use RLS without client policies.

## Remaining event setup

The existing device is `Demo Pot`, UUID `fbd00dc2-9556-4307-b167-1e1526db6f3a`. Its recorded firmware is `sim`, and it last reported on 2026-10-06. The private firmware configuration references this same UUID. Device eligibility remains disabled pending selection of the event device. No ESP32 was detected on USB.

The assigned plant is named `Demo Pothos`, but its selected species is `Peppermint`. Light and moisture ranges are usable; the facilitator must select the species appropriate to the actual event plant.

1. Choose the event device and its staff account, then enable that device through trusted administration.
2. Connect the ESP32 by USB, build and flash `arduino_nano_esp32_tabling`, and verify all four sensors.
3. Run the app from the repository root:

   ```sh
   npm --prefix app run tabling -- --tunnel --go
   ```

4. Complete the calibration and physical group rehearsal in [TABLING_RUNBOOK.md](TABLING_RUNBOOK.md).

For a standalone APK, the EAS project ID is still a placeholder and requires Expo account/project/signing setup. The Expo Go launch above does not require an EAS build. Physical iPad packaging also requires tablet support and Apple provisioning.

Save the local migration and documentation changes in version control before subsequent migration work.
