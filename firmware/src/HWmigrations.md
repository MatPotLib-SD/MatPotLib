# Hardware Migration — deploying the merged firmware

Runbook for flashing `main.cpp` (merged WiFiManager + backend-ingest firmware)
onto an Arduino Nano ESP32 and attaching it to the deployed Azure backend.

Follow top to bottom. Every step has an expected result — if you don't see it,
jump to [Troubleshooting](#troubleshooting) rather than continuing.

Related: [`../../DEPLOYMENT.md`](../../DEPLOYMENT.md) (full stack deploy) ·
[`../../db/seed_notes.md`](../../db/seed_notes.md) (device provisioning SQL) ·
[`../../docs/HANDOFF.md`](../../docs/HANDOFF.md) (spec)

---

## What this firmware does differently

| | Old (`mainold.cpp.example`) | Merged (`main.cpp`) |
|---|---|---|
| WiFi credentials | compiled into `secrets.h` | captive portal, stored in flash |
| Sampling | one `analogRead()` | trimmed median of 11 samples |
| BME280 address | hardcoded `0x76` | auto-detects `0x76` / `0x77` |
| Loop | `delay(15 min)` — deaf | non-blocking, responsive |
| Cold-start handling | 5 s default timeout (fails) | 15 s connect / 30 s read + 1 retry |
| Bad sensor read | posts `nan`, gets 400 | skips post, logs why |
| Local debugging | none | `GET /data`, `GET /status` |

Unchanged: the wire format. Same `POST /sensors/readings`, same
`x-device-token` header, same DTO fields — the backend needs no changes.

---

## 0. Prerequisites

- [ ] PlatformIO CLI installed (`pio --version`) or the VS Code extension
- [ ] USB-C cable that carries **data**, not just power
- [ ] Access to the Supabase SQL editor for the project
- [ ] A 2.4 GHz WiFi network — the ESP32 has no 5 GHz radio
- [ ] Assembled hardware: BME280 + BH1750 on I²C (D11 SDA, D12 SCL),
      moisture probe on A0, button between D2 and GND

---

## 1. Pre-flight: confirm the source tree

PlatformIO compiles **every** `.cpp` in `src/`. Two files defining `setup()`
and `loop()` is a duplicate-symbol link error.

```bash
ls firmware/src
```

Expected — exactly one `.cpp`:

```
HWmigrations.md
i2c_scan.cpp.example
main.cpp
mainold_amer.cpp.example
mainold_fable.cpp.example
```

If either reference revision still ends in `.cpp`, shelve it:

```bash
mv firmware/src/mainold_amer.cpp  firmware/src/mainold_amer.cpp.example
mv firmware/src/mainold_fable.cpp firmware/src/mainold_fable.cpp.example
```

Confirm `platformio.ini` has all five dependencies:

```ini
lib_deps =
  adafruit/Adafruit BME280 Library
  adafruit/Adafruit Unified Sensor
  claws/BH1750
  tzapu/WiFiManager
  bblanchon/ArduinoJson@^7.0.0
```

---

## 2. Confirm the backend is up

Before touching hardware, prove the target exists. Set the URL once:

```bash
API_URL="https://matpotlib-backend.bluefield-2206023f.eastus.azurecontainerapps.io"
curl -s -o /dev/null -w "%{http_code} in %{time_total}s\n" "$API_URL/health"
```

Expected: `200`. **The time may be 15–25 seconds** — the container runs at
`min-replicas 0`, so the first request after idle pays a cold start. This is
normal and is exactly why the firmware uses a 30 s read timeout.

Then confirm ingest is actually guarded:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API_URL/sensors/readings" \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `401`. Anything else means `DeviceTokenGuard` isn't in the path.

---

## 3. Provision the pot in Supabase

Generate a token and **keep the plaintext** — only its hash goes in the database.

```bash
openssl rand -hex 32
# or, if openssl isn't available:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this in the Supabase SQL editor. Replace both placeholders — the claim code
is what gets printed on the pot and typed into the app:

```sql
WITH new_device AS (
  INSERT INTO devices (name, claim_code)
  VALUES ('MatPot #1', 'POT-0001')
  RETURNING id
)
INSERT INTO device_secrets (device_id, secret_hash)
SELECT id, encode(digest('YOUR-PLAINTEXT-TOKEN', 'sha256'), 'hex')
FROM new_device
RETURNING device_id;
```

**Record three values:**

| Value | Goes where |
|---|---|
| returned `device_id` (uuid) | `secrets.h` → `DEVICE_ID` |
| your plaintext token | `secrets.h` → `DEVICE_TOKEN` |
| `POT-0001` | printed on the pot; typed into the app to claim |

---

## 4. Verify the credential before you flash it

This isolates "is my token right" from "is my firmware right." Do it now — it
takes ten seconds and saves a reflash cycle.

```bash
curl -i -X POST "$API_URL/sensors/readings" \
  -H "Content-Type: application/json" \
  -H "x-device-token: YOUR-PLAINTEXT-TOKEN" \
  -d '{"device_id":"YOUR-UUID","moisture":42.0,"temp_c":22.5,"humidity":55.0,"lux":800.0}'
```

Expected: `201` and `{"ok":true}`.

- `401` → the token doesn't hash to what's in `device_secrets`, or the
  `device_id` doesn't match the row. Re-run step 3.
- `400` → the body was rejected; the response names the offending field.

A `201` here also means a real row is now in `sensor_readings`. Delete it if you
want a clean chart:

```sql
DELETE FROM sensor_readings WHERE device_id = 'YOUR-UUID';
```

---

## 5. Fill in `secrets.h`

```bash
cd firmware
cp include/secrets.h.example include/secrets.h
```

Edit `include/secrets.h`:

```c
#define API_URL      "https://matpotlib-backend.bluefield-2206023f.eastus.azurecontainerapps.io"
#define DEVICE_ID    "the-uuid-from-step-3"
#define DEVICE_TOKEN "your-plaintext-token"
```

- **No trailing slash** on `API_URL` — the firmware appends `/sensors/readings`.
- WiFi credentials are deliberately absent. The portal handles them in step 7.
- `secrets.h` is git-ignored. Verify with `git status` that it does not appear.

---

## 6. Build and flash

```bash
cd firmware
pio run                 # compile only — catch errors before touching the board
pio run -t upload
pio device monitor
```

If upload fails to find the port, double-tap the Nano ESP32's reset button to
force bootloader mode, then retry.

---

## 7. First boot — join the pot to WiFi

With no saved credentials, the device opens a hotspot.

1. On a phone, join the WiFi network **`PlantMonitor-Setup`**
2. A captive portal opens (if not, browse to `192.168.4.1`)
3. Tap **Configure WiFi**, choose your 2.4 GHz network, enter the password
4. The device saves the credentials and reboots

**LED reference:**

| LED | Meaning |
|---|---|
| Fast blink (~3/s) | Config portal open, waiting for setup |
| Slow blink (~1/s) | Trying to connect / reconnect |
| Solid | Connected |

Credentials persist across reboots and reflashes. To wipe them, hold the D2
button for 3 seconds, or `curl -X POST http://plantmonitor.local/reset-wifi`.

---

## 8. Verify the serial output

Expected on the monitor:

```
---- MatPotLib ----
Device : 3f2a....
Backend: https://matpotlib-backend....
BME280 : OK @ 0x76
BH1750 : OK
-------------------
WiFi connected, IP: 192.168.1.42
mDNS: plantmonitor.local
Local debug server on :80
[post] OK 201
```

The firmware posts **immediately on boot**, so you get a pass/fail on the whole
path without waiting 15 minutes. After that it samples every 30 s and posts
every 15 min.

---

## 9. Verify the row landed

Supabase → Table Editor → `sensor_readings`, filter `device_id` = your uuid.

You should see one row with a server-stamped `ts`. Also check `devices` — the
row's `status` should now read `online` and `last_seen_at` should be current
(`SensorsService.insert` updates both on every ingest).

---

## 10. Claim the pot in the app

1. Open the app, sign in (or sign up)
2. Settings → **Claim Device**
3. Enter the claim code from step 3, e.g. `POT-0001`
4. Add a plant and assign it a **species** — this is required

> Alert evaluation resolves device → owner → plant → species → ideal ranges.
> With no species assigned, `AlertsService.evaluate()` returns early and you
> will never get an alert, even with wildly out-of-range readings.

One device per user — a second claim by the same user is rejected.

---

## 11. Calibrate the soil probe

**Until you do this, the moisture percentages reaching Azure are wrong**, which
means alerts compare meaningless numbers against the species ranges.

`DRY_RAW` and `WET_RAW` in `main.cpp` are placeholder guesses (3200 / 1400).

1. With the pot on WiFi, open `http://plantmonitor.local/data`
   (or `http://<device-ip>/data`)
2. Probe **in dry air** → record `soil_raw`
3. Probe **submerged to the line, not past it** → record `soil_raw`
4. Put both into `main.cpp`:

```c
static const int DRY_RAW = 3200;  // <- your dry-air reading
static const int WET_RAW = 1400;  // <- your submerged reading
```

5. `pio run -t upload` again

Sanity check afterward: dry air should report near `0.0%`, submerged near
`100.0%`, and potted soil somewhere in between.

---

## Local debug endpoints

Bench use only. The mobile app never talks to these — it reads from Azure.
The pot is behind NAT on a home network and has no public address.

| Endpoint | Returns |
|---|---|
| `GET /data` | Latest readings **including raw ADC**, plus the current calibration constants |
| `GET /status` | Device id, SSID, IP, RSSI, uptime, sensor init state, seconds since last post |
| `POST /reset-wifi` | Wipes credentials and reboots into the portal |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `multiple definition of setup()` at link time | Two `.cpp` in `src/` | Step 1 — rename `mainold.cpp` |
| `secrets.h: No such file` | Only the `.example` exists | Step 5 — copy and fill it |
| `BME280 : NOT FOUND` | Wrong I²C wiring or address | Flash `i2c_scan.cpp.example` to list live addresses; check D11/D12 and 3.3 V |
| `[post] rejected 401` | Token doesn't hash to the stored value, or wrong `device_id` | Re-run step 4 with curl to isolate |
| `[post] rejected 400` | Body failed DTO validation | Read the logged response — it names the field |
| `[post] attempt 1/2 failed: -1` then OK | Azure cold start | Normal. `-1` is a client-side timeout; the retry usually lands |
| Both attempts fail with `-11`/`-1` | Read timeout too short, or no route out | Confirm step 2 still returns 200 from the same network |
| Portal never appears | Credentials already saved | Hold D2 for 3 s to wipe |
| Connects then immediately drops | 5 GHz network selected | ESP32 is 2.4 GHz only |
| Readings arrive but no alerts | No species on the plant | Step 10 — assign a species |
| Moisture always 0 % or 100 % | Uncalibrated `DRY_RAW`/`WET_RAW` | Step 11 |
| WiFiManager fails to compile | Library lags newer arduino-esp32 cores | Pin the core in `platformio.ini`, e.g. `platform = espressif32@6.5.0` |

---

## Known caveats

- **`client.setInsecure()`** — TLS runs without certificate validation, so
  anyone able to MITM the pot's WiFi can lift the device token. Acceptable for
  the MVP; should be closed for SD2 by pinning the CA bundle.
- **No idempotency on ingest.** A retry after a timeout that actually succeeded
  inserts a duplicate row. Currently harmless — it slightly skews a chart. If
  retry logic gets more aggressive, add a client-generated reading id plus a
  unique constraint.
- **`takeSample()` blocks ~2.2 s** (11 samples × 200 ms). The local HTTP server
  is unresponsive during that window, once every 30 s. Bench-only impact.
- **Pressure is read but not stored.** The BME280 reports it and `/data` exposes
  it, but `sensor_readings` has no column, so `whitelist: true` would strip it —
  the firmware doesn't bother sending it. Adding it means a migration, a DTO
  field, and a species range to compare against.
- **`DEPLOYMENT.md` §3.5 drift** — it names the container app `matpotlib-api`,
  but the deployed one is `matpotlib-backend`. Use the URL in step 2.
