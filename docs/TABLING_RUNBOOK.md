# Running the tabling build

The activity uses the real cloud backend and real sensor measurements. Three independent settings must agree: the Expo tabling bundle, the tabling firmware build, and server-controlled device eligibility. Demo login is separate and is disabled by the tabling launcher.

## Choose and prepare the event target

Record the staff account, owned plant/species, device, backend/Supabase target, and phone/tablet platform. Use a dedicated event device/account; keep simulator traffic on a separate test device. Verify the species has usable light and moisture target ranges. No deployment target, credentials, probe calibration, or physical rehearsal results are supplied by this implementation.

1. Apply `db/supabase/migrations/20260924000001_tabling.sql` to the chosen database after the existing initial migration. Review the target before running `supabase db push` from `db/`.
2. Deploy the compatible backend. `.github/workflows/deploy.yml` builds/pushes an image on relevant `main` changes or manual invocation; rollout is manual. The `stem-day` branch alone does not deploy or isolate data.
3. Claim the event device using the staff account and finish the existing profile/onboarding setup. Assign the intended species to the plant.
4. Enable only the selected device through a trusted database administrator, substituting its recorded UUID:

   ```sql
   update public.devices set tabling_enabled = true where id = '<event-device-uuid>';
   ```

   This suppresses ordinary alert/push evaluation for that device's scheduled and commanded readings. Other devices retain ordinary alerts. The app flag cannot grant device eligibility.

## Build and flash the board

Keep credentials in the existing private `firmware/include/secrets.h`. Confirm the selected API target and actual board/probe before flashing. From `firmware/`:

```sh
pio run -e arduino_nano_esp32_tabling
pio run -e arduino_nano_esp32_tabling -t upload
pio device monitor
```

The tabling environment polls for commands while preserving ordinary sampling and scheduled uploads. See `firmware/ARDUINO_IDE.md` for the equivalent Arduino IDE build. All four sensors must function for a capture, although only light and soil sample moisture determine the activity result. Calibrate the actual probe with the prepared samples; do not assume a particular probe's immersion limits or a universal water dose/settling time.

## Run or install the app

Populate `app/.env` with the existing public backend/Supabase connection settings. Do not put device or service-role secrets in Expo variables. From `app/`:

```sh
npm ci
npm run tabling
# Forward Expo options when needed:
npm run tabling -- --tunnel
```

For an Android standalone event build, configure the real EAS project ID and signing credentials, populate the EAS `preview` environment with the public connection settings, then run:

```sh
eas build --profile tabling --platform android
```

The `tabling` profile extends `preview` and explicitly selects tabling UI with demo login off. Build flags are embedded in the bundle; restart with a cleared cache when switching. `npm start` and `npm run demo` explicitly turn tabling off. The current app identity is shared, so normal and tabling installs replace one another. Side-by-side installation is outside this release.

For a physical iPad, resolve tablet support (`app.json` currently disables it), Apple credentials and physical-device provisioning before the event. A simulator build cannot be installed on an iPad. This work does not publish OTA updates; any later update must explicitly set the correct flags and use an isolated event channel. See the official [EAS profile documentation](https://docs.expo.dev/build/eas-json/) and [Expo variable documentation](https://docs.expo.dev/guides/environment-variables/).

## Facilitate each group

1. Warm the backend, sign in as staff, select the event plant/device, and check readiness. Recent command contact confirms connectivity, not successful sensor acquisition.
2. Place a comparable prepared dry soil sample beside the plant, insert the probe to the marked depth, and reset the adjustable lamp. Use **Verify setup**; both challenge conditions must be valid and outside their target ranges. This is a preparation reading, separate from Before.
3. Let the group use **Check plant now**. Its successful result becomes the fixed Before snapshot.
4. Invite a prediction, then adjust the physical setup. Add the small water increments and use the waiting interval established by rehearsal.
5. Use **Check again** as needed. Both challenge conditions must be in range in the same successful recheck. Current may show a newer scheduled reading than the comparison; each keeps its own time.
6. Use the facilitator **Next group** control. It clears local activity and cancels obsolete work without deleting historical measurements. Replace the sample, reset the lamp, and verify again.

Reset also records cancellation by the creation idempotency key. This handles a lost POST response: even if that old POST reaches the backend after reset, its cancelled record prevents obsolete work from being issued. Setup inspection itself does not create a measurement.

## Required physical rehearsal

Software checks cannot establish probe behavior or venue connectivity. Before opening the table, record the actual firmware, device, screen, network, dry/wet calibration, sample fill/packing/depth, water increment, settling interval, lamp positions, and capture latency. Run several complete group cycles. Test disconnected sensors, Wi-Fi loss, backend delay/expiry, reset during measurement, app background/return, app restart, and plant changes. Confirm no old response becomes the next group's comparison and that temperature/humidity being out of range does not block valid light/moisture success.

The initial 5–10 second capture target is an engineering target, not a measured guarantee. Consider maintaining one backend replica during the event if cold starts interfere, then restore the intended scaling afterward. Keep enough prepared samples for all groups plus extra attempts; retire wet samples for later drying.

## After the event

Disable eligibility through trusted administration:

```sql
update public.devices set tabling_enabled = false where id = '<event-device-uuid>';
```

Flash the ordinary `arduino_nano_esp32` environment and run/install the ordinary app if the pot returns to everyday use. Historical readings remain stored. Restore any temporary hosting settings.
