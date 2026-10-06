# Tabling implementation verification

This record separates repeatable software checks from the physical event rehearsal. Work is on `stem-day`. No live database migration, cloud rollout, firmware flash, credential change, or physical sensor rehearsal is implied by a passing software check.

## Review loop record

A loop means an implementation/fix pass followed by skeptical review and the relevant verification, not each individual test invocation. Sol agents implement separate app, backend/database, and firmware/simulator areas. Findings return to the orchestrator before fixes. Cross-area reviews cover code, the full group workflow, and UI/UX.

1. Initial implementation and integration review. Added three mode settings, durable capture requests, acquisition metadata, the event workflow, and firmware command handling. Tests/review found stale setup verification after a failed recheck, target edits reclassifying old results, misleading previous-success display, incomplete HTTP route coverage, missing required command age, alert-policy and ownership races, and indeterminate creation during reset. The orchestrator also corrected database lock-time expiry, legacy direct-insert acquisition fallback, and user-deletion compatibility during this pass.
2. Remediation pass. Fixed the above findings, added durable cancellation by creation key, strengthened actual hook/HTTP/RLS/concurrent database tests, and repeated code/workflow/UI reviews. Both firmware modes and the simulator protocol test passed. The next review found that cancellation failure after losing ownership of a previous device could block setup on a different owned device; a mounted regression test reproduced it.
3. Final integration pass. Fixed departed-device ownership cleanup while retaining errors for the currently selected device and network failures. Cross-layer review then found that Nest's default poll status (201) disagreed with firmware's expected status (200), and that long scheduled-upload timeouts could starve event polling. Aligned the HTTP status contract, bounded event-only scheduled upload attempts/timeouts, rebuilt both modes, and repeated the targeted reviews/checks. The final targeted reviewer reported no remaining blocker.

Final software results: backend lint/build, **14 unit and 8 HTTP e2e tests**; app lint/typecheck, **7 model and 16 mounted-hook tests**; isolated PostgreSQL sequential/RLS and real competing-connection scripts; simulator typecheck and local protocol smoke test; ordinary and tabling firmware builds all passed. Both Expo web modes exported with placeholder public settings, and their embedded mode values were verified false/true after clearing the cache. This does not validate native installation or actual-screen appearance. Reviews cannot replace the physical gates below.

## Repeatable checks

Use Node 24 for the repository checks (the app tests use Node's TypeScript stripping). Commands are run in the named directory.

| Area | Commands / evidence | Scope |
| --- | --- | --- |
| Backend | `npm run lint`, `npm run build`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` in `backend/` | DTOs, HTTP guards/lifecycle, scheduled ingestion, notification behavior, compilation |
| App | `npm run lint`, `npm run typecheck`, `npm test` in `app/` | Condition/precision models and the mounted production capture hook with replaced I/O/timers |
| Simulator | `npx tsc --noEmit`, `npm run test:sim:tabling` in `scripts/` | Ordinary/command-aware simulator compile; local fake server exercises failed uploads, redelivery, immutable values, increasing sample age and scheduled/capture separation |
| PostgreSQL | `psql -X -v ON_ERROR_STOP=1 -d <empty-disposable-db> -f db/test/tabling.sql` | Actual migration, constraints, lifecycle, ownership, legacy compatibility and permissions; rolls back |
| PostgreSQL races | Same command with `db/test/tabling-concurrency.sql` in a separate fresh disposable DB | Real competing database connections; script commits fixtures and must never target an existing app database |
| Firmware | `pio run -e arduino_nano_esp32 -e arduino_nano_esp32_tabling` in `firmware/` | Ordinary and event compile; local verification uses a temporary source copy and placeholder secrets |
| Expo bundle | Offline `expo export --clear --platform web` with explicit tabling/demo flags, `.env` loading disabled and placeholder public connection settings | Clear Metro's cache between modes; full app bundle resolves, but this is not a native installation or visual device test |

The PostgreSQL race script accepts an optional `dblink_connection` psql variable for password-protected disposable services. CI creates separate test databases, runs the SQL suites, and builds both firmware environments with placeholder credentials. No test traffic is sent to the physical event device.

The mounted hook tests execute the production hook with React's test renderer and mocked API/timer boundaries. They exercise recovery without measurement, comparison isolation, late responses after reset/device change, reset during POST, repeated taps, background/resume, failed re-verification, target changes, and cancellation of an indeterminate POST. These complement database tests; they do not establish network or sensor latency.

## Remaining event gates

- Apply the migration and deploy the compatible backend to the explicitly chosen target; enable the event device through trusted administration.
- Flash the actual board, calibrate the actual probe/sample setup, and verify all four sensors. Neither simulator values nor compile success prove sensor correctness.
- Provision/run the real event phone/tablet. EAS project identity and physical iOS/tablet setup remain owner-specific inputs.
- Visually inspect and exercise the event UI at the actual screen size and text scaling. The browser automation provider was unavailable during this run, so local preview compilation does not count as visual verification.
- Rehearse several physical group cycles, failures, reset during measurement, and app background/restart. Record actual capture latency, water increment/settling time, lamp positions and sample replacement procedure.

Use [TABLING_RUNBOOK.md](TABLING_RUNBOOK.md) for the rollout and event procedure.
