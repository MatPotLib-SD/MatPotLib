// MatPotLib firmware — Arduino Nano ESP32
//
// Reads soil moisture (A0), BME280 (I2C temp/humidity/pressure), BH1750 (I2C lux),
// and POSTs a reading to the MatPotLib backend every 15 minutes over HTTPS.
//
// WiFi credentials are NOT compiled in. On first boot (or after a credential
// wipe) the device opens a captive portal named PORTAL_SSID; join it from a
// phone and pick the household network. Credentials persist across reboots.
//
// A small local HTTP server is also exposed for bench debugging only:
//   GET  /data        latest readings, including RAW soil ADC (use to calibrate)
//   GET  /status      wifi + uptime
//   POST /reset-wifi  wipe credentials and reboot into the portal
// The mobile app never talks to this — it reads from the Azure backend.
//
// Wiring (PDD Fig 4): moisture AOUT -> A0; BME280 + BH1750 share I2C
// (D11 SDA, D12 SCL); sensors on 3.3V/GND rails. Reset button D2 -> GND.

#include <Wire.h>
#include <math.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "secrets.h"   // API_URL, DEVICE_ID, DEVICE_TOKEN — git-ignored

// ── Pins ─────────────────────────────────────────────────────────────────────
static const int PIN_SDA        = 11;  // D11
static const int PIN_SCL        = 12;  // D12
static const int PIN_SOIL       = A0;
static const int PIN_RESET_BTN  = 2;   // button between D2 and GND
static const int PIN_STATUS_LED = 13;  // built-in LED

// ── Soil moisture calibration ────────────────────────────────────────────────
// 12-bit ADC (0-4095). Read the raw value from GET /data with the probe in dry
// air, then submerged to the line, and put those two numbers here.
static const int DRY_RAW = 3200;  // TODO calibrate: probe in dry air
static const int WET_RAW = 1400;  // TODO calibrate: probe in water

// ── Sampling ─────────────────────────────────────────────────────────────────
static const int NUM_SAMPLES = 11;   // odd, for a clean median
static const int TRIM_COUNT  = 2;    // discarded from each end
static const unsigned long SAMPLE_INTERVAL_MS = 200;

// Sample often so /data stays fresh on the bench; post on the backend's cadence.
static const unsigned long SAMPLE_EVERY_MS = 30UL * 1000UL;
static const unsigned long POST_EVERY_MS   = 15UL * 60UL * 1000UL;

// ── Network / portal ─────────────────────────────────────────────────────────
#define PORTAL_SSID    "PlantMonitor-Setup"
#define MDNS_NAME      "plantmonitor"   // reachable at plantmonitor.local
#define RESET_HOLD_MS  3000             // hold button 3s to wipe credentials
#define PORTAL_TIMEOUT 180              // seconds before the portal gives up

// Azure Container Apps runs with min-replicas 0, so the first request after an
// idle period has to wait for a cold start (~25s). The HTTPClient default of 5s
// would fail every time the pot is the thing waking the container up.
static const uint16_t CONNECT_TIMEOUT_MS = 15000;
static const uint16_t READ_TIMEOUT_MS    = 30000;
static const int      POST_ATTEMPTS      = 2;

// ── Globals ──────────────────────────────────────────────────────────────────
Adafruit_BME280 bme;
BH1750          lightMeter;
uint8_t         bmeAddress = 0x76;
WebServer       server(80);
WiFiManager     wifiManager;
bool            portalActive = false;
bool            bmeOk = false, bhOk = false;

struct Readings {
  float tempC    = NAN;
  float humidity = NAN;
  float pressure = NAN;   // hPa — exposed locally, not stored by the backend
  float lux      = NAN;
  int   soilRaw  = 0;     // raw ADC — exposed locally for calibration
  float moisture = NAN;   // calibrated percent — this is what the backend gets
  bool  valid    = false;
} latest;

unsigned long lastSample = 0;
unsigned long lastPost   = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────
static void sortFloats(float* a, int n) {
  for (int i = 1; i < n; i++) {
    float k = a[i]; int j = i - 1;
    while (j >= 0 && a[j] > k) { a[j + 1] = a[j]; j--; }
    a[j + 1] = k;
  }
}

static void sortInts(int* a, int n) {
  for (int i = 1; i < n; i++) {
    int k = a[i]; int j = i - 1;
    while (j >= 0 && a[j] > k) { a[j + 1] = a[j]; j--; }
    a[j + 1] = k;
  }
}

static float medianFloat(float* a, int n) {
  sortFloats(a, n);
  int inner = n - 2 * TRIM_COUNT;
  return a[TRIM_COUNT + inner / 2];
}

static int medianInt(int* a, int n) {
  sortInts(a, n);
  int inner = n - 2 * TRIM_COUNT;
  return a[TRIM_COUNT + inner / 2];
}

static float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// ── Sensor init ──────────────────────────────────────────────────────────────
static bool initBME280() {
  if (bme.begin(0x76)) { bmeAddress = 0x76; return true; }
  if (bme.begin(0x77)) { bmeAddress = 0x77; return true; }
  return false;
}

// ── Sampling ─────────────────────────────────────────────────────────────────
static void takeSample() {
  float tempS[NUM_SAMPLES], humS[NUM_SAMPLES], presS[NUM_SAMPLES], luxS[NUM_SAMPLES];
  int   soilS[NUM_SAMPLES];

  for (int i = 0; i < NUM_SAMPLES; i++) {
    tempS[i] = bmeOk ? bme.readTemperature()        : NAN;
    humS[i]  = bmeOk ? bme.readHumidity()           : NAN;
    presS[i] = bmeOk ? bme.readPressure() / 100.0F  : NAN;
    luxS[i]  = bhOk  ? lightMeter.readLightLevel()  : NAN;
    soilS[i] = analogRead(PIN_SOIL);
    delay(SAMPLE_INTERVAL_MS);
  }

  latest.tempC    = medianFloat(tempS, NUM_SAMPLES);
  latest.humidity = medianFloat(humS,  NUM_SAMPLES);
  latest.pressure = medianFloat(presS, NUM_SAMPLES);
  latest.lux      = medianFloat(luxS,  NUM_SAMPLES);
  latest.soilRaw  = medianInt(soilS,   NUM_SAMPLES);

  // Map raw ADC to the 0-100 percent the backend and species ranges speak in.
  latest.moisture = (float)(latest.soilRaw - DRY_RAW) * 100.0f /
                    (float)(WET_RAW - DRY_RAW);
  latest.moisture = clampf(latest.moisture, 0.0f, 100.0f);

  latest.valid = true;
}

// ── Backend ingest ───────────────────────────────────────────────────────────
// POST {API_URL}/sensors/readings  with header x-device-token.
// Body must match backend/src/sensors/dto/create-reading.dto.ts exactly:
// unknown keys are stripped and missing required keys are a 400.
static void postReading() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[post] skipped — no WiFi");
    return;
  }
  if (!latest.valid) {
    Serial.println("[post] skipped — no sample yet");
    return;
  }

  // Every field below is required and range-checked server-side. A failed
  // sensor yields NaN, which would serialize as invalid JSON and 400 — so
  // bail with a clear message instead of sending garbage.
  if (isnan(latest.tempC) || isnan(latest.humidity) ||
      isnan(latest.lux)   || isnan(latest.moisture)) {
    Serial.println("[post] skipped — sensor read failed (NaN); check wiring");
    return;
  }
  if (latest.lux < 0) {
    Serial.println("[post] skipped — BH1750 returned an error code");
    return;
  }

  // Clamp into the DTO's accepted ranges so a drifting sensor degrades into a
  // slightly wrong reading rather than a rejected one.
  float tempC    = clampf(latest.tempC,    -40.0f, 85.0f);
  float humidity = clampf(latest.humidity,   0.0f, 100.0f);
  float lux      = clampf(latest.lux,        0.0f, 200000.0f);
  float moisture = clampf(latest.moisture,   0.0f, 100.0f);

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["moisture"]  = serialized(String(moisture, 1));
  doc["temp_c"]    = serialized(String(tempC,    1));
  doc["humidity"]  = serialized(String(humidity, 1));
  doc["lux"]       = serialized(String(lux,      1));

  String body;
  serializeJson(doc, body);

  for (int attempt = 1; attempt <= POST_ATTEMPTS; attempt++) {
    WiFiClientSecure client;
    client.setInsecure();  // MVP only; no cert validation. See DEPLOYMENT.md TODO.

    HTTPClient http;
    http.setConnectTimeout(CONNECT_TIMEOUT_MS);
    http.setTimeout(READ_TIMEOUT_MS);
    http.begin(client, String(API_URL) + "/sensors/readings");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-token", DEVICE_TOKEN);

    int code = http.POST(body);

    if (code == 200 || code == 201) {
      Serial.printf("[post] OK %d\n", code);
      http.end();
      return;
    }

    // 401 = bad device token, 400 = body rejected. Neither is fixed by retrying.
    if (code == 400 || code == 401) {
      Serial.printf("[post] rejected %d — %s\n", code, http.getString().c_str());
      http.end();
      return;
    }

    Serial.printf("[post] attempt %d/%d failed: %d\n", attempt, POST_ATTEMPTS, code);
    http.end();
    if (attempt < POST_ATTEMPTS) delay(5000);  // likely a cold start; give it a moment
  }
}

// ── Local debug endpoints ────────────────────────────────────────────────────
static void handleData() {
  if (!latest.valid) {
    server.send(503, "application/json", "{\"error\":\"No readings yet\"}");
    return;
  }
  JsonDocument doc;
  doc["temp_c"]       = serialized(String(latest.tempC,    2));
  doc["humidity"]     = serialized(String(latest.humidity, 2));
  doc["pressure_hPa"] = serialized(String(latest.pressure, 2));
  doc["lux"]          = serialized(String(latest.lux,      2));
  doc["moisture"]     = serialized(String(latest.moisture, 2));
  doc["soil_raw"]     = latest.soilRaw;   // <- the number to calibrate against
  doc["dry_raw"]      = DRY_RAW;
  doc["wet_raw"]      = WET_RAW;
  doc["ip"]           = WiFi.localIP().toString();
  doc["rssi"]         = WiFi.RSSI();

  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

static void handleStatus() {
  JsonDocument doc;
  doc["device_id"]    = DEVICE_ID;
  doc["ssid"]         = WiFi.SSID();
  doc["ip"]           = WiFi.localIP().toString();
  doc["rssi"]         = WiFi.RSSI();
  doc["uptime_s"]     = millis() / 1000;
  doc["bme280"]       = bmeOk ? "ok" : "not found";
  doc["bh1750"]       = bhOk  ? "ok" : "not found";
  doc["bme_address"]  = bmeAddress;
  doc["api_url"]      = API_URL;
  doc["last_post_s"]  = lastPost ? (millis() - lastPost) / 1000 : -1;

  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

static void handleResetWiFi() {
  server.send(200, "application/json",
    "{\"message\":\"Resetting WiFi. Reconnect to " PORTAL_SSID "\"}");
  delay(500);
  wifiManager.resetSettings();
  ESP.restart();
}

static void handleNotFound() {
  server.send(404, "application/json", "{\"error\":\"Not found\"}");
}

// ── Portal callbacks ─────────────────────────────────────────────────────────
static void onPortalStart(WiFiManager* wm) {
  portalActive = true;
  Serial.println(">>> Config portal open — join: " PORTAL_SSID);
}

static void onPortalEnd() {
  portalActive = false;
  Serial.println(">>> Config portal closed");
}

// ── Status LED ───────────────────────────────────────────────────────────────
static void updateLED() {
  if (portalActive) {
    digitalWrite(PIN_STATUS_LED, (millis() / 300) % 2);   // fast blink = setup
  } else if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(PIN_STATUS_LED, HIGH);                   // solid = connected
  } else {
    digitalWrite(PIN_STATUS_LED, (millis() / 1000) % 2);  // slow blink = retrying
  }
}

// ── Reset button ─────────────────────────────────────────────────────────────
static void checkResetButton() {
  if (digitalRead(PIN_RESET_BTN) != LOW) return;

  unsigned long t = millis();
  Serial.println("Button held...");
  while (digitalRead(PIN_RESET_BTN) == LOW) {
    updateLED();
    if (millis() - t >= RESET_HOLD_MS) {
      Serial.println("Wiping WiFi credentials and rebooting...");
      wifiManager.resetSettings();
      ESP.restart();
    }
  }
}

// ── WiFi watchdog ────────────────────────────────────────────────────────────
static void checkWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("WiFi lost — attempting reconnect...");
  WiFi.reconnect();
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 10000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED
    ? "\nReconnected! IP: " + WiFi.localIP().toString()
    : "\nReconnect failed. Will retry next loop.");
}

// ── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_RESET_BTN,  INPUT_PULLUP);

  Wire.begin(PIN_SDA, PIN_SCL);
  bmeOk = initBME280();
  bhOk  = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

  Serial.println("---- MatPotLib ----");
  Serial.printf("Device : %s\n", DEVICE_ID);
  Serial.printf("Backend: %s\n", API_URL);
  Serial.printf("BME280 : %s", bmeOk ? "OK @ 0x" : "NOT FOUND");
  if (bmeOk) Serial.println(bmeAddress, HEX); else Serial.println();
  Serial.printf("BH1750 : %s\n", bhOk ? "OK" : "NOT FOUND");
  Serial.println("-------------------");

  wifiManager.setAPCallback(onPortalStart);
  wifiManager.setSaveConfigCallback(onPortalEnd);
  wifiManager.setConfigPortalTimeout(PORTAL_TIMEOUT);

  // Saved credentials first; if none or they fail, open the portal hotspot.
  if (!wifiManager.autoConnect(PORTAL_SSID)) {
    Serial.println("Portal timed out — rebooting.");
    ESP.restart();
  }

  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin(MDNS_NAME)) {
    Serial.println("mDNS: " MDNS_NAME ".local");
    MDNS.addService("http", "tcp", 80);
  }

  server.on("/data",       HTTP_GET,  handleData);
  server.on("/status",     HTTP_GET,  handleStatus);
  server.on("/reset-wifi", HTTP_POST, handleResetWiFi);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("Local debug server on :80");

  // First reading + first post immediately, so a fresh flash proves the whole
  // path end to end without waiting 15 minutes.
  takeSample();
  postReading();
  lastSample = millis();
  lastPost   = millis();
}

// ── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
  server.handleClient();
  checkResetButton();
  checkWiFiConnection();
  updateLED();

  if (millis() - lastSample >= SAMPLE_EVERY_MS) {
    lastSample = millis();
    takeSample();
    Serial.printf("[sample] %.1fC  %.1f%%rh  %.1flux  soil:%d -> %.1f%%\n",
      latest.tempC, latest.humidity, latest.lux, latest.soilRaw, latest.moisture);
  }

  if (millis() - lastPost >= POST_EVERY_MS) {
    lastPost = millis();
    postReading();
  }
}
