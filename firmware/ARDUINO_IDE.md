# Firmware handoff — Arduino IDE

For the hardware lead. The repo is set up for PlatformIO; this is the
equivalent path in Arduino IDE 2.x.

Goal: get the pot posting readings to the deployed backend, then calibrate
the soil probe.

---

## What you should have been given

| Item | Notes |
|---|---|
| `main.cpp` | the firmware — 414 lines |
| `secrets.h` | **sent separately** — it is git-ignored and will NOT be in the repo |
| this file | |

You do **not** need `platformio.ini`, `mainold_*.cpp.example`, or
`HWmigrations.md` (that one is the PlatformIO version of these steps).

`i2c_scan.cpp.example` is worth having — it is the fallback if the sensors
don't show up in step 6.

---

## 1. Board support

Arduino IDE → **Boards Manager** → install **"Arduino ESP32 Boards"** by Arduino.

Then **Tools → Board → Arduino ESP32 Boards → Arduino Nano ESP32**.

## 2. Libraries

**Library Manager**, install all five:

- Adafruit BME280 Library
- Adafruit Unified Sensor
- BH1750 *(by Christopher Laws)*
- WiFiManager *(by tzapu)*
- **ArduinoJson 7.x** *(by Benoît Blanchon)*

> **ArduinoJson must be version 7.** The code uses the v7 `JsonDocument` API.
> Version 6 uses `StaticJsonDocument<N>` and will not compile. If Library
> Manager offers 6.x, pick 7.x explicitly from the version dropdown.

## 3. Make it a sketch

Arduino IDE needs a `.ino` inside a folder of the same name:

```
MatPotLib/
  MatPotLib.ino     <- main.cpp, renamed
  secrets.h         <- alongside it, same folder
```

Files in the sketch folder are compiled automatically, so `#include "secrets.h"`
resolves with no extra setup.

Do not put any other `.cpp` in this folder — the archived revisions each define
their own `setup()` and `loop()` and will collide.

## 4. Compile before you wire anything

**Sketch → Verify** (the ✓ button). Do this before touching hardware — it
separates "code problem" from "wiring problem".

Expect success. If it fails, see Troubleshooting.

## 5. Wiring

| Component | Connection |
|---|---|
| BME280 | I²C — see the pin warning below |
| BH1750 | same I²C bus |
| Soil probe AOUT | `A0` |
| Reset button | between `D2` and `GND` |
| Sensor power | 3.3 V and GND rails |

> ### Pin warning — check this before wiring
>
> The code passes **raw GPIO numbers**, not silkscreen labels:
>
> ```c
> static const int PIN_SDA = 11;   // comment in the source says "D11"
> static const int PIN_SCL = 12;
> ```
>
> `Wire.begin(11, 12)` uses **GPIO 11 and GPIO 12**. On the Nano ESP32
> (ESP32-S3) the silkscreen `D` labels do **not** map 1:1 onto GPIO numbers,
> so the "D11 / D12" comments in the source may be wrong.
>
> **Wire to whichever header pins are GPIO 11 and GPIO 12** on Arduino's
> official Nano ESP32 pinout — on that board these are believed to surface at
> the **A4 / A5** pins, which are the default I²C bus.
>
> If step 6 prints `BME280 : NOT FOUND`, this is the first thing to check.
> Flash `i2c_scan.cpp.example` to list whatever is actually responding.
>
> Once you confirm the correct pins, tell the software side — the constants
> should be corrected in the repo so nobody hits this twice.

## 6. Upload and watch

**Upload** (→ button), then **Tools → Serial Monitor at 115200 baud**.

Expected:

```
---- MatPotLib ----
Device : fbd00dc2-...
Backend: https://matpotlib-backend....
BME280 : OK @ 0x76
BH1750 : OK
-------------------
```

`0x76` or `0x77` are both fine — the firmware auto-detects.

## 7. Join WiFi

On first boot the device opens its own hotspot.

1. On a phone, join **`PlantMonitor-Setup`**
2. A captive portal opens (if not, browse to `192.168.4.1`)
3. **Configure WiFi** → pick the network → enter password
4. Device saves and reboots

**Use a phone hotspot, not apartment or campus WiFi.** Managed networks
usually require registering each device through a browser page, which the
ESP32 cannot do — it will join the SSID and then silently fail to reach the
internet.

The ESP32 has **no 5 GHz radio**. The network must be 2.4 GHz.

LED: fast blink = portal open · slow blink = connecting · solid = connected.

To wipe credentials: hold the `D2` button for 3 seconds.

## 8. Confirm it posts

The firmware posts immediately on boot, so you get a verdict in seconds
rather than waiting 15 minutes.

```
[post] OK 201
```

That means the reading reached the cloud. You're done with the network path.

`[post] attempt 1/2 failed: -1` followed by success is **normal** — the server
sleeps when idle and takes ~20 s to wake. The retry usually lands.

## 9. Calibrate the soil probe  ← the deliverable

Until this is done every moisture percentage is wrong, which makes the app's
alerts wrong. `DRY_RAW` / `WET_RAW` in the source are placeholder guesses,
not measurements.

Watch the Serial Monitor. Every 30 s it prints:

```
[sample] 22.4C  55.1%rh  812.0lux  soil:2847 -> 41.2%
                                        ^^^^ this number
```

1. Hold the probe in **dry air** → note `soil:` → this is `DRY_RAW`
2. **Submerge to the line, not past it** → note `soil:` → this is `WET_RAW`
3. Edit the two lines near the top of the sketch:

```c
static const int DRY_RAW = 3200;  // <- your dry-air number
static const int WET_RAW = 1400;  // <- your submerged number
```

4. Upload again
5. Check: dry air ≈ 0 %, submerged ≈ 100 %, potted soil somewhere between

Dry reads a **higher** number than wet — that is expected for a capacitive
probe, and the code handles it.

**Send both numbers back to the software side** so they get committed to the
repo. Otherwise the next person to flash starts from the guesses again.

---

## Local debug endpoints

Once on WiFi, from a browser on the same network:

| URL | Shows |
|---|---|
| `http://plantmonitor.local/data` | latest readings incl. raw ADC + current calibration |
| `http://plantmonitor.local/status` | device id, SSID, IP, signal, uptime |

Use the device's IP directly if `.local` doesn't resolve.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `'JsonDocument' does not name a type` | ArduinoJson 6 installed | Step 2 — switch to 7.x |
| `secrets.h: No such file` | not in the sketch folder | Step 3 |
| `multiple definition of setup()` | another `.cpp` in the folder | remove it |
| `BME280 : NOT FOUND` | I²C pins or wiring | Step 5 pin warning; run the I²C scanner |
| Upload can't find the port | board not in bootloader | double-tap the reset button, retry |
| Portal never appears | credentials already saved | hold `D2` for 3 s |
| Connects, then drops | 5 GHz network | ESP32 is 2.4 GHz only |
| `[post] rejected 401` | wrong token / device id | software side re-issues `secrets.h` |
| `[post] rejected 400` | body failed validation | read the logged message, send it on |
| Both attempts fail `-1` | no route to the internet | usually the captive-portal network problem in step 7 |
| Moisture always 0 % or 100 % | uncalibrated | Step 9 |
